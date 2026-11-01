"""Session-scoped email-change requests and token-only confirmation."""

import logging
import secrets
from datetime import timedelta, timezone
from urllib.parse import quote, urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

try:
    from .auth import Role, current_user, get_db, normalize_email, require_roles, token_hash, utcnow
except ImportError:
    from auth import Role, current_user, get_db, normalize_email, require_roles, token_hash, utcnow


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth/email-change", tags=["email change"])
TOKEN_TTL = timedelta(minutes=15)
RATE_WINDOW = timedelta(hours=1)
MAX_REQUESTS_PER_WINDOW = 5
RESEND_COOLDOWN = timedelta(seconds=60)
MAX_RESENDS = 3
GENERIC_RESPONSE = {"message": "If this address can be used, verification instructions will be sent."}


def as_utc(value):
    # PyMongo returns naive UTC datetimes unless tz_aware is explicitly enabled.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class EmailChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_new_email(cls, value):
        return normalize_email(str(value))


class EmailChangeConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str

    @field_validator("token")
    @classmethod
    def validate_token(cls, value):
        if not 40 <= len(value) <= 256:
            raise ValueError("Invalid verification token")
        return value


def configured_public_origin(request: Request) -> str:
    base = getattr(request.app.state, "email_public_frontend_url", None)
    if not isinstance(base, str) or not base:
        raise HTTPException(status_code=503, detail="Email verification delivery is not configured")
    try:
        parsed = urlsplit(base)
        _ = parsed.port  # Force validation of malformed ports before trusting the configured origin.
        local_http = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
        if (parsed.scheme != "https" and not local_http) or not parsed.hostname:
            raise ValueError
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError
        if f"{parsed.scheme}://{parsed.netloc}" not in request.app.state.allowed_origins:
            raise ValueError
        if any(char in base for char in "\r\n"):
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=503, detail="Email verification delivery is not configured")
    return base.rstrip("/")


def delivery_provider(request: Request):
    delivery = getattr(request.app.state, "email_delivery", None)
    if delivery is None or not getattr(delivery, "is_configured", False):
        raise HTTPException(status_code=503, detail="Email verification delivery is not configured")
    return delivery


async def consume_request_limit(db, user_id: str, now):
    window_start = now - RATE_WINDOW
    increment = await db.users.update_one(
        {
            "id": user_id,
            "emailChangeRateWindowStartedAt": {"$gt": window_start},
            "emailChangeRateCount": {"$in": list(range(1, MAX_REQUESTS_PER_WINDOW))},
        },
        {"$inc": {"emailChangeRateCount": 1}},
    )
    if increment.matched_count == 1:
        return
    reset = await db.users.update_one(
        {
            "id": user_id,
            "$or": [
                {"emailChangeRateWindowStartedAt": {"$lte": window_start}},
                {"emailChangeRateWindowStartedAt": None},
            ],
        },
        {"$set": {"emailChangeRateWindowStartedAt": now, "emailChangeRateCount": 1}},
    )
    if reset.matched_count != 1:
        raise HTTPException(
            status_code=429,
            detail="Email change request limit reached. Try again later.",
            headers={"Retry-After": str(int(RATE_WINDOW.total_seconds()))},
        )


def verification_url(base: str, token: str) -> str:
    # Keep the bearer token in the URL fragment so browser HTTP requests,
    # frontend-server access logs, and Referer headers do not receive it.
    return f"{base}/verify-email-change#token={quote(token, safe='')}"


async def send_verification(delivery, recipient: str, link: str):
    try:
        await delivery.send_email_change(recipient, link)
    except Exception:
        # Never log exception text, recipient address, or verification URL/token.
        logger.warning("Hospot email verification delivery failed")
        raise HTTPException(status_code=503, detail="Verification email could not be sent. Please try again later.")


async def discard_pending_if_current(db, user_id: str, digest: str):
    try:
        await db.users.update_one(
            {"id": user_id, "pendingEmailChange.tokenHash": digest},
            {"$unset": {"pendingEmailChange": ""}},
        )
    except Exception:
        # The pending token expires in 15 minutes even if cleanup is unavailable.
        logger.warning("Hospot pending email-change cleanup failed")


@router.get("")
async def email_change_status(
    user=Depends(require_roles(Role.PATIENT)), db=Depends(get_db),
):
    pending = user.get("pendingEmailChange")
    now = utcnow()
    if not pending or pending.get("consumedAt") is not None or as_utc(pending["expiresAt"]) <= now:
        return {"pending": False}
    return {
        "pending": True,
        "email": pending["email"],
        "expiresAt": as_utc(pending["expiresAt"]),
        "resendAvailableAt": as_utc(pending["lastSentAt"]) + RESEND_COOLDOWN,
    }


@router.post("/request", status_code=status.HTTP_202_ACCEPTED)
async def request_email_change(
    payload: EmailChangeRequest,
    request: Request,
    user=Depends(require_roles(Role.PATIENT)),
    db=Depends(get_db),
    delivery=Depends(delivery_provider),
):
    origin = configured_public_origin(request)
    now = utcnow()
    await consume_request_limit(db, user["id"], now)
    email = normalize_email(str(payload.email))
    # Keep the outward response identical for current and already-used addresses.
    if email == normalize_email(user["email"]) or await db.users.find_one({"emailNormalized": email}):
        return GENERIC_RESPONSE

    raw_token = secrets.token_urlsafe(48)
    digest = token_hash(raw_token)
    pending = {
        "tokenHash": digest,
        "email": email,
        "emailNormalized": email,
        "createdAt": now,
        "expiresAt": now + TOKEN_TTL,
        "lastSentAt": now,
        "resendCount": 0,
        "consumedAt": None,
    }
    result = await db.users.update_one(
        {
            "id": user["id"], "active": True,
            "$or": [
                {"pendingEmailChange.createdAt": {"$lt": now}},
                {"pendingEmailChange.createdAt": None},
            ],
        },
        {"$set": {"pendingEmailChange": pending}},
    )
    if result.matched_count != 1:
        # A later-started request already replaced this one.
        return GENERIC_RESPONSE

    try:
        await send_verification(delivery, email, verification_url(origin, raw_token))
    except HTTPException:
        await discard_pending_if_current(db, user["id"], digest)
        raise
    return GENERIC_RESPONSE


@router.post("/resend", status_code=status.HTTP_202_ACCEPTED)
async def resend_email_change(
    request: Request,
    user=Depends(require_roles(Role.PATIENT)),
    db=Depends(get_db),
    delivery=Depends(delivery_provider),
):
    origin = configured_public_origin(request)
    now = utcnow()
    await consume_request_limit(db, user["id"], now)
    pending = user.get("pendingEmailChange")
    if not pending or pending.get("consumedAt") is not None or as_utc(pending["expiresAt"]) <= now:
        return GENERIC_RESPONSE
    if pending.get("resendCount", 0) >= MAX_RESENDS:
        raise HTTPException(status_code=429, detail="Resend limit reached. Request a new email change.")
    cooldown_end = as_utc(pending["lastSentAt"]) + RESEND_COOLDOWN
    if cooldown_end > now:
        retry_after = max(1, int((cooldown_end - now).total_seconds()))
        raise HTTPException(status_code=429, detail="Please wait before requesting another email.", headers={"Retry-After": str(retry_after)})

    raw_token = secrets.token_urlsafe(48)
    digest = token_hash(raw_token)
    old_digest = pending["tokenHash"]
    new_expiry = now + TOKEN_TTL
    result = await db.users.update_one(
        {
            "id": user["id"], "active": True,
            "pendingEmailChange.tokenHash": old_digest,
            "pendingEmailChange.expiresAt": {"$gt": now},
            "pendingEmailChange.consumedAt": None,
            "pendingEmailChange.lastSentAt": {"$lte": now - RESEND_COOLDOWN},
            "pendingEmailChange.resendCount": {"$lt": MAX_RESENDS},
        },
        {"$set": {
            "pendingEmailChange.tokenHash": digest,
            "pendingEmailChange.lastSentAt": now,
            "pendingEmailChange.expiresAt": new_expiry,
        }, "$inc": {"pendingEmailChange.resendCount": 1}},
    )
    if result.matched_count != 1:
        return GENERIC_RESPONSE
    try:
        await send_verification(delivery, pending["email"], verification_url(origin, raw_token))
    except HTTPException:
        await discard_pending_if_current(db, user["id"], digest)
        raise
    return GENERIC_RESPONSE


@router.post("/confirm")
async def confirm_email_change(
    payload: EmailChangeConfirmation,
    db=Depends(get_db),
):
    digest = token_hash(payload.token)
    now = utcnow()
    record = await db.users.find_one({"pendingEmailChange.tokenHash": digest, "active": True})
    if not record:
        raise HTTPException(status_code=400, detail="This verification link is invalid, expired, or superseded.")
    pending = record["pendingEmailChange"]
    if pending.get("consumedAt") is not None:
        raise HTTPException(status_code=409, detail="This verification link has already been used.")
    if as_utc(pending["expiresAt"]) <= now:
        raise HTTPException(status_code=410, detail="This verification link has expired. Request a new one.")

    email = pending["email"]
    if await db.users.find_one({"emailNormalized": pending["emailNormalized"], "id": {"$ne": record["id"]}}):
        raise HTTPException(status_code=409, detail="This email address is no longer available. Request a new change.")
    try:
        updated = await db.users.update_one(
            {
                "id": record["id"], "active": True,
                "pendingEmailChange.tokenHash": digest,
                "pendingEmailChange.expiresAt": {"$gt": now},
                "pendingEmailChange.consumedAt": None,
            },
            {"$set": {
                "email": email,
                "emailNormalized": pending["emailNormalized"],
                "pendingEmailChange.consumedAt": now,
            }},
        )
    except Exception as exc:
        if getattr(exc, "code", None) == 11000:
            raise HTTPException(status_code=409, detail="This email address is no longer available. Request a new change.") from exc
        logger.warning("Hospot email-change confirmation update failed")
        raise HTTPException(status_code=503, detail="Email change could not be confirmed. Please retry.")
    if updated.matched_count != 1:
        latest = await db.users.find_one({"id": record["id"]})
        current = (latest or {}).get("pendingEmailChange") or {}
        if current.get("tokenHash") == digest and current.get("consumedAt") is not None:
            raise HTTPException(status_code=409, detail="This verification link has already been used.")
        if current.get("tokenHash") == digest and as_utc(current["expiresAt"]) <= utcnow():
            raise HTTPException(status_code=410, detail="This verification link has expired. Request a new one.")
        raise HTTPException(status_code=400, detail="This verification link is invalid, expired, or superseded.")
    return {"message": "Email address verified successfully.", "email": email}
