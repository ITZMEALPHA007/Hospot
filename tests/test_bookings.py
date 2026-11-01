"""Isolated bed reservation API tests."""

import asyncio
from datetime import timedelta

import httpx
from fastapi.testclient import TestClient

from backend import auth
from backend.auth import Role


def csrf_headers(client):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200
    return {
        "Origin": "http://localhost:3000",
        "X-CSRF-Token": response.json()["csrfToken"],
    }


def seed_user(memory_db, role, email, hospital_id=None):
    account = {
        "id": f"user-{email}", "email": email, "emailNormalized": email,
        "name": "Booking Test User", "passwordHash": auth.hash_password("test-only-password-123"),
        "role": role, "hospitalId": hospital_id, "active": True,
    }
    raw_token = f"session-{email}"
    memory_db.users.documents.append(account)
    memory_db.sessions.documents.append({
        "tokenHash": auth.token_hash(raw_token), "userId": account["id"],
        "expiresAt": auth.utcnow() + timedelta(hours=1),
    })
    return account, raw_token


def seed_hospital(memory_db, hospital_id="hospital-a", *, available=2, bed_types=None):
    hospital = {
        "id": hospital_id,
        "name": f"{hospital_id} Hospital",
        "location": "Test City",
        "phone": "0000000000",
        "address": "Test address",
        "bedTypes": bed_types or ["ICU", "General", "Special"],
        "availableBeds": {"ICU": available, "General": available, "Special": available},
        "reservedBeds": {"ICU": 0, "General": 0, "Special": 0},
    }
    memory_db.hospitals.documents.append(hospital)
    return hospital


def booking_payload(hospital_id="hospital-a", **overrides):
    return {
        "hospitalId": hospital_id,
        "bedType": "ICU",
        "fullName": "Test Patient",
        "age": 42,
        "gender": "other",
        "bloodGroup": "O+",
        "mobile": "5551234567",
        "email": "patient@example.com",
        "emergencyContactName": "Emergency Contact",
        "emergencyContactPhone": "5557654321",
        "primaryCondition": "Test condition",
        "admissionTime": "today",
        **overrides,
    }


def authenticated_client(client, token):
    client.cookies.set(auth.SESSION_COOKIE, token)
    return client


def test_successful_reservation_uses_session_identity_and_decrements_capacity(client, memory_db):
    patient, token = seed_user(memory_db, Role.PATIENT.value, "patient@example.com")
    hospital = seed_hospital(memory_db)
    authenticated_client(client, token)

    response = client.post("/api/bookings", headers=csrf_headers(client), json=booking_payload())

    assert response.status_code == 201, response.text
    booking = response.json()
    assert booking["patientId"] == patient["id"]
    assert booking["hospitalId"] == hospital["id"]
    assert booking["status"] == "pending"
    assert booking["bedType"] == "ICU"
    assert booking["id"]
    assert "_id" not in booking
    assert hospital["availableBeds"]["ICU"] == 1
    assert hospital["reservedBeds"]["ICU"] == 1
    assert memory_db.bookings.documents[0]["patientId"] == patient["id"]
    public_hospital = client.get("/api/hospitals/hospital-a")
    assert public_hospital.status_code == 200
    assert public_hospital.json()["availableBeds"]["ICU"] == 1
    assert public_hospital.json()["reservedBeds"]["ICU"] == 1


def test_booking_insert_failure_rolls_back_reserved_capacity(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "patient@example.com")
    hospital = seed_hospital(memory_db)
    authenticated_client(client, token)
    memory_db.bookings.fail_after_next_insert = RuntimeError("isolated insert failure after write")

    response = client.post("/api/bookings", headers=csrf_headers(client), json=booking_payload())

    assert response.status_code == 503
    assert memory_db.bookings.documents == []
    assert hospital["availableBeds"]["ICU"] == 2
    assert hospital["reservedBeds"]["ICU"] == 0


def test_cancellation_capacity_failure_rolls_back_status_and_can_be_retried(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "patient@example.com")
    hospital = seed_hospital(memory_db, available=1)
    authenticated_client(client, token)
    created = client.post("/api/bookings", headers=csrf_headers(client), json=booking_payload())
    booking_id = created.json()["id"]
    memory_db.hospitals.fail_after_next_update = RuntimeError("isolated capacity failure after write")

    failed = client.post(f"/api/bookings/{booking_id}/cancel", headers=csrf_headers(client))

    assert failed.status_code == 503
    assert memory_db.bookings.documents[0]["status"] == "pending"
    assert hospital["availableBeds"]["ICU"] == 0
    assert hospital["reservedBeds"]["ICU"] == 1

    retried = client.post(f"/api/bookings/{booking_id}/cancel", headers=csrf_headers(client))
    assert retried.status_code == 200
    assert retried.json()["status"] == "cancelled"
    assert hospital["availableBeds"]["ICU"] == 1
    assert hospital["reservedBeds"]["ICU"] == 0


def test_rejection_capacity_failure_rolls_back_status_and_reservation(client, memory_db):
    _patient, patient_token = seed_user(memory_db, Role.PATIENT.value, "patient@example.com")
    hospital = seed_hospital(memory_db, available=1)
    client.cookies.set(auth.SESSION_COOKIE, patient_token)
    created = client.post("/api/bookings", headers=csrf_headers(client), json=booking_payload())
    booking_id = created.json()["id"]
    _admin, admin_token = seed_user(
        memory_db, Role.HOSPITAL_ADMIN.value, "admin@example.com", hospital_id="hospital-a"
    )
    client.cookies.set(auth.SESSION_COOKIE, admin_token)
    memory_db.hospitals.fail_after_next_update = RuntimeError("isolated capacity failure after write")

    failed = client.patch(
        f"/api/admin/bookings/{booking_id}/status",
        headers=csrf_headers(client), json={"status": "rejected"},
    )

    assert failed.status_code == 503
    assert memory_db.bookings.documents[0]["status"] == "pending"
    assert hospital["availableBeds"]["ICU"] == 0
    assert hospital["reservedBeds"]["ICU"] == 1

    retried = client.patch(
        f"/api/admin/bookings/{booking_id}/status",
        headers=csrf_headers(client), json={"status": "rejected"},
    )
    assert retried.status_code == 200
    assert retried.json()["status"] == "rejected"
    assert hospital["availableBeds"]["ICU"] == 1
    assert hospital["reservedBeds"]["ICU"] == 0


def test_startup_initializes_booking_lookup_indexes(backend_app, memory_db):
    with TestClient(backend_app):
        requests = memory_db.bookings.index_requests

    assert requests[0] == (("id",), {"unique": True})
    assert requests[1] == (([("patientId", 1), ("createdAt", -1)],), {})
    assert requests[2] == (([("hospitalId", 1), ("createdAt", -1)],), {})


def test_patient_cannot_submit_booking_for_another_user(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "patient@example.com")
    hospital = seed_hospital(memory_db)
    authenticated_client(client, token)

    response = client.post(
        "/api/bookings", headers=csrf_headers(client),
        json=booking_payload(patientId="another-patient"),
    )

    assert response.status_code == 422
    assert hospital["availableBeds"]["ICU"] == 2
    assert memory_db.bookings.documents == []


def test_reservation_rejects_insufficient_capacity(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "patient@example.com")
    hospital = seed_hospital(memory_db, available=0)
    authenticated_client(client, token)

    response = client.post("/api/bookings", headers=csrf_headers(client), json=booking_payload())

    assert response.status_code == 409
    assert response.json()["detail"] == "No beds of this type are currently available"
    assert hospital["availableBeds"]["ICU"] == 0
    assert memory_db.bookings.documents == []


def test_reservation_rejects_unknown_hospital(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "patient@example.com")
    authenticated_client(client, token)

    response = client.post(
        "/api/bookings", headers=csrf_headers(client), json=booking_payload("missing-hospital")
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Hospital not found"


def test_reservation_rejects_invalid_or_unsupported_bed_type(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "patient@example.com")
    seed_hospital(memory_db, bed_types=["General"])
    authenticated_client(client, token)

    invalid = client.post(
        "/api/bookings", headers=csrf_headers(client), json=booking_payload(bedType="Pediatric")
    )
    unsupported = client.post(
        "/api/bookings", headers=csrf_headers(client), json=booking_payload(bedType="ICU")
    )

    assert invalid.status_code == 422
    assert unsupported.status_code == 422
    assert unsupported.json()["detail"] == "Bed type is not available at this hospital"


def test_patient_booking_history_and_cross_patient_access_are_scoped(client, memory_db):
    owner, owner_token = seed_user(memory_db, Role.PATIENT.value, "owner@example.com")
    _other, other_token = seed_user(memory_db, Role.PATIENT.value, "other@example.com")
    hospital = seed_hospital(memory_db)
    client.cookies.set(auth.SESSION_COOKIE, owner_token)
    created = client.post("/api/bookings", headers=csrf_headers(client), json=booking_payload())
    booking_id = created.json()["id"]

    history = client.get("/api/bookings")
    assert history.status_code == 200
    assert [item["id"] for item in history.json()] == [booking_id]
    assert client.get(f"/api/bookings/{booking_id}").status_code == 200

    client.cookies.set(auth.SESSION_COOKIE, other_token)
    assert client.get("/api/bookings").json() == []
    assert client.get(f"/api/bookings/{booking_id}").status_code == 404
    denied_cancel = client.post(
        f"/api/bookings/{booking_id}/cancel", headers=csrf_headers(client)
    )
    assert denied_cancel.status_code == 404
    assert memory_db.bookings.documents[0]["patientId"] == owner["id"]
    assert hospital["availableBeds"]["ICU"] == 1


def test_patient_cancellation_releases_capacity_once(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "patient@example.com")
    hospital = seed_hospital(memory_db, available=1)
    authenticated_client(client, token)
    created = client.post("/api/bookings", headers=csrf_headers(client), json=booking_payload())
    booking_id = created.json()["id"]
    assert hospital["availableBeds"]["ICU"] == 0
    assert hospital["reservedBeds"]["ICU"] == 1

    cancelled = client.post(f"/api/bookings/{booking_id}/cancel", headers=csrf_headers(client))
    repeated = client.post(f"/api/bookings/{booking_id}/cancel", headers=csrf_headers(client))

    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert repeated.status_code == 409
    assert hospital["availableBeds"]["ICU"] == 1
    assert hospital["reservedBeds"]["ICU"] == 0


def test_hospital_admin_is_limited_to_assigned_hospital(client, memory_db):
    patient, patient_token = seed_user(memory_db, Role.PATIENT.value, "patient@example.com")
    hospital_a = seed_hospital(memory_db, "hospital-a")
    hospital_b = seed_hospital(memory_db, "hospital-b")
    client.cookies.set(auth.SESSION_COOKIE, patient_token)
    created = client.post(
        "/api/bookings", headers=csrf_headers(client), json=booking_payload("hospital-b")
    )
    booking_id = created.json()["id"]
    assert memory_db.bookings.documents[0]["patientId"] == patient["id"]

    _admin, admin_token = seed_user(
        memory_db, Role.HOSPITAL_ADMIN.value, "admin@example.com", hospital_id="hospital-a"
    )
    client.cookies.set(auth.SESSION_COOKIE, admin_token)
    history = client.get("/api/bookings")
    assert history.status_code == 200
    assert history.json() == []
    assert client.get(f"/api/bookings/{booking_id}").status_code == 404
    denied = client.patch(
        f"/api/admin/bookings/{booking_id}/status",
        headers=csrf_headers(client), json={"status": "confirmed"},
    )
    assert denied.status_code == 404
    assert memory_db.bookings.documents[0]["status"] == "pending"
    assert hospital_a["availableBeds"]["ICU"] == 2
    assert hospital_b["availableBeds"]["ICU"] == 1


def test_hospital_admin_status_workflow_and_rejection_release(client, memory_db):
    _patient, patient_token = seed_user(memory_db, Role.PATIENT.value, "patient@example.com")
    hospital = seed_hospital(memory_db, available=2)
    client.cookies.set(auth.SESSION_COOKIE, patient_token)
    created = client.post("/api/bookings", headers=csrf_headers(client), json=booking_payload())
    booking_id = created.json()["id"]
    _admin, admin_token = seed_user(
        memory_db, Role.HOSPITAL_ADMIN.value, "admin@example.com", hospital_id="hospital-a"
    )
    client.cookies.set(auth.SESSION_COOKIE, admin_token)

    rejected = client.patch(
        f"/api/admin/bookings/{booking_id}/status",
        headers=csrf_headers(client), json={"status": "rejected"},
    )
    invalid_transition = client.patch(
        f"/api/admin/bookings/{booking_id}/status",
        headers=csrf_headers(client), json={"status": "confirmed"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert invalid_transition.status_code == 409
    assert hospital["availableBeds"]["ICU"] == 2
    assert hospital["reservedBeds"]["ICU"] == 0

    client.cookies.set(auth.SESSION_COOKIE, patient_token)
    second = client.post(
        "/api/bookings", headers=csrf_headers(client), json=booking_payload(bedType="General")
    )
    client.cookies.set(auth.SESSION_COOKIE, admin_token)
    confirmed = client.patch(
        f"/api/admin/bookings/{second.json()['id']}/status",
        headers=csrf_headers(client), json={"status": "confirmed"},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "confirmed"
    assert hospital["availableBeds"]["General"] == 1
    assert hospital["reservedBeds"]["General"] == 1


def test_concurrent_requests_cannot_reserve_last_bed_twice(backend_app, memory_db):
    _first, first_token = seed_user(memory_db, Role.PATIENT.value, "first@example.com")
    _second, second_token = seed_user(memory_db, Role.PATIENT.value, "second@example.com")
    hospital = seed_hospital(memory_db, available=1)

    async def compete():
        transport = httpx.ASGITransport(app=backend_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as first:
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as second:
                csrf_first = (await first.get("/api/auth/csrf")).json()["csrfToken"]
                csrf_second = (await second.get("/api/auth/csrf")).json()["csrfToken"]
                first.cookies.set(auth.SESSION_COOKIE, first_token)
                second.cookies.set(auth.SESSION_COOKIE, second_token)
                first_headers = {"Origin": "http://localhost:3000", "X-CSRF-Token": csrf_first}
                second_headers = {"Origin": "http://localhost:3000", "X-CSRF-Token": csrf_second}
                results = await asyncio.gather(
                    first.post("/api/bookings", headers=first_headers, json=booking_payload()),
                    second.post("/api/bookings", headers=second_headers, json=booking_payload()),
                )
                return results

    with TestClient(backend_app):
        results = asyncio.run(compete())

    assert sorted(result.status_code for result in results) == [201, 409]
    assert len(memory_db.bookings.documents) == 1
    assert hospital["availableBeds"]["ICU"] == 0
    assert hospital["reservedBeds"]["ICU"] == 1
