"""Isolated tests for hospital and doctor administration APIs."""

from datetime import timedelta

from backend import auth
from backend.auth import Role


def csrf_headers(client):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200
    return {
        "Origin": "http://localhost:3000",
        "X-CSRF-Token": response.json()["csrfToken"],
    }


def seed_account(memory_db, role, email, *, hospital_id=None):
    account = {
        "id": f"account-{email}", "email": email, "emailNormalized": email,
        "name": "Management Test User", "passwordHash": auth.hash_password("test-only-password-123"),
        "role": role, "hospitalId": hospital_id, "active": True,
    }
    token = f"token-{email}"
    memory_db.users.documents.append(account)
    memory_db.sessions.documents.append({
        "tokenHash": auth.token_hash(token), "userId": account["id"],
        "expiresAt": auth.utcnow() + timedelta(hours=1),
    })
    return account, token


def seed_hospital(memory_db, hospital_id="hospital-a"):
    hospital = {
        "id": hospital_id, "name": f"{hospital_id} Hospital", "location": "Test City",
        "phone": "5551234567", "address": "10 Test Road", "bedTypes": ["ICU", "General"],
        "availableBeds": {"ICU": 2, "General": 4, "Special": 0},
        "reservedBeds": {"ICU": 1, "General": 0, "Special": 0},
        "rating": 4.5, "distance": "2 km", "emergency": True, "active": True,
    }
    memory_db.hospitals.documents.append(hospital)
    return hospital


def sign_in(client, token):
    client.cookies.set(auth.SESSION_COOKIE, token)


def test_platform_admin_creates_validated_hospital_and_lists_it(client, memory_db):
    _admin, token = seed_account(memory_db, Role.PLATFORM_ADMIN.value, "platform@example.com")
    sign_in(client, token)
    baseline_count = len(memory_db.hospitals.documents)
    payload = {
        "name": "Northside Hospital", "location": "Pune", "phone": "5551234567",
        "address": "10 North Road", "bedTypes": ["ICU", "General"],
        "availableBeds": {"ICU": 3, "General": 12, "Special": 0},
    }

    created = client.post("/api/admin/hospitals", headers=csrf_headers(client), json=payload)
    assert created.status_code == 201, created.text
    result = created.json()
    assert result["name"] == "Northside Hospital"
    assert result["active"] is True
    assert result["reservedBeds"] == {"ICU": 0, "General": 0, "Special": 0}
    listed_ids = {item["id"] for item in client.get("/api/admin/hospitals").json()}
    assert result["id"] in listed_ids

    invalid = client.post(
        "/api/admin/hospitals", headers=csrf_headers(client), json={**payload, "rating": 8}
    )
    assert invalid.status_code == 422
    assert len(memory_db.hospitals.documents) == baseline_count + 1


def test_public_hospital_search_treats_query_as_literal_and_bounds_length(client, memory_db):
    literal_hospital = seed_hospital(memory_db, "literal-hospital")
    literal_hospital["name"] = "North [Special] Hospital"
    literal_hospital["location"] = "Pune"
    ordinary_hospital = seed_hospital(memory_db, "ordinary-hospital")
    ordinary_hospital["name"] = "North Special Hospital"

    literal = client.get("/api/hospitals", params={"search": "[Special]"})
    assert literal.status_code == 200
    matched_ids = {hospital["id"] for hospital in literal.json()}
    assert "literal-hospital" in matched_ids
    assert "ordinary-hospital" not in matched_ids

    too_long = client.get("/api/hospitals", params={"search": "x" * 121})
    assert too_long.status_code == 422


def test_hospital_update_permissions_preserve_bed_inventory(client, memory_db):
    hospital_a = seed_hospital(memory_db, "hospital-a")
    seed_hospital(memory_db, "hospital-b")
    _admin, admin_token = seed_account(
        memory_db, Role.HOSPITAL_ADMIN.value, "hospital-admin@example.com", hospital_id="hospital-a"
    )
    sign_in(client, admin_token)

    updated = client.patch(
        "/api/admin/hospitals/hospital-a", headers=csrf_headers(client),
        json={"name": "Renamed Hospital", "emergency": False},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "Renamed Hospital"
    assert hospital_a["availableBeds"]["ICU"] == 2
    assert hospital_a["reservedBeds"]["ICU"] == 1
    assert client.patch(
        "/api/admin/hospitals/hospital-b", headers=csrf_headers(client),
        json={"name": "Unauthorized Edit"},
    ).status_code == 404
    assert client.patch(
        "/api/admin/hospitals/hospital-a/deactivate", headers=csrf_headers(client)
    ).status_code == 403
    assert hospital_a["name"] == "Renamed Hospital"

    platform, platform_token = seed_account(
        memory_db, Role.PLATFORM_ADMIN.value, "platform@example.com"
    )
    sign_in(client, platform_token)
    assert client.get("/api/admin/hospitals").status_code == 200
    assert client.patch(
        "/api/admin/hospitals/hospital-b", headers=csrf_headers(client), json={"rating": 4.8}
    ).status_code == 200
    assert platform["role"] == Role.PLATFORM_ADMIN.value


def test_hospital_admin_can_invite_doctor_only_to_assigned_hospital(client, memory_db):
    seed_hospital(memory_db, "hospital-a")
    seed_hospital(memory_db, "hospital-b")
    _admin, token = seed_account(
        memory_db, Role.HOSPITAL_ADMIN.value, "admin@example.com", hospital_id="hospital-a"
    )
    sign_in(client, token)

    denied_cross_hospital = client.post(
        "/api/auth/invitations", headers=csrf_headers(client),
        json={"email": "outside@example.com", "role": "DOCTOR", "hospitalId": "hospital-b"},
    )
    denied_admin_invite = client.post(
        "/api/auth/invitations", headers=csrf_headers(client),
        json={"email": "another-admin@example.com", "role": "HOSPITAL_ADMIN", "hospitalId": "hospital-a"},
    )
    assert denied_cross_hospital.status_code == 404
    assert denied_admin_invite.status_code == 403

    invited = client.post(
        "/api/auth/invitations", headers=csrf_headers(client),
        json={"email": "doctor@example.com", "role": "DOCTOR", "hospitalId": "hospital-a"},
    )
    assert invited.status_code == 201, invited.text
    assert invited.json()["hospitalId"] == "hospital-a"
    client.cookies.delete(auth.SESSION_COOKIE)
    registered = client.post("/api/auth/register/invited", headers=csrf_headers(client), json={
        "token": invited.json()["invitationToken"], "email": "doctor@example.com",
        "name": "Hospital Doctor", "password": "Correct Horse Battery 7!",
    })
    assert registered.status_code == 201
    assert registered.json()["hospitalId"] == "hospital-a"


def test_invitation_cannot_be_redeemed_after_hospital_deactivation(client, memory_db):
    hospital = seed_hospital(memory_db)
    _admin, token = seed_account(memory_db, Role.PLATFORM_ADMIN.value, "platform@example.com")
    sign_in(client, token)
    invited = client.post(
        "/api/auth/invitations", headers=csrf_headers(client),
        json={"email": "new-doctor@example.com", "role": "DOCTOR", "hospitalId": hospital["id"]},
    )
    assert invited.status_code == 201
    hospital["active"] = False
    client.cookies.delete(auth.SESSION_COOKIE)

    redeemed = client.post("/api/auth/register/invited", headers=csrf_headers(client), json={
        "token": invited.json()["invitationToken"], "email": "new-doctor@example.com",
        "name": "New Doctor", "password": "Correct Horse Battery 7!",
    })
    assert redeemed.status_code == 400
    assert not any(user["email"] == "new-doctor@example.com" for user in memory_db.users.documents)


def test_doctor_profile_and_hospital_admin_doctor_scope(client, memory_db):
    seed_hospital(memory_db, "hospital-a")
    seed_hospital(memory_db, "hospital-b")
    doctor_a, doctor_token = seed_account(
        memory_db, Role.DOCTOR.value, "doctor-a@example.com", hospital_id="hospital-a"
    )
    doctor_b, _ = seed_account(
        memory_db, Role.DOCTOR.value, "doctor-b@example.com", hospital_id="hospital-b"
    )
    _admin, admin_token = seed_account(
        memory_db, Role.HOSPITAL_ADMIN.value, "admin@example.com", hospital_id="hospital-a"
    )

    sign_in(client, doctor_token)
    assert client.get("/api/doctors/me").json()["hospitalId"] == "hospital-a"
    changed = client.patch(
        "/api/doctors/me", headers=csrf_headers(client), json={"name": "Doctor Updated"}
    )
    assert changed.status_code == 200
    assert doctor_a["name"] == "Doctor Updated"
    forbidden_reassignment = client.patch(
        "/api/doctors/me", headers=csrf_headers(client),
        json={"name": "Wrong Scope", "hospitalId": "hospital-b"},
    )
    assert forbidden_reassignment.status_code == 422
    assert client.get("/api/admin/doctors").status_code == 403

    sign_in(client, admin_token)
    listed = client.get("/api/admin/doctors")
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [doctor_a["id"]]
    assert client.get(f"/api/admin/doctors/{doctor_b['id']}").status_code == 404
    assert client.patch(
        f"/api/admin/doctors/{doctor_b['id']}/deactivate", headers=csrf_headers(client)
    ).status_code == 404

    _platform, platform_token = seed_account(
        memory_db, Role.PLATFORM_ADMIN.value, "platform@example.com"
    )
    sign_in(client, platform_token)
    assert len(client.get("/api/admin/doctors").json()) == 2
    assert client.get("/api/admin/doctors", params={"hospitalId": "hospital-b"}).json()[0]["id"] == doctor_b["id"]


def test_deactivation_preserves_hospital_and_doctor_records(client, memory_db):
    hospital = seed_hospital(memory_db)
    doctor, doctor_token = seed_account(
        memory_db, Role.DOCTOR.value, "doctor@example.com", hospital_id=hospital["id"]
    )
    memory_db.bookings.documents.append({"id": "historic-booking", "hospitalId": hospital["id"]})
    _platform, token = seed_account(memory_db, Role.PLATFORM_ADMIN.value, "platform@example.com")
    sign_in(client, token)

    assert client.patch(
        f"/api/admin/hospitals/{hospital['id']}/deactivate", headers=csrf_headers(client)
    ).status_code == 200
    assert client.get(f"/api/hospitals/{hospital['id']}").status_code == 404
    assert all(
        row["id"] != hospital["id"] for row in client.get("/api/hospitals").json()
    )
    assert hospital["active"] is False
    assert memory_db.bookings.documents[0]["id"] == "historic-booking"

    _patient, patient_token = seed_account(memory_db, Role.PATIENT.value, "patient@example.com")
    sign_in(client, patient_token)
    unavailable_reservation = client.post(
        "/api/bookings", headers=csrf_headers(client), json={
            "hospitalId": hospital["id"], "bedType": "ICU", "fullName": "Test Patient",
            "age": 40, "gender": "other", "bloodGroup": "O+", "mobile": "5551234567",
            "email": "patient@example.com", "emergencyContactName": "Contact",
            "emergencyContactPhone": "5557654321", "primaryCondition": "Test condition",
        },
    )
    assert unavailable_reservation.status_code == 404

    sign_in(client, token)
    deactivated = client.patch(
        f"/api/admin/doctors/{doctor['id']}/deactivate", headers=csrf_headers(client)
    )
    assert deactivated.status_code == 200
    assert doctor["active"] is False
    assert memory_db.users.documents[0]["id"] == doctor["id"]
    sign_in(client, doctor_token)
    assert client.get("/api/doctors/me").status_code == 401
