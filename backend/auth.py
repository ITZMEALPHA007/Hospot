"""Authentication and account lifecycle for HOSPOT's FastAPI application."""

import asyncio
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

SESSION_COOKIE = "hospot_session"
CSRF_COOKIE = "hospot_csrf"
SESSION_TTL = timedelta(hours=12)
INVITATION_TTL = timedelta(hours=48)
router = APIRouter(prefix="/api/auth", tags=["authentication"])


class Role(str, Enum):
    PATIENT = "PATIENT"
    DOCTOR = "DOCTOR"
    HOSPITAL_ADMIN = "HOSPITAL_ADMIN"
    PLATFORM_ADMIN = "PLATFORM_ADMIN"


class PublicUser(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Role
    hospitalId: Optional[str] = None
    profilePictureUrl: Optional[str] = None
    phoneNumber: Optional[str] = None


class PatientRegistration(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must contain at least two non-space characters")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class InvitationRequest(BaseModel):
    email: EmailStr
    role: Role
    hospitalId: Optional[str] = None

    @model_validator(mode="after")
    def validate_invited_role_scope(self):
        if self.role not in (Role.DOCTOR, Role.HOSPITAL_ADMIN):
            raise ValueError("Only doctor and hospital administrator invitations are supported")
        if self.role == Role.HOSPITAL_ADMIN and not self.hospitalId:
            raise ValueError("Hospital administrator invitations require a hospital")
        if self.role == Role.DOCTOR and not self.hospitalId:
            raise ValueError("Doctor invitations require a hospital")
        return self


class InvitationRegistration(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    email: EmailStr
    name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must contain at least two non-space characters")
        return value


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    phoneNumber: Optional[str] = Field(default=None, max_length=32)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        if value is None:
            return value
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must contain at least two non-space characters")
        return value

    @field_validator("phoneNumber")
    @classmethod
    def normalize_phone_number(cls, value):
        if value is None:
            return None
        compact = re.sub(r"[\s-]", "", value.strip())
        if compact.startswith("+91"):
            national = compact[3:]
        elif compact.startswith("+"):
            raise ValueError("Only Indian mobile numbers are supported")
        else:
            national = compact
        if not re.fullmatch(r"[6-9][0-9]{9}", national):
            raise ValueError("Enter a valid 10-digit Indian mobile number, optionally prefixed with +91")
        return f"+91{national}"

    @model_validator(mode="after")
    def require_profile_update(self):
        if not self.model_fields_set:
            raise ValueError("At least one profile field must be supplied")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Name cannot be null")
        return self


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    """Hash passwords with scrypt; the stored value includes its random salt."""
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=64)
    return f"scrypt$16384$8$1${salt.hex()}${digest.hex()}"


DUMMY_PASSWORD_HASH = hash_password("not-a-real-user-password")


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt_hex, expected_hex = encoded.split("$")
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(
            password.encode("utf-8"), salt=bytes.fromhex(salt_hex),
            n=int(n), r=int(r), p=int(p), dklen=len(bytes.fromhex(expected_hex)),
        )
        return hmac.compare_digest(actual.hex(), expected_hex)
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def public_user(account: Dict[str, Any]) -> PublicUser:
    picture_url = None
    if account.get("profilePictureKey"):
        version = account.get("profilePictureVersion") or "saved"
        picture_url = f"/auth/me/profile-picture?v={version}"
    return PublicUser(
        id=account["id"], email=account["email"], name=account["name"],
        role=account["role"], hospitalId=account.get("hospitalId"),
        profilePictureUrl=picture_url,
        phoneNumber=account.get("phoneNumber") if account.get("role") == Role.PATIENT.value else None,
    )


def get_db(request: Request):
    database = getattr(request.app.state, "db", None)
    if database is None:
        raise RuntimeError("Database is not initialized; use the application lifespan before serving requests.")
    return database


async def current_user(request: Request, db=Depends(get_db)) -> Dict[str, Any]:
    raw_token = request.cookies.get(SESSION_COOKIE)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    session = await db.sessions.find_one({"tokenHash": token_hash(raw_token), "expiresAt": {"$gt": utcnow()}})
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid")
    account = await db.users.find_one({"id": session["userId"], "active": True})
    if not account:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable")
    return account


def require_roles(*roles: Role):
    async def role_dependency(user=Depends(current_user)):
        if user.get("role") not in {role.value for role in roles}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return role_dependency


def cookie_options(request: Request) -> dict:
    secure = request.app.state.session_cookie_secure
    return {"httponly": True, "secure": secure, "samesite": "lax", "path": "/"}


def set_csrf_cookie(request: Request, response: Response) -> str:
    token = secrets.token_urlsafe(32)
    response.set_cookie(CSRF_COOKIE, token, httponly=False, secure=request.app.state.session_cookie_secure,
                        samesite="lax", max_age=int(SESSION_TTL.total_seconds()), path="/")
    return token


@router.get("/csrf")
async def csrf_token(request: Request, response: Response):
    return {"csrfToken": set_csrf_cookie(request, response)}


@router.post("/register", response_model=PublicUser, status_code=status.HTTP_201_CREATED)
async def register_patient(payload: PatientRegistration, request: Request, response: Response, db=Depends(get_db)):
    email = normalize_email(str(payload.email))
    if await db.users.find_one({"emailNormalized": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    account = {
        "id": secrets.token_urlsafe(18), "email": email, "emailNormalized": email,
        "name": payload.name.strip(), "passwordHash": await asyncio.to_thread(hash_password, payload.password),
        "role": Role.PATIENT.value, "active": True, "createdAt": utcnow(),
    }
    try:
        await db.users.insert_one(account)
    except Exception as exc:
        if getattr(exc, "code", None) == 11000:
            raise HTTPException(status_code=409, detail="An account with this email already exists") from exc
        raise
    await create_session(account, request, response, db)
    return public_user(account)


@router.post("/register/invited", response_model=PublicUser, status_code=status.HTTP_201_CREATED)
async def register_invited(payload: InvitationRegistration, request: Request, response: Response, db=Depends(get_db)):
    invitation = await db.invitations.find_one({
        "tokenHash": token_hash(payload.token), "emailNormalized": normalize_email(str(payload.email)),
        "usedAt": None, "expiresAt": {"$gt": utcnow()},
    })
    if not invitation:
        raise HTTPException(status_code=400, detail="Invitation is invalid or expired")
    if invitation.get("role") in (Role.DOCTOR.value, Role.HOSPITAL_ADMIN.value) and not invitation.get("hospitalId"):
        raise HTTPException(status_code=400, detail="Invitation is invalid or expired")
    if invitation.get("hospitalId"):
        hospital = await db.hospitals.find_one({"id": invitation["hospitalId"]})
        if not hospital or hospital.get("active") is False:
            raise HTTPException(status_code=400, detail="Invitation is invalid or expired")
    email = invitation["emailNormalized"]
    if await db.users.find_one({"emailNormalized": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    account = {
        "id": secrets.token_urlsafe(18), "email": email, "emailNormalized": email,
        "name": payload.name.strip(), "passwordHash": await asyncio.to_thread(hash_password, payload.password),
        "role": invitation["role"], "hospitalId": invitation.get("hospitalId"),
        "active": True, "createdAt": utcnow(),
    }
    try:
        await db.users.insert_one(account)
    except Exception as exc:
        if getattr(exc, "code", None) == 11000:
            raise HTTPException(status_code=409, detail="An account with this email already exists") from exc
        raise
    await db.invitations.update_one({"_id": invitation["_id"], "usedAt": None}, {"$set": {"usedAt": utcnow()}})
    await create_session(account, request, response, db)
    return public_user(account)


async def create_session(account: Dict[str, Any], request: Request, response: Response, db):
    token = secrets.token_urlsafe(48)
    now = utcnow()
    await db.sessions.insert_one({
        "id": secrets.token_urlsafe(18), "tokenHash": token_hash(token),
        "userId": account["id"], "createdAt": now, "expiresAt": now + SESSION_TTL,
    })
    response.set_cookie(SESSION_COOKIE, token, max_age=int(SESSION_TTL.total_seconds()), **cookie_options(request))


@router.post("/login", response_model=PublicUser)
async def login(payload: LoginRequest, request: Request, response: Response, db=Depends(get_db)):
    email = normalize_email(str(payload.email))
    account = await db.users.find_one({"emailNormalized": email, "active": True})
    # Perform a comparable password hash even for unknown accounts.
    password_matches = await asyncio.to_thread(
        verify_password, payload.password, account.get("passwordHash", DUMMY_PASSWORD_HASH) if account else DUMMY_PASSWORD_HASH
    )
    if not account or not password_matches:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await create_session(account, request, response, db)
    return public_user(account)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, db=Depends(get_db)):
    raw_token = request.cookies.get(SESSION_COOKIE)
    if raw_token:
        await db.sessions.delete_one({"tokenHash": token_hash(raw_token)})
    response.delete_cookie(SESSION_COOKIE, path="/", secure=request.app.state.session_cookie_secure,
                           httponly=True, samesite="lax")


@router.get("/me", response_model=PublicUser)
async def profile(user=Depends(current_user)):
    return public_user(user)


@router.patch("/me", response_model=PublicUser)
async def update_profile(payload: ProfileUpdate, db=Depends(get_db), user=Depends(current_user)):
    changes = {}
    if "name" in payload.model_fields_set:
        changes["name"] = payload.name
    if "phoneNumber" in payload.model_fields_set:
        if user.get("role") != Role.PATIENT.value:
            raise HTTPException(status_code=403, detail="Only patients may manage an account phone number")
        changes["phoneNumber"] = payload.phoneNumber
    result = await db.users.update_one({"id": user["id"], "active": True}, {"$set": changes})
    if result.matched_count != 1:
        raise HTTPException(status_code=401, detail="Account unavailable")
    user.update(changes)
    return public_user(user)


@router.post("/invitations", status_code=status.HTTP_201_CREATED)
async def create_invitation(payload: InvitationRequest, db=Depends(get_db),
                            admin=Depends(require_roles(Role.PLATFORM_ADMIN, Role.HOSPITAL_ADMIN))):
    email = normalize_email(str(payload.email))
    if await db.users.find_one({"emailNormalized": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    if admin["role"] == Role.HOSPITAL_ADMIN.value:
        if payload.role != Role.DOCTOR:
            raise HTTPException(status_code=403, detail="Hospital administrators may only invite doctors")
        if payload.hospitalId != admin.get("hospitalId"):
            raise HTTPException(status_code=404, detail="Hospital not found")
    elif payload.role == Role.HOSPITAL_ADMIN and not payload.hospitalId:
        raise HTTPException(status_code=422, detail="Hospital administrator invitations require a hospital")

    hospital = await db.hospitals.find_one({"id": payload.hospitalId})
    if not hospital or hospital.get("active") is False:
        raise HTTPException(status_code=404, detail="Hospital not found")
    invitation = secrets.token_urlsafe(48)
    await db.invitations.insert_one({
        "tokenHash": token_hash(invitation), "emailNormalized": email,
        "role": payload.role.value, "hospitalId": payload.hospitalId,
        "createdBy": admin["id"], "createdAt": utcnow(), "expiresAt": utcnow() + INVITATION_TTL,
        "usedAt": None,
    })
    # Returned once to the authorized inviter; persist only its hash.
    return {"email": email, "role": payload.role.value, "hospitalId": payload.hospitalId,
            "invitationToken": invitation, "expiresInHours": int(INVITATION_TTL.total_seconds() / 3600)}
