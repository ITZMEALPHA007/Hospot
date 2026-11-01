from datetime import datetime, timedelta, timezone

from backend import auth


def attach_patient_session(client, memory_db, *, role="PATIENT", patient_id="patient-1"):
    now = datetime.now(timezone.utc)
    account = {
        "id": patient_id,
        "email": f"{patient_id}@example.org",
        "emailNormalized": f"{patient_id}@example.org",
        "name": "Hospot Patient",
        "role": role,
        "active": True,
        "createdAt": now - timedelta(days=400),
    }
    memory_db.users.documents.append(account)
    token = f"session-{patient_id}"
    memory_db.sessions.documents.append({
        "_id": f"session-{patient_id}", "tokenHash": auth.token_hash(token),
        "userId": patient_id, "expiresAt": now + timedelta(hours=1),
    })
    client.cookies.set(auth.SESSION_COOKIE, token)
    return account


def test_profile_summary_is_patient_scoped_and_aggregates_over_100_records(client, memory_db):
    attach_patient_session(client, memory_db)
    now = datetime.now(timezone.utc)
    statuses = ("pending", "confirmed", "rejected", "cancelled")
    for index in range(105):
        memory_db.bookings.documents.append({
            "id": f"booking-{index}", "patientId": "patient-1", "hospitalName": "Central Hospital",
            "bedType": "General", "status": statuses[index % len(statuses)],
            "createdAt": now - timedelta(minutes=index), "updatedAt": now - timedelta(minutes=index),
            "primaryCondition": "private clinical detail must not be returned",
        })
    for index in range(104):
        status = "cancelled" if index in (0, 1) else ("delivered" if index == 2 else "pending")
        memory_db.orders.documents.append({
            "id": f"order-{index}", "userId": "patient-1", "status": status,
            "totalAmount": 10.25, "orderDate": now - timedelta(minutes=index),
            "updatedAt": now - timedelta(minutes=index), "currency": "INR",
            "items": [{"medicineName": "ORS", "quantity": 1}],
            "deliveryAddress": "private address must not be returned",
        })
    memory_db.bookings.documents.append({
        "id": "other-booking", "patientId": "patient-2", "status": "confirmed",
        "createdAt": now, "updatedAt": now,
    })
    memory_db.orders.documents.append({
        "id": "other-order", "userId": "patient-2", "status": "delivered", "totalAmount": 999,
        "orderDate": now, "items": [],
    })

    response = client.get("/api/patient/profile/summary")

    assert response.status_code == 200
    summary = response.json()
    assert summary["totalBookings"] == 105
    assert summary["bookingStatuses"] == {"pending": 27, "confirmed": 26, "rejected": 26, "cancelled": 26}
    assert summary["totalMedicineOrders"] == 104
    assert summary["fulfilledMedicineOrders"] == 1
    assert summary["nonCancelledOrderValue"] == 1045.5
    assert summary["currency"] == "INR"
    assert len(summary["recentActivity"]) == 8
    assert summary["memberSince"] == attach_expected_member_date(memory_db)
    assert "primaryCondition" not in str(summary)
    assert "deliveryAddress" not in str(summary)
    assert "patientId" not in summary and "userId" not in summary


def attach_expected_member_date(memory_db):
    return memory_db.users.documents[0]["createdAt"].isoformat().replace("+00:00", "Z")


def test_profile_summary_has_real_zero_values_and_recent_activity_empty_state(client, memory_db):
    attach_patient_session(client, memory_db)
    response = client.get("/api/patient/profile/summary")

    assert response.status_code == 200
    assert response.json()["totalBookings"] == 0
    assert response.json()["bookingStatuses"] == {"pending": 0, "confirmed": 0, "rejected": 0, "cancelled": 0}
    assert response.json()["totalMedicineOrders"] == 0
    assert response.json()["fulfilledMedicineOrders"] == 0
    assert response.json()["nonCancelledOrderValue"] == 0
    assert response.json()["recentActivity"] == []


def test_profile_summary_requires_patient_role_and_authenticated_session(client, memory_db):
    assert client.get("/api/patient/profile/summary").status_code == 401
    attach_patient_session(client, memory_db, role="DOCTOR", patient_id="doctor-1")
    response = client.get("/api/patient/profile/summary")
    assert response.status_code == 403
