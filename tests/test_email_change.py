"""Email-change tests use an isolated database and mocked delivery boundaries."""

import asyncio
from datetime import timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from backend import auth
from backend import email_change
from backend.email_delivery import EmailDeliveryError, ResendEmailDelivery, SMTPEmailDelivery, email_delivery_from_environment
import resend


class FakeEmailDelivery:
    is_configured = True

    def __init__(self):
        self.sent = []
        self.fail = False

    async def send_email_change(self, recipient, verification_url):
        if self.fail:
            raise RuntimeError("simulated delivery failure")
        self.sent.append((recipient, verification_url))


def test_smtp_adapter_builds_transactional_email_without_opening_a_connection(monkeypatch):
    adapter = SMTPEmailDelivery(
        host="smtp.example.net", port=465, username="smtp-user",
        password="test-secret", sender="no-reply@example.net",
    )
    captured = []
    monkeypatch.setattr(adapter, "_send_message", lambda message: captured.append(message))
    asyncio.run(adapter.send_email_change("patient@example.org", "https://hospot.example/verify-email-change#token=abc"))
    assert adapter.is_configured
    assert len(captured) == 1
    message = captured[0]
    assert message["Subject"] == "Verify your Hospot email change"
    assert message["To"] == "patient@example.org"
    body = "\n".join(part.get_content() for part in message.walk() if part.get_content_type() in {"text/plain", "text/html"})
    assert "15 minutes" in body
    assert "If you did not request this change" in body
    assert "https://hospot.example/verify-email-change#token=abc" in body


def test_resend_adapter_sends_hospot_template_only_to_proposed_address(monkeypatch):
    adapter = ResendEmailDelivery("test-api-key", "no-reply@example.net")
    captured = []

    class Accepted:
        id = "email-provider-id"

    async def send(params):
        captured.append(params)
        return Accepted()

    monkeypatch.setattr(resend, "api_key", None)
    monkeypatch.setattr(resend, "default_async_http_client", None)
    monkeypatch.setattr(resend.Emails, "send_async", send)
    asyncio.run(adapter.send_email_change(
        "proposed@example.org", "https://hospot.example/verify-email-change#token=opaque-token"
    ))

    assert adapter.is_configured
    assert resend.api_key == "test-api-key"
    assert len(captured) == 1
    assert captured[0]["from"] == "Hospot <no-reply@example.net>"
    assert captured[0]["to"] == ["proposed@example.org"]
    assert captured[0]["subject"] == "Verify your Hospot email change"
    assert "15 minutes" in captured[0]["text"]
    assert "opaque-token" in captured[0]["html"]


@pytest.mark.parametrize("provider_failure", [
    RuntimeError("provider rejected credentials: secret-detail"),
    httpx.TimeoutException("timeout detail"),
    httpx.NetworkError("network detail"),
])
def test_resend_adapter_fails_closed_without_exposing_provider_errors(monkeypatch, provider_failure):
    adapter = ResendEmailDelivery("test-api-key", "no-reply@example.net")

    async def fail(_params):
        raise provider_failure

    monkeypatch.setattr(resend, "api_key", None)
    monkeypatch.setattr(resend, "default_async_http_client", None)
    monkeypatch.setattr(resend.Emails, "send_async", fail)
    with pytest.raises(EmailDeliveryError) as error:
        asyncio.run(adapter.send_email_change("proposed@example.org", "https://hospot.example/link#token=opaque"))
    assert str(error.value) == "Email provider request failed"
    assert error.value.__cause__ is None
    assert "secret-detail" not in str(error.value)


def test_resend_adapter_rejects_missing_configuration_without_provider_call(monkeypatch):
    adapter = ResendEmailDelivery(None, "no-reply@example.net")
    called = []

    async def send(_params):
        called.append(True)

    monkeypatch.setattr(resend.Emails, "send_async", send)
    assert not adapter.is_configured
    with pytest.raises(EmailDeliveryError, match="Email delivery is not configured"):
        asyncio.run(adapter.send_email_change("proposed@example.org", "https://hospot.example/link"))
    assert called == []


def test_provider_selection_defaults_to_resend_and_selects_smtp_only_explicitly(monkeypatch):
    monkeypatch.delenv("EMAIL_DELIVERY_PROVIDER", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "test-api-key")
    monkeypatch.setenv("HOSPOT_EMAIL_FROM", "no-reply@example.net")
    assert isinstance(email_delivery_from_environment(), ResendEmailDelivery)

    monkeypatch.setenv("EMAIL_DELIVERY_PROVIDER", "smtp")
    selected = email_delivery_from_environment()
    assert isinstance(selected, SMTPEmailDelivery)
    assert not selected.is_configured

    monkeypatch.setenv("EMAIL_DELIVERY_PROVIDER", "unsupported")
    assert not email_delivery_from_environment().is_configured


def setup_email(client):
    delivery = FakeEmailDelivery()
    client.app.state.email_delivery = delivery
    client.app.state.email_public_frontend_url = "http://localhost:3000"
    return delivery


def csrf_headers(client):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200
    return {"Origin": "http://localhost:3000", "X-CSRF-Token": response.json()["csrfToken"]}


def seed_patient(client, memory_db, email="owner@example.com"):
    account = {
        "id": f"patient-{email}", "email": email, "emailNormalized": email,
        "name": "Patient Owner", "passwordHash": auth.hash_password("Correct Horse Battery 7!"),
        "role": "PATIENT", "active": True,
    }
    memory_db.users.documents.append(account)
    raw = f"session-{email}"
    memory_db.sessions.documents.append({
        "_id": f"session-{email}", "tokenHash": auth.token_hash(raw),
        "userId": account["id"], "expiresAt": auth.utcnow() + timedelta(hours=1),
    })
    client.cookies.set(auth.SESSION_COOKIE, raw)
    return account


def request_change(client, email):
    return client.post("/api/auth/email-change/request", headers=csrf_headers(client), json={"email": email})


def token_from(delivery, index=-1):
    return parse_qs(urlsplit(delivery.sent[index][1]).fragment)["token"][0]


def confirm(client, token):
    return client.post("/api/auth/email-change/confirm", headers=csrf_headers(client), json={"token": token})


def test_request_keeps_current_email_then_confirmation_updates_it_once(client, memory_db):
    delivery = setup_email(client)
    account = seed_patient(client, memory_db)
    response = request_change(client, "New.Address@example.net")
    assert response.status_code == 202
    assert "token" not in response.text
    assert len(delivery.sent) == 1
    assert delivery.sent[0][0] == "new.address@example.net"
    pending = account["pendingEmailChange"]
    raw_token = token_from(delivery)
    assert pending["tokenHash"] == auth.token_hash(raw_token)
    assert raw_token not in pending["tokenHash"]
    assert pending["expiresAt"] - pending["createdAt"] == timedelta(minutes=15)
    assert account["email"] == "owner@example.com"
    status_response = client.get("/api/auth/email-change")
    assert status_response.status_code == 200
    assert status_response.json()["pending"] is True
    assert status_response.json()["email"] == "new.address@example.net"
    assert "token" not in status_response.text
    # Mongo's default timezone-naive UTC decoding must still produce safe API timestamps.
    account["pendingEmailChange"]["expiresAt"] = account["pendingEmailChange"]["expiresAt"].replace(tzinfo=None)
    account["pendingEmailChange"]["lastSentAt"] = account["pendingEmailChange"]["lastSentAt"].replace(tzinfo=None)
    assert client.get("/api/auth/email-change").status_code == 200
    account["pendingEmailChange"]["expiresAt"] = account["pendingEmailChange"]["expiresAt"].replace(tzinfo=timezone.utc)
    account["pendingEmailChange"]["lastSentAt"] = account["pendingEmailChange"]["lastSentAt"].replace(tzinfo=timezone.utc)

    result = confirm(client, raw_token)
    assert result.status_code == 200
    assert result.json() == {"message": "Email address verified successfully.", "email": "new.address@example.net"}
    assert account["email"] == "new.address@example.net"
    assert account["emailNormalized"] == "new.address@example.net"
    assert account["pendingEmailChange"]["consumedAt"] is not None
    replay = confirm(client, raw_token)
    assert replay.status_code == 409
    assert client.get("/api/auth/me").json()["email"] == "new.address@example.net"


def test_invalid_duplicate_and_current_emails_are_generic_and_not_delivered(client, memory_db):
    delivery = setup_email(client)
    account = seed_patient(client, memory_db)
    memory_db.users.documents.append({
        "id": "other-patient", "email": "taken@example.net", "emailNormalized": "taken@example.net",
        "name": "Other", "role": "PATIENT", "active": True,
    })
    duplicate = request_change(client, "TAKEN@example.net")
    same = request_change(client, "owner@example.com")
    assert duplicate.status_code == same.status_code == 202
    assert duplicate.json() == same.json()
    assert delivery.sent == []
    assert "pendingEmailChange" not in account

    invalid = client.post("/api/auth/email-change/request", headers=csrf_headers(client), json={"email": "not an email"})
    assert invalid.status_code == 422


def test_missing_provider_fails_closed_without_creating_a_pending_challenge(client, memory_db):
    account = seed_patient(client, memory_db)
    client.app.state.email_delivery = None
    client.app.state.email_public_frontend_url = "http://localhost:3000"
    response = request_change(client, "new@example.net")
    assert response.status_code == 503
    assert "pendingEmailChange" not in account


def test_verification_link_uses_trusted_configured_origin_not_request_host(client, memory_db):
    delivery = setup_email(client)
    client.app.state.email_public_frontend_url = "https://portal.hospot.example"
    client.app.state.allowed_origins.add("https://portal.hospot.example")
    seed_patient(client, memory_db)
    response = client.post(
        "/api/auth/email-change/request",
        headers={**csrf_headers(client), "Host": "attacker.invalid"},
        json={"email": "new@example.net"},
    )
    assert response.status_code == 202
    assert urlsplit(delivery.sent[0][1]).hostname == "portal.hospot.example"


def test_delivery_failure_cleans_up_only_its_pending_challenge(client, memory_db):
    delivery = setup_email(client)
    delivery.fail = True
    account = seed_patient(client, memory_db)
    response = request_change(client, "new@example.net")
    assert response.status_code == 503
    assert "pendingEmailChange" not in account
    assert account["email"] == "owner@example.com"


def test_confirmation_rejects_invalid_expired_and_superseded_links(client, memory_db):
    delivery = setup_email(client)
    account = seed_patient(client, memory_db)
    assert confirm(client, "x" * 48).status_code == 400
    request_change(client, "first@example.net")
    first = token_from(delivery)
    request_change(client, "second@example.net")
    second = token_from(delivery)
    assert confirm(client, first).status_code == 400
    assert account["email"] == "owner@example.com"
    assert confirm(client, second).status_code == 200

    next_request = request_change(client, "third@example.net")
    assert next_request.status_code == 202
    third = token_from(delivery)
    account["pendingEmailChange"]["expiresAt"] = auth.utcnow() - timedelta(seconds=1)
    assert confirm(client, third).status_code == 410


def test_older_started_request_cannot_overwrite_a_newer_pending_challenge(client, memory_db, monkeypatch):
    delivery = setup_email(client)
    account = seed_patient(client, memory_db)
    now = auth.utcnow()
    account["emailChangeRateWindowStartedAt"] = now - timedelta(hours=2)
    account["emailChangeRateCount"] = 1
    account["pendingEmailChange"] = {
        "tokenHash": auth.token_hash("newer-secret-token"),
        "email": "newer@example.net", "emailNormalized": "newer@example.net",
        "createdAt": now + timedelta(seconds=1), "expiresAt": now + timedelta(minutes=16),
        "lastSentAt": now, "resendCount": 0, "consumedAt": None,
    }
    monkeypatch.setattr(email_change, "utcnow", lambda: now)
    response = client.post("/api/auth/email-change/request", headers=csrf_headers(client), json={"email": "older@example.net"})
    assert response.status_code == 202
    assert account["pendingEmailChange"]["email"] == "newer@example.net"
    assert delivery.sent == []


def test_resend_cooldown_rate_limit_and_old_token_invalidation(client, memory_db):
    delivery = setup_email(client)
    account = seed_patient(client, memory_db)
    assert request_change(client, "new@example.net").status_code == 202
    old_token = token_from(delivery)
    cooldown = client.post("/api/auth/email-change/resend", headers=csrf_headers(client))
    assert cooldown.status_code == 429
    account["pendingEmailChange"]["lastSentAt"] = auth.utcnow() - timedelta(seconds=61)
    resent = client.post("/api/auth/email-change/resend", headers=csrf_headers(client))
    assert resent.status_code == 202
    new_token = token_from(delivery)
    assert new_token != old_token
    assert confirm(client, old_token).status_code == 400
    assert confirm(client, new_token).status_code == 200


def test_request_rate_limit_applies_to_authenticated_patient(client, memory_db):
    setup_email(client)
    account = seed_patient(client, memory_db)
    for index in range(5):
        response = request_change(client, f"address-{index}@example.net")
        assert response.status_code == 202
    limited = request_change(client, "address-6@example.net")
    assert limited.status_code == 429
    assert account["emailChangeRateCount"] == 5


def test_unauthed_and_csrf_protected_request_paths(client, memory_db):
    setup_email(client)
    seed_patient(client, memory_db)
    client.cookies.delete(auth.SESSION_COOKIE)
    headers = csrf_headers(client)
    unauthenticated = client.post("/api/auth/email-change/request", headers=headers, json={"email": "new@example.net"})
    assert unauthenticated.status_code == 401
    client.cookies.set(auth.SESSION_COOKIE, "session-owner@example.com")
    client.cookies.delete(auth.CSRF_COOKIE)
    rejected = client.post("/api/auth/email-change/request", headers={"Origin": "http://localhost:3000"}, json={"email": "new@example.net"})
    assert rejected.status_code == 403


def test_email_claimed_after_request_is_rejected_at_confirmation(client, memory_db):
    delivery = setup_email(client)
    owner = seed_patient(client, memory_db)
    request_change(client, "raced@example.net")
    raw_token = token_from(delivery)
    memory_db.users.documents.append({
        "id": "race-winner", "email": "raced@example.net", "emailNormalized": "raced@example.net",
        "name": "Other", "role": "PATIENT", "active": True,
    })
    result = confirm(client, raw_token)
    assert result.status_code == 409
    assert owner["email"] == "owner@example.com"


def test_unique_index_duplicate_key_race_is_reported_without_changing_email(client, memory_db):
    delivery = setup_email(client)
    owner = seed_patient(client, memory_db)
    request_change(client, "race-index@example.net")
    raw_token = token_from(delivery)

    class DuplicateKeyError(Exception):
        code = 11000

    # Simulate the existing Mongo unique emailNormalized index winning a race
    # after the endpoint's explicit duplicate lookup.
    memory_db.users.fail_next_update = DuplicateKeyError("duplicate")
    response = confirm(client, raw_token)
    assert response.status_code == 409
    assert owner["email"] == "owner@example.com"


def test_concurrent_confirmation_can_consume_a_token_only_once(client, memory_db):
    delivery = setup_email(client)
    owner = seed_patient(client, memory_db)
    request_change(client, "concurrent@example.net")
    raw_token = token_from(delivery)
    async def compete():
        transport = httpx.ASGITransport(app=client.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver", cookies={auth.CSRF_COOKIE: "csrf-token"}) as async_client:
            headers = {"Origin": "http://localhost:3000", "X-CSRF-Token": "csrf-token"}
            return await asyncio.gather(*[
                async_client.post("/api/auth/email-change/confirm", headers=headers, json={"token": raw_token})
                for _ in range(2)
            ])

    responses = asyncio.run(compete())
    assert sorted(response.status_code for response in responses) == [200, 409]
    assert owner["email"] == "concurrent@example.net"
