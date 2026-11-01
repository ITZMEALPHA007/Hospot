"""Isolated cart, checkout, and order lifecycle tests."""

import asyncio
from datetime import timedelta

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend import auth, server
from backend.auth import Role


def seed_user(memory_db, role, email):
    account = {
        "id": f"user-{email}", "email": email, "emailNormalized": email,
        "name": "Order Test User", "role": role, "active": True,
    }
    token = f"session-{email}"
    memory_db.users.documents.append(account)
    memory_db.sessions.documents.append({
        "tokenHash": auth.token_hash(token), "userId": account["id"],
        "expiresAt": auth.utcnow() + timedelta(hours=1),
    })
    return account, token


def sign_in(client, token):
    client.cookies.set(auth.SESSION_COOKIE, token)


def csrf_headers(client):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200
    return {"Origin": "http://localhost:3000", "X-CSRF-Token": response.json()["csrfToken"]}


def checkout_payload(**overrides):
    return {
        "deliveryAddress": "12 Example Road, Bengaluru",
        "contactNumber": "+91-9000000000",
        "paymentMethod": "cash_on_delivery",
        **overrides,
    }


def seed_pickup_location(memory_db, *, active=True):
    location = {
        "id": "pickup-pharmacy-a", "name": "Hospot Pharmacy A", "location": "Bengaluru",
        "address": "12 Clinic Road", "phone": "+91-8000000000", "active": active,
        "availableBeds": {"ICU": 0, "General": 0, "Special": 0},
    }
    memory_db.hospitals.documents.append(location)
    return location


def add_line(client, medicine, quantity=1, **submitted_fields):
    return client.post(
        "/api/cart/add", headers=csrf_headers(client),
        json={"medicineId": medicine["id"], "quantity": quantity, **submitted_fields},
    )


def test_cart_crud_uses_session_owner_and_catalog_values(client, memory_db):
    _first, first_token = seed_user(memory_db, Role.PATIENT.value, "first-cart@example.com")
    _second, second_token = seed_user(memory_db, Role.PATIENT.value, "second-cart@example.com")
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    original_stock = medicine["inStock"]
    sign_in(client, first_token)

    assert client.get("/api/cart").json()["items"] == []
    added = add_line(client, medicine, 2, medicineName="Forged", price=0.01, userId="someone-else")
    assert added.status_code == 200
    cart = client.get("/api/cart").json()
    assert cart["userId"] == "user-first-cart@example.com"
    assert cart["items"][0]["medicineName"] == medicine["name"]
    assert cart["items"][0]["price"] == medicine["price"]
    assert medicine["inStock"] == original_stock  # A cart does not reserve inventory.

    medicine["price"] = 18.75
    updated = client.put(
        "/api/cart/update", params={"medicine_id": medicine["id"], "quantity": 3},
        headers=csrf_headers(client),
    )
    assert updated.status_code == 200
    cart = client.get("/api/cart").json()
    assert cart["items"][0]["quantity"] == 3
    assert cart["items"][0]["price"] == 18.75

    assert client.delete(f"/api/cart/remove/{medicine['id']}", headers=csrf_headers(client)).status_code == 200
    assert client.get("/api/cart").json()["items"] == []
    add_line(client, medicine)
    assert client.delete("/api/cart/clear", headers=csrf_headers(client)).status_code == 200
    assert client.get("/api/cart").json()["items"] == []

    sign_in(client, second_token)
    assert client.get("/api/cart").json()["userId"] == "user-second-cart@example.com"
    assert client.get("/api/cart").json()["items"] == []
    assert client.put(
        "/api/cart/update", params={"medicine_id": medicine["id"], "quantity": 1},
        headers=csrf_headers(client),
    ).status_code == 404


def test_cart_rejects_invalid_inactive_expired_and_unavailable_medicines(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "cart-validation@example.com")
    sign_in(client, token)
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")

    assert client.post(
        "/api/cart/add", headers=csrf_headers(client),
        json={"medicineId": "missing", "quantity": 1},
    ).status_code == 404
    assert client.post(
        "/api/cart/add", headers=csrf_headers(client),
        json={"medicineId": medicine["id"], "quantity": 0},
    ).status_code == 422

    medicine["inStock"] = 0
    assert add_line(client, medicine).status_code == 409
    medicine["inStock"] = 5
    medicine["active"] = False
    assert add_line(client, medicine).status_code == 404
    medicine["active"] = True
    medicine["expiryDate"] = "2020-01-01"
    assert add_line(client, medicine).status_code == 409


def test_checkout_uses_current_cart_and_catalog_and_decrements_stock(client, memory_db):
    patient, token = seed_user(memory_db, Role.PATIENT.value, "checkout@example.com")
    sign_in(client, token)
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    initial_stock = medicine["inStock"]
    assert add_line(client, medicine, 2, price=0.01, medicineName="Forged name").status_code == 200
    medicine["price"] = 21.25

    response = client.post(
        "/api/orders", headers=csrf_headers(client),
        json=checkout_payload(
            userId="other-patient", totalAmount=0.02,
            items=[{"medicineId": "forged", "medicineName": "Forged", "price": 0.01, "quantity": 99}],
        ),
    )
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["userId"] == patient["id"]
    assert order["status"] == "pending"
    assert order["items"] == [{
        "medicineId": medicine["id"], "medicineName": medicine["name"],
        "price": 21.25, "quantity": 2, "prescriptionId": None,
    }]
    assert order["totalAmount"] == 42.5
    assert medicine["inStock"] == initial_stock - 2
    assert client.get("/api/cart").json()["items"] == []
    assert client.get("/api/orders").json()[0]["id"] == order["id"]


def test_checkout_pickup_snapshots_active_location_and_global_inventory_scope(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "pickup@example.com")
    location = seed_pickup_location(memory_db)
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    sign_in(client, token)
    assert add_line(client, medicine, 2).status_code == 200

    response = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload(
        fulfillmentMethod="PICKUP", pickupLocationId=location["id"],
        deliveryFee=9999, totalAmount=0,
    ))

    assert response.status_code == 201, response.text
    order = response.json()
    assert order["fulfillmentMethod"] == "PICKUP"
    assert order["pickupLocation"] == {
        "id": location["id"], "name": location["name"], "location": location["location"],
        "address": location["address"], "phone": location["phone"],
    }
    assert order["pickupReference"].startswith("HSP-")
    assert order["deliveryAddress"] is None and order["contactNumber"] is None
    assert order["itemSubtotal"] == medicine["price"] * 2
    assert order["deliveryFee"] == 0 and order["totalAmount"] == order["itemSubtotal"]
    assert order["currency"] == "INR"
    assert order["inventoryScope"] == "GLOBAL_UNALLOCATED"
    assert all(order[field] is None for field in (
        "deliveryProvider", "shipmentId", "trackingNumber", "trackingUrl", "shipmentStatus",
        "dispatchedAt", "deliveredAt",
    ))


def test_checkout_requires_method_specific_details_and_active_pickup_location(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "fulfillment-validation@example.com")
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    sign_in(client, token)
    assert add_line(client, medicine).status_code == 200

    missing_pickup = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload(
        fulfillmentMethod="PICKUP",
    ))
    assert missing_pickup.status_code == 422
    assert client.post("/api/orders", headers=csrf_headers(client), json={
        "fulfillmentMethod": "HOME_DELIVERY", "paymentMethod": "cash_on_delivery",
    }).status_code == 422

    inactive = seed_pickup_location(memory_db, active=False)
    unknown = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload(
        fulfillmentMethod="PICKUP", pickupLocationId="unknown-location",
    ))
    assert unknown.status_code == 404
    unavailable = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload(
        fulfillmentMethod="PICKUP", pickupLocationId=inactive["id"],
    ))
    assert unavailable.status_code == 404
    assert memory_db.orders.documents == []
    assert client.get("/api/cart").json()["items"]


def test_home_delivery_snapshot_and_fee_are_separate_from_subtotal(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "delivery@example.com")
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    sign_in(client, token)
    assert add_line(client, medicine, 1).status_code == 200

    response = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload(
        fulfillmentMethod="HOME_DELIVERY", deliveryFee=10000, totalAmount=0,
    ))
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["deliveryAddress"] == "12 Example Road, Bengaluru"
    assert order["contactNumber"] == "+91-9000000000"
    assert order["itemSubtotal"] == medicine["price"]
    assert order["deliveryFee"] == 0 and order["totalAmount"] == order["itemSubtotal"]
    assert order["currency"] == "INR"
    assert order["pickupLocation"] is None and order["pickupReference"] is None


def test_checkout_rejects_empty_stale_or_insufficient_cart_without_changes(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "empty-checkout@example.com")
    sign_in(client, token)
    empty = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload())
    assert empty.status_code == 409

    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    initial_stock = medicine["inStock"]
    assert add_line(client, medicine, 2).status_code == 200
    medicine["inStock"] = 1
    insufficient = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload())
    assert insufficient.status_code == 409
    assert medicine["inStock"] == 1
    assert len(client.get("/api/cart").json()["items"]) == 1
    assert memory_db.orders.documents == []

    medicine["inStock"] = initial_stock
    medicine["active"] = False
    inactive = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload())
    assert inactive.status_code == 409
    assert len(client.get("/api/cart").json()["items"]) == 1
    assert memory_db.orders.documents == []


@pytest.mark.parametrize("failure_target", ["stock", "order_insert", "cart_clear"])
def test_failed_checkout_rolls_back_inventory_order_and_cart(client, memory_db, failure_target):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, f"failure-{failure_target}@example.com")
    sign_in(client, token)
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    initial_stock = medicine["inStock"]
    assert add_line(client, medicine, 2).status_code == 200
    if failure_target == "stock":
        memory_db.medicines.fail_next_update = RuntimeError("isolated stock write failure")
    elif failure_target == "order_insert":
        memory_db.orders.fail_next_insert = RuntimeError("isolated order insert failure")
    else:
        memory_db.carts.fail_next_update = RuntimeError("isolated cart clear failure")

    response = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload())
    assert response.status_code == 503
    assert medicine["inStock"] == initial_stock
    assert memory_db.orders.documents == []
    assert len(client.get("/api/cart").json()["items"]) == 1


def test_checkout_rolls_back_earlier_stock_decrements_if_later_line_is_unavailable(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "multi-line-failure@example.com")
    sign_in(client, token)
    first = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    second = next(row for row in memory_db.medicines.documents if row["id"] == "demo-electral-ors-21-8g")
    first_stock, second_stock = first["inStock"], second["inStock"]
    assert add_line(client, first, 1).status_code == 200
    assert add_line(client, second, 1).status_code == 200
    second["inStock"] = 0

    response = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload())

    assert response.status_code == 409
    assert first["inStock"] == first_stock
    assert second["inStock"] == 0
    assert len(client.get("/api/cart").json()["items"]) == 2
    assert memory_db.orders.documents == []


def test_patient_order_ownership_and_platform_admin_global_read(client, memory_db):
    patient, patient_token = seed_user(memory_db, Role.PATIENT.value, "owner@example.com")
    other, other_token = seed_user(memory_db, Role.PATIENT.value, "other@example.com")
    admin, admin_token = seed_user(memory_db, Role.PLATFORM_ADMIN.value, "orders-admin@example.com")
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    sign_in(client, patient_token)
    add_line(client, medicine)
    placed = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload())
    order_id = placed.json()["id"]

    sign_in(client, other_token)
    assert client.get(f"/api/orders/{order_id}").status_code == 404
    assert client.post(f"/api/orders/{order_id}/cancel", headers=csrf_headers(client)).status_code == 404
    assert client.get("/api/admin/orders").status_code == 403

    sign_in(client, admin_token)
    assert client.get("/api/admin/orders").json()[0]["id"] == order_id
    assert client.get(f"/api/admin/orders/{order_id}").json()["userId"] == patient["id"]
    assert admin["role"] == Role.PLATFORM_ADMIN.value
    assert other["id"] != patient["id"]


def test_patient_cancellation_restores_stock_once_and_only_while_pending(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "cancel-owner@example.com")
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    initial_stock = medicine["inStock"]
    sign_in(client, token)
    add_line(client, medicine, 3)
    order = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload()).json()
    assert medicine["inStock"] == initial_stock - 3

    memory_db.medicines.fail_next_update = RuntimeError("isolated cancellation restock failure")
    failed_cancel = client.post(f"/api/orders/{order['id']}/cancel", headers=csrf_headers(client))
    assert failed_cancel.status_code == 503
    assert memory_db.orders.documents[0]["status"] == "pending"
    assert medicine["inStock"] == initial_stock - 3

    cancelled = client.post(f"/api/orders/{order['id']}/cancel", headers=csrf_headers(client))
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert medicine["inStock"] == initial_stock
    repeated = client.post(f"/api/orders/{order['id']}/cancel", headers=csrf_headers(client))
    assert repeated.status_code == 409
    assert medicine["inStock"] == initial_stock


def test_admin_status_transitions_are_validated_and_cancel_restores_once(client, memory_db):
    _patient, patient_token = seed_user(memory_db, Role.PATIENT.value, "status-owner@example.com")
    _admin, admin_token = seed_user(memory_db, Role.PLATFORM_ADMIN.value, "status-admin@example.com")
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    initial_stock = medicine["inStock"]
    sign_in(client, patient_token)
    add_line(client, medicine, 2)
    order = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload()).json()
    sign_in(client, admin_token)

    confirmed = client.put(
        f"/api/orders/{order['id']}/status", params={"status": "confirmed"},
        headers=csrf_headers(client), json={"userId": "forged", "totalAmount": 0},
    )
    assert confirmed.status_code == 200
    stored = memory_db.orders.documents[0]
    assert stored["userId"] == "user-status-owner@example.com"
    assert stored["totalAmount"] == order["totalAmount"]
    assert stored["items"] == order["items"]

    invalid = client.put(
        f"/api/orders/{order['id']}/status", params={"status": "delivered"},
        headers=csrf_headers(client),
    )
    assert invalid.status_code == 409
    assert stored["status"] == "confirmed"

    preparing = client.put(
        f"/api/orders/{order['id']}/status", params={"status": "preparing"},
        headers=csrf_headers(client),
    )
    assert preparing.status_code == 200
    cancelled = client.put(
        f"/api/orders/{order['id']}/status", params={"status": "cancelled"},
        headers=csrf_headers(client),
    )
    assert cancelled.status_code == 409  # Preparing cannot return to cancelled.
    assert medicine["inStock"] == initial_stock - 2

    for next_status in ("out_for_delivery", "delivered"):
        # New home-delivery orders must pass through dispatch states.
        if next_status == "out_for_delivery":
            for dispatch_status in ("ready_for_dispatch", "dispatched"):
                advanced = client.put(
                    f"/api/orders/{order['id']}/status", params={"status": dispatch_status},
                    headers=csrf_headers(client),
                )
                assert advanced.status_code == 200
        advanced = client.put(
            f"/api/orders/{order['id']}/status", params={"status": next_status},
            headers=csrf_headers(client),
        )
        assert advanced.status_code == 200
    terminal = client.put(
        f"/api/orders/{order['id']}/status", params={"status": "pending"},
        headers=csrf_headers(client),
    )
    assert terminal.status_code == 409
    assert stored["status"] == "delivered"


def test_pickup_status_transitions_are_separate_and_picked_up_is_terminal(client, memory_db):
    _patient, patient_token = seed_user(memory_db, Role.PATIENT.value, "pickup-status@example.com")
    _admin, admin_token = seed_user(memory_db, Role.PLATFORM_ADMIN.value, "pickup-status-admin@example.com")
    seed_pickup_location(memory_db)
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    sign_in(client, patient_token)
    assert add_line(client, medicine).status_code == 200
    placed = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload(
        fulfillmentMethod="PICKUP", pickupLocationId="pickup-pharmacy-a",
    ))
    assert placed.status_code == 201, placed.text
    order_id = placed.json()["id"]

    sign_in(client, admin_token)
    for status_value in ("confirmed", "preparing"):
        assert client.put(
            f"/api/orders/{order_id}/status", params={"status": status_value},
            headers=csrf_headers(client),
        ).status_code == 200
    assert client.put(
        f"/api/orders/{order_id}/status", params={"status": "ready_for_dispatch"},
        headers=csrf_headers(client),
    ).status_code == 409
    assert client.put(
        f"/api/orders/{order_id}/status", params={"status": "ready_for_pickup"},
        headers=csrf_headers(client),
    ).status_code == 200
    assert client.put(
        f"/api/orders/{order_id}/status", params={"status": "picked_up"},
        headers=csrf_headers(client),
    ).status_code == 200
    for terminal_attempt in ("delivered", "cancelled"):
        assert client.put(
            f"/api/orders/{order_id}/status", params={"status": terminal_attempt},
            headers=csrf_headers(client),
        ).status_code == 409
    assert memory_db.orders.documents[-1]["status"] == "picked_up"


def test_pickup_cancellation_restores_global_stock_once(client, memory_db):
    _patient, token = seed_user(memory_db, Role.PATIENT.value, "pickup-cancel@example.com")
    seed_pickup_location(memory_db)
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    initial_stock = medicine["inStock"]
    sign_in(client, token)
    assert add_line(client, medicine, 2).status_code == 200
    response = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload(
        fulfillmentMethod="PICKUP", pickupLocationId="pickup-pharmacy-a",
    ))
    assert response.status_code == 201, response.text
    assert medicine["inStock"] == initial_stock - 2
    assert client.post(
        f"/api/orders/{response.json()['id']}/cancel", headers=csrf_headers(client),
    ).status_code == 200
    assert medicine["inStock"] == initial_stock
    assert client.post(
        f"/api/orders/{response.json()['id']}/cancel", headers=csrf_headers(client),
    ).status_code == 409
    assert medicine["inStock"] == initial_stock


def test_legacy_order_without_fulfillment_fields_remains_readable_and_uses_legacy_transitions(client, memory_db):
    patient, patient_token = seed_user(memory_db, Role.PATIENT.value, "legacy-order@example.com")
    _admin, admin_token = seed_user(memory_db, Role.PLATFORM_ADMIN.value, "legacy-admin@example.com")
    legacy = {
        "id": "legacy-order", "userId": patient["id"], "items": [], "totalAmount": 0,
        "deliveryAddress": "Legacy Road", "contactNumber": "1234567890",
        "paymentMethod": "cash_on_delivery", "status": "preparing",
        "orderDate": auth.utcnow(),
    }
    memory_db.orders.documents.append(legacy)
    sign_in(client, patient_token)
    fetched = client.get("/api/orders/legacy-order")
    assert fetched.status_code == 200
    assert fetched.json()["fulfillmentMethod"] is None
    assert fetched.json()["itemSubtotal"] is None

    sign_in(client, admin_token)
    advanced = client.put(
        "/api/orders/legacy-order/status", params={"status": "out_for_delivery"},
        headers=csrf_headers(client),
    )
    assert advanced.status_code == 200
    assert legacy["status"] == "out_for_delivery"


def test_platform_admin_can_cancel_confirmed_order_and_restore_stock_once(client, memory_db):
    _patient, patient_token = seed_user(memory_db, Role.PATIENT.value, "admin-cancel-owner@example.com")
    _admin, admin_token = seed_user(memory_db, Role.PLATFORM_ADMIN.value, "admin-cancel@example.com")
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    initial_stock = medicine["inStock"]
    sign_in(client, patient_token)
    assert add_line(client, medicine, 2).status_code == 200
    order = client.post("/api/orders", headers=csrf_headers(client), json=checkout_payload()).json()
    sign_in(client, admin_token)

    assert client.put(
        f"/api/orders/{order['id']}/status", params={"status": "confirmed"},
        headers=csrf_headers(client),
    ).status_code == 200
    cancelled = client.put(
        f"/api/orders/{order['id']}/status", params={"status": "cancelled"},
        headers=csrf_headers(client),
    )
    assert cancelled.status_code == 200
    assert medicine["inStock"] == initial_stock
    repeated = client.put(
        f"/api/orders/{order['id']}/status", params={"status": "cancelled"},
        headers=csrf_headers(client),
    )
    assert repeated.status_code == 409
    assert medicine["inStock"] == initial_stock


def test_checkout_competing_for_last_unit_succeeds_only_once(backend_app, memory_db):
    asyncio.run(server.init_medicine_data(memory_db))
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    medicine["inStock"] = 1
    first, _ = seed_user(memory_db, Role.PATIENT.value, "race-first@example.com")
    second, _ = seed_user(memory_db, Role.PATIENT.value, "race-second@example.com")
    for patient in (first, second):
        memory_db.carts.documents.append({
            "id": f"cart-{patient['id']}", "userId": patient["id"],
            "items": [{"medicineId": medicine["id"], "medicineName": medicine["name"],
                       "price": 0.01, "quantity": 1}],
            "totalAmount": 0.01,
        })

    payload = server.OrderCreate(**checkout_payload())

    async def compete():
        return await asyncio.gather(
            server.create_order(payload, user=first, db=memory_db),
            server.create_order(payload, user=second, db=memory_db),
            return_exceptions=True,
        )

    with TestClient(backend_app):
        results = asyncio.run(compete())
    assert sum(not isinstance(result, Exception) for result in results) == 1
    failures = [result for result in results if isinstance(result, HTTPException)]
    assert len(failures) == 1 and failures[0].status_code == 409
    assert medicine["inStock"] == 0
    assert len(memory_db.orders.documents) == 1
    assert sum(not cart["items"] for cart in memory_db.carts.documents) == 1
