"""Authentication, authorization, and CSRF regression tests."""

from datetime import timedelta
import asyncio

import pytest

from backend import auth, provision_platform_admin as provisioning


def csrf_headers(client, *, origin="http://localhost:3000", include_header=True):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200
    headers = {"Origin": origin}
    if include_header:
        headers["X-CSRF-Token"] = response.json()["csrfToken"]
    return headers


def register_patient(client, email="patient@example.com", **extra):
    headers = csrf_headers(client)
    return client.post("/api/auth/register", headers=headers, json={
        "email": email,
        "name": "Test Patient",
        "password": "Correct Horse Battery 7!",
        **extra,
    })


def seed_user(memory_db, role, email, hospital_id=None, *, expires_at=None):
    account = {
        "id": f"user-{email}", "email": email, "emailNormalized": email,
        "name": "Test User", "passwordHash": auth.hash_password("Correct Horse Battery 7!"),
        "role": role, "hospitalId": hospital_id, "active": True,
    }
    memory_db.users.documents.append(account)
    raw_token = f"session-{email}"
    memory_db.sessions.documents.append({
        "_id": f"session-{email}", "tokenHash": auth.token_hash(raw_token),
        "userId": account["id"], "expiresAt": expires_at or auth.utcnow() + timedelta(hours=1),
    })
    return account, raw_token


def test_lifespan_uses_injected_memory_database(backend_app, memory_db, client):
    assert backend_app.state.db is memory_db
    assert backend_app.state.mongo_client is None
    assert memory_db.hospitals.index_requests == []
    assert len(memory_db.users.index_requests) == 1
    assert len(memory_db.sessions.index_requests) == 2
    assert len(memory_db.invitations.index_requests) == 2


def test_registration_is_patient_only_and_login_works(client, memory_db):
    created = register_patient(client, role="PLATFORM_ADMIN")
    assert created.status_code == 201
    assert created.json()["role"] == "PATIENT"
    assert "passwordHash" not in created.json()
    assert memory_db.users.documents[0]["role"] == "PATIENT"
    assert memory_db.users.documents[0]["passwordHash"] != "Correct Horse Battery 7!"
    assert auth.verify_password("Correct Horse Battery 7!", memory_db.users.documents[0]["passwordHash"])

    assert register_patient(client).status_code == 409
    headers = csrf_headers(client)
    login = client.post("/api/auth/login", headers=headers, json={
        "email": "patient@example.com", "password": "Correct Horse Battery 7!",
    })
    assert login.status_code == 200
    invalid = client.post("/api/auth/login", headers=headers, json={
        "email": "patient@example.com", "password": "incorrect",
    })
    assert invalid.status_code == 401


@pytest.mark.parametrize("failure", ["invalid_origin", "missing_cookie", "missing_header", "mismatch"])
def test_csrf_rejects_invalid_origin_or_token(client, failure):
    headers = csrf_headers(client)
    if failure == "invalid_origin":
        headers["Origin"] = "http://untrusted.example"
    elif failure == "missing_cookie":
        client.cookies.delete("hospot_csrf")
    elif failure == "missing_header":
        headers.pop("X-CSRF-Token")
    elif failure == "mismatch":
        headers["X-CSRF-Token"] = "not-the-cookie-token"

    response = client.post("/api/auth/register", headers=headers, json={
        "email": "csrf@example.com", "name": "Test Patient",
        "password": "Correct Horse Battery 7!",
    })
    assert response.status_code == 403


def test_protected_endpoints_require_session_and_csrf(client):
    assert client.get("/api/orders").status_code == 401
    response = client.post("/api/auth/register", json={
        "email": "blocked@example.com", "name": "Test Patient",
        "password": "Correct Horse Battery 7!",
    })
    assert response.status_code == 403


def test_expired_session_is_rejected(client, memory_db):
    _account, token = seed_user(
        memory_db, "PATIENT", "expired@example.com", expires_at=auth.utcnow() - timedelta(seconds=1)
    )
    client.cookies.set(auth.SESSION_COOKIE, token)
    assert client.get("/api/auth/me").status_code == 401


def test_profile_update_is_authenticated_and_persisted(client, memory_db):
    account, token = seed_user(memory_db, "PATIENT", "profile@example.com")
    client.cookies.set(auth.SESSION_COOKIE, token)
    response = client.patch("/api/auth/me", headers=csrf_headers(client), json={"name": "Updated Patient"})
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Patient"
    assert memory_db.users.documents[0]["id"] == account["id"]
    assert memory_db.users.documents[0]["name"] == "Updated Patient"


@pytest.mark.parametrize("submitted", ["9876543210", "+91 98765 43210", "+91-9876543210"])
def test_patient_phone_number_is_normalized_and_returned_by_profile(client, memory_db, submitted):
    account, token = seed_user(memory_db, "PATIENT", f"phone-{len(submitted)}@example.com")
    client.cookies.set(auth.SESSION_COOKIE, token)
    response = client.patch("/api/auth/me", headers=csrf_headers(client), json={"phoneNumber": submitted})
    assert response.status_code == 200
    assert response.json()["phoneNumber"] == "+919876543210"
    assert memory_db.users.documents[0]["id"] == account["id"]
    assert memory_db.users.documents[0]["phoneNumber"] == "+919876543210"
    assert client.get("/api/auth/me").json()["phoneNumber"] == "+919876543210"


def test_patient_phone_number_can_be_updated_and_removed(client, memory_db):
    account, token = seed_user(memory_db, "PATIENT", "phone-lifecycle@example.com")
    account["phoneNumber"] = "+919876543210"
    client.cookies.set(auth.SESSION_COOKIE, token)
    updated = client.patch("/api/auth/me", headers=csrf_headers(client), json={"phoneNumber": "8123456789"})
    assert updated.status_code == 200
    assert updated.json()["phoneNumber"] == "+918123456789"
    removed = client.patch("/api/auth/me", headers=csrf_headers(client), json={"phoneNumber": None})
    assert removed.status_code == 200
    assert removed.json()["phoneNumber"] is None
    assert memory_db.users.documents[0].get("phoneNumber") is None


@pytest.mark.parametrize("submitted", [
    "1234567890", "5123456789", "987654321", "98765432101", "+1 2025550123",
    "919876543210", "phone 9876543210", "(987)654-3210", "",
])
def test_invalid_or_unsupported_phone_numbers_are_rejected(client, memory_db, submitted):
    _account, token = seed_user(memory_db, "PATIENT", f"invalid-phone-{abs(hash(submitted))}@example.com")
    client.cookies.set(auth.SESSION_COOKIE, token)
    response = client.patch("/api/auth/me", headers=csrf_headers(client), json={"phoneNumber": submitted})
    assert response.status_code == 422
    assert "phoneNumber" not in memory_db.users.documents[0]


def test_phone_update_requires_session_patient_role_and_csrf(client, memory_db):
    headers = csrf_headers(client)
    client.cookies.clear()
    client.cookies.set(auth.CSRF_COOKIE, headers["X-CSRF-Token"])
    unauthenticated = client.patch("/api/auth/me", headers=headers, json={"phoneNumber": "9876543210"})
    assert unauthenticated.status_code == 401

    doctor, token = seed_user(memory_db, "DOCTOR", "doctor-phone@example.com")
    client.cookies.set(auth.SESSION_COOKIE, token)
    forbidden = client.patch("/api/auth/me", headers=csrf_headers(client), json={"phoneNumber": "9876543210"})
    assert forbidden.status_code == 403
    assert "phoneNumber" not in doctor

    patient, token = seed_user(memory_db, "PATIENT", "csrf-phone@example.com")
    client.cookies.set(auth.SESSION_COOKIE, token)
    csrf_headers(client)
    client.cookies.delete(auth.CSRF_COOKIE)
    rejected = client.patch("/api/auth/me", headers={"Origin": "http://localhost:3000"}, json={"phoneNumber": "9876543210"})
    assert rejected.status_code == 403
    assert "phoneNumber" not in patient


def test_booking_contact_number_does_not_populate_account_phone(client, memory_db):
    account, token = seed_user(memory_db, "PATIENT", "booking-contact@example.com")
    memory_db.bookings.documents.append({
        "id": "booking-contact", "patientId": account["id"], "contactNumber": "9876543210",
    })
    client.cookies.set(auth.SESSION_COOKIE, token)
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["phoneNumber"] is None
    assert "phoneNumber" not in memory_db.users.documents[0]


def test_patient_resource_ownership_and_cross_user_modification(client, memory_db):
    patient, token = seed_user(memory_db, "PATIENT", "owner@example.com")
    client.cookies.set(auth.SESSION_COOKIE, token)
    memory_db.prescriptions.documents.append({
        "id": "other-rx", "userId": "other-patient", "isUsed": False,
        "medicines": [], "doctorName": "Doctor", "hospitalName": "Hospital",
        "prescriptionDate": auth.utcnow(),
    })
    memory_db.orders.documents.append({
        "id": "other-order", "userId": "other-patient", "items": [],
    })

    assert client.get("/api/prescriptions/other-rx").status_code == 404
    assert client.put("/api/prescriptions/other-rx/use", headers=csrf_headers(client)).status_code == 404
    assert memory_db.prescriptions.documents[0]["isUsed"] is False
    assert client.get("/api/orders/other-order").status_code == 404
    assert client.put("/api/orders/other-order/status?status=delivered", headers=csrf_headers(client)).status_code == 403

    created = client.post("/api/prescriptions", headers=csrf_headers(client), json={
        "userId": "other-patient", "doctorName": "Doctor", "hospitalName": "Hospital",
        "prescriptionDate": auth.utcnow().isoformat(), "medicines": [],
    })
    assert created.status_code == 200
    assert created.json()["userId"] == patient["id"]

    medicine = next(
        row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg"
    )
    added = client.post("/api/cart/add", headers=csrf_headers(client), json={
        "medicineId": medicine["id"], "medicineName": "Forged name", "price": 0.01, "quantity": 1,
    })
    assert added.status_code == 200
    order = client.post("/api/orders", headers=csrf_headers(client), json={
        "userId": "other-patient",
        "items": [{"medicineId": "med-1", "medicineName": "Test Medicine", "price": 1.0, "quantity": 99}],
        "totalAmount": 1.0, "deliveryAddress": "Test address", "contactNumber": "0000000000",
        "paymentMethod": "cash_on_delivery",
    })
    assert order.status_code == 201
    assert order.json()["userId"] == patient["id"]
    assert order.json()["items"][0]["medicineId"] == medicine["id"]
    assert order.json()["items"][0]["price"] == medicine["price"]


def test_doctor_invitation_and_role_restrictions(client, memory_db):
    memory_db.hospitals.documents.append({
        "id": "hospital-doctors", "name": "Doctor Test Hospital", "active": True,
    })
    _platform, platform_token = seed_user(memory_db, "PLATFORM_ADMIN", "platform@example.com")
    client.cookies.set(auth.SESSION_COOKIE, platform_token)
    invitation = client.post("/api/auth/invitations", headers=csrf_headers(client), json={
        "email": "doctor@example.com", "role": "DOCTOR", "hospitalId": "hospital-doctors",
    })
    assert invitation.status_code == 201

    # Clear the inviter's server session before registering the invitee.
    client.cookies.delete(auth.SESSION_COOKIE)
    invite_headers = csrf_headers(client)
    registration = client.post("/api/auth/register/invited", headers=invite_headers, json={
        "token": invitation.json()["invitationToken"], "email": "doctor@example.com",
        "name": "Invited Doctor", "password": "Correct Horse Battery 7!",
    })
    assert registration.status_code == 201
    assert registration.json()["role"] == "DOCTOR"
    assert registration.json()["hospitalId"] == "hospital-doctors"
    assert client.post("/api/auth/register/invited", headers=invite_headers, json={
        "token": invitation.json()["invitationToken"], "email": "doctor@example.com",
        "name": "Invited Doctor", "password": "Correct Horse Battery 7!",
    }).status_code == 400
    assert client.get("/api/prescriptions").status_code == 403
    assert client.put("/api/admin/hospitals/hospital-a/beds", headers=csrf_headers(client), json={"ICU": 1}).status_code == 403


def test_hospital_admin_invitation_and_hospital_scope(client, memory_db):
    memory_db.hospitals.documents.append({"id": "hospital-a", "name": "Hospital A", "availableBeds": {"ICU": 2}})
    _platform, platform_token = seed_user(memory_db, "PLATFORM_ADMIN", "platform2@example.com")
    client.cookies.set(auth.SESSION_COOKIE, platform_token)
    invitation = client.post("/api/auth/invitations", headers=csrf_headers(client), json={
        "email": "hospital-admin@example.com", "role": "HOSPITAL_ADMIN", "hospitalId": "hospital-a",
    })
    assert invitation.status_code == 201

    client.cookies.delete(auth.SESSION_COOKIE)
    registration = client.post("/api/auth/register/invited", headers=csrf_headers(client), json={
        "token": invitation.json()["invitationToken"], "email": "hospital-admin@example.com",
        "name": "Hospital Admin", "password": "Correct Horse Battery 7!",
    })
    assert registration.status_code == 201
    assert registration.json()["role"] == "HOSPITAL_ADMIN"
    assert registration.json()["hospitalId"] == "hospital-a"
    assert client.put("/api/admin/hospitals/another-hospital/beds", headers=csrf_headers(client), json={"ICU": 1}).status_code == 404
    assert client.put("/api/admin/hospitals/hospital-a/beds", headers=csrf_headers(client), json={"ICU": 1}).status_code == 200


def test_platform_admin_authorization_and_patient_denial(client, memory_db):
    _patient, patient_token = seed_user(memory_db, "PATIENT", "patient-admin-test@example.com")
    client.cookies.set(auth.SESSION_COOKIE, patient_token)
    assert client.post("/api/auth/invitations", headers=csrf_headers(client), json={
        "email": "denied@example.com", "role": "DOCTOR",
    }).status_code == 403


def test_platform_admin_provisioning_helpers_are_safe_and_hash_passwords():
    account = provisioning.build_platform_admin_account(
        "FIRST.ADMIN@example.com", "A long test-only password!"
    )
    assert account["role"] == "PLATFORM_ADMIN"
    assert account["email"] == "first.admin@example.com"
    assert account["passwordHash"] != "A long test-only password!"
    assert auth.verify_password("A long test-only password!", account["passwordHash"])
    assert provisioning.reject_existing_platform_admin(None) is None
    with pytest.raises(SystemExit):
        provisioning.reject_existing_platform_admin({"role": "PLATFORM_ADMIN"})


def test_isolated_fake_can_detect_existing_duplicate_platform_admin_rows(memory_db):
    memory_db.users.documents.extend([
        {"id": "fake-admin-1", "role": "PLATFORM_ADMIN"},
        {"id": "fake-admin-2", "role": "PLATFORM_ADMIN"},
    ])
    matches = asyncio.run(memory_db.users.find({"role": "PLATFORM_ADMIN"}).to_list(10))
    assert len(matches) == 2
    with pytest.raises(SystemExit):
        provisioning.reject_existing_platform_admin(matches[0])


def test_logout_invalidates_session(client, memory_db):
    _patient, token = seed_user(memory_db, "PATIENT", "logout@example.com")
    client.cookies.set(auth.SESSION_COOKIE, token)
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/logout", headers=csrf_headers(client)).status_code == 204
    assert client.get("/api/auth/me").status_code == 401
