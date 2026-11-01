"""Isolated medicine catalog and global inventory tests."""

import asyncio
from datetime import datetime, timedelta, timezone

import httpx
from fastapi.testclient import TestClient
from backend import auth, server
from backend.auth import Role


def csrf_headers(client):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200
    return {
        "Origin": "http://localhost:3000",
        "X-CSRF-Token": response.json()["csrfToken"],
    }


def seed_account(memory_db, role, email):
    account = {
        "id": f"user-{email}", "email": email, "emailNormalized": email,
        "name": "Medicine Test User", "passwordHash": auth.hash_password("test-only-password-123"),
        "role": role, "active": True,
    }
    token = f"session-{email}"
    memory_db.users.documents.append(account)
    memory_db.sessions.documents.append({
        "tokenHash": auth.token_hash(token), "userId": account["id"],
        "expiresAt": auth.utcnow() + timedelta(hours=1),
    })
    return account, token


def medicine_payload(**overrides):
    return {
        "name": "Test Medicine 25mg", "category": "Pain Relief",
        "type": "Over-the-Counter", "description": "A catalog test item",
        "price": 12.5, "dosage": "One tablet as directed", "sideEffects": [],
        "activeIngredients": ["Test compound 25mg"], "manufacturer": "Test Maker",
        "expiryDate": "2030-12-31", "inStock": 4,
        "prescriptionRequired": False, "minAge": 12, "maxAge": 80,
        "warnings": [], "usage": "For isolated API testing",
        **overrides,
    }


def sign_in(client, token):
    client.cookies.set(auth.SESSION_COOKIE, token)


def test_catalog_lists_searches_filters_and_hides_inactive_medicines(client, memory_db):
    paracetamol = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    response = client.get("/api/medicines", params={
        "search": "paracetamol", "category": "Pain Relief", "prescription_required": "false",
    })
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == [paracetamol["id"]]
    assert response.json()[0]["lowStock"] is False
    assert client.get(f"/api/medicines/{paracetamol['id']}").status_code == 200
    assert client.get("/api/medicines", params={"category": "not-a-category"}).status_code == 422
    expired = next(row for row in memory_db.medicines.documents if row["name"] == "Ibuprofen 400mg")
    assert client.get(f"/api/medicines/{expired['id']}").status_code == 404
    assert all(row["id"] != expired["id"] for row in client.get("/api/medicines").json())

    paracetamol["active"] = False
    assert client.get(f"/api/medicines/{paracetamol['id']}").status_code == 404
    assert all(row["id"] != paracetamol["id"] for row in client.get("/api/medicines").json())


def test_platform_admin_catalog_create_update_and_validation(client, memory_db):
    _admin, token = seed_account(memory_db, Role.PLATFORM_ADMIN.value, "platform@example.com")
    sign_in(client, token)

    created = client.post("/api/admin/medicines", headers=csrf_headers(client), json=medicine_payload())
    assert created.status_code == 201, created.text
    record_id = created.json()["id"]
    assert created.json()["active"] is True
    assert created.json()["inStock"] == 4

    invalid = client.post(
        "/api/admin/medicines", headers=csrf_headers(client),
        json=medicine_payload(price=-1),
    )
    incomplete_image = client.post(
        "/api/admin/medicines", headers=csrf_headers(client),
        json=medicine_payload(imageUrl="https://example.org/product.jpg"),
    )
    assert invalid.status_code == 422
    assert incomplete_image.status_code == 422

    updated = client.patch(
        f"/api/admin/medicines/{record_id}", headers=csrf_headers(client),
        json={"description": "Updated catalog description"},
    )
    assert updated.status_code == 200
    assert updated.json()["description"] == "Updated catalog description"
    assert updated.json()["inStock"] == 4
    assert client.patch(
        f"/api/admin/medicines/{record_id}", headers=csrf_headers(client),
        json={"inStock": -1},
    ).status_code == 422


def test_only_platform_admin_can_manage_global_catalog_and_stock(client, memory_db):
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Ibuprofen 400mg")
    accounts = [
        (Role.PATIENT.value, "patient@example.com"),
        (Role.DOCTOR.value, "doctor@example.com"),
        (Role.HOSPITAL_ADMIN.value, "hospital-admin@example.com"),
    ]
    for role, email in accounts:
        _account, token = seed_account(memory_db, role, email)
        sign_in(client, token)
        assert client.get("/api/admin/medicines").status_code == 403
        denied = client.patch(
            f"/api/admin/medicines/{medicine['id']}/stock",
            headers=csrf_headers(client), json={"adjustment": 1},
        )
        assert denied.status_code == 403
    assert medicine["inStock"] == 75


def test_stock_adjustments_are_atomic_nonnegative_and_low_stock_is_visible(client, memory_db):
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Cetirizine 10mg")
    medicine["inStock"] = 2
    _admin, token = seed_account(memory_db, Role.PLATFORM_ADMIN.value, "platform@example.com")
    sign_in(client, token)

    low = client.patch(
        f"/api/admin/medicines/{medicine['id']}/stock", headers=csrf_headers(client),
        json={"adjustment": -1},
    )
    assert low.status_code == 200
    assert low.json()["inStock"] == 1
    assert low.json()["lowStock"] is True
    assert any(
        item["id"] == medicine["id"]
        for item in client.get("/api/admin/medicines", params={"lowStock": "true"}).json()
    )

    insufficient = client.patch(
        f"/api/admin/medicines/{medicine['id']}/stock", headers=csrf_headers(client),
        json={"adjustment": -2},
    )
    zero_adjustment = client.patch(
        f"/api/admin/medicines/{medicine['id']}/stock", headers=csrf_headers(client),
        json={"adjustment": 0},
    )
    assert insufficient.status_code == 409
    assert zero_adjustment.status_code == 422
    assert medicine["inStock"] == 1

    replenished = client.patch(
        f"/api/admin/medicines/{medicine['id']}/stock", headers=csrf_headers(client),
        json={"adjustment": 10},
    )
    assert replenished.status_code == 200
    assert replenished.json()["inStock"] == 11
    assert replenished.json()["lowStock"] is False


def test_competing_stock_decrements_cannot_drive_quantity_negative(backend_app, memory_db):
    medicine = medicine_payload(inStock=1)
    medicine.update({"id": "concurrent-stock-item", "active": True, "createdAt": datetime.now(timezone.utc)})
    memory_db.medicines.documents.append(medicine)
    _admin, token = seed_account(memory_db, Role.PLATFORM_ADMIN.value, "platform@example.com")

    async def compete():
        transport = httpx.ASGITransport(app=backend_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as first:
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as second:
                first_csrf = (await first.get("/api/auth/csrf")).json()["csrfToken"]
                second_csrf = (await second.get("/api/auth/csrf")).json()["csrfToken"]
                first.cookies.set(auth.SESSION_COOKIE, token)
                second.cookies.set(auth.SESSION_COOKIE, token)
                first_headers = {"Origin": "http://localhost:3000", "X-CSRF-Token": first_csrf}
                second_headers = {"Origin": "http://localhost:3000", "X-CSRF-Token": second_csrf}
                return await asyncio.gather(
                    first.patch(
                        f"/api/admin/medicines/{medicine['id']}/stock",
                        headers=first_headers, json={"adjustment": -1},
                    ),
                    second.patch(
                        f"/api/admin/medicines/{medicine['id']}/stock",
                        headers=second_headers, json={"adjustment": -1},
                    ),
                )

    with TestClient(backend_app):
        responses = asyncio.run(compete())

    assert sorted(response.status_code for response in responses) == [200, 409]
    assert medicine["inStock"] == 0


def test_cart_add_uses_active_catalog_stock_and_server_price(client, memory_db):
    _patient, token = seed_account(memory_db, Role.PATIENT.value, "patient@example.com")
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    medicine["inStock"] = 1
    sign_in(client, token)
    item = {"medicineId": medicine["id"], "medicineName": "Forged Name", "price": 0.01, "quantity": 1}

    added = client.post("/api/cart/add", headers=csrf_headers(client), json=item)
    denied_excess = client.post("/api/cart/add", headers=csrf_headers(client), json=item)
    denied_cart_quantity = client.put(
        "/api/cart/update", params={"medicine_id": medicine["id"], "quantity": 2},
        headers=csrf_headers(client),
    )
    assert added.status_code == 200
    assert denied_excess.status_code == 409
    assert denied_cart_quantity.status_code == 409
    assert medicine["inStock"] == 1
    cart = client.get("/api/cart").json()
    assert cart["items"][0]["medicineName"] == medicine["name"]
    assert cart["items"][0]["price"] == medicine["price"]

    expired = next(row for row in memory_db.medicines.documents if row["name"] == "Ibuprofen 400mg")
    expired_add = client.post(
        "/api/cart/add", headers=csrf_headers(client),
        json={**item, "medicineId": expired["id"]},
    )
    assert expired_add.status_code == 409

    medicine["active"] = False
    inactive_add = client.post(
        "/api/cart/add", headers=csrf_headers(client),
        json={**item, "medicineId": medicine["id"]},
    )
    assert inactive_add.status_code == 404


def test_deactivation_preserves_order_and_cart_references(client, memory_db):
    _admin, token = seed_account(memory_db, Role.PLATFORM_ADMIN.value, "platform@example.com")
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Vitamin C 1000mg")
    memory_db.orders.documents.append({
        "id": "historic-order", "items": [{"medicineId": medicine["id"]}],
    })
    memory_db.carts.documents.append({
        "id": "historic-cart", "items": [{"medicineId": medicine["id"]}],
    })
    sign_in(client, token)

    deactivated = client.patch(
        f"/api/admin/medicines/{medicine['id']}/deactivate", headers=csrf_headers(client)
    )
    assert deactivated.status_code == 200
    assert medicine["active"] is False
    assert client.get(f"/api/medicines/{medicine['id']}").status_code == 404
    assert client.get(f"/api/admin/medicines/{medicine['id']}").json()["active"] is False
    assert memory_db.orders.documents[0]["items"][0]["medicineId"] == medicine["id"]
    assert memory_db.carts.documents[0]["items"][0]["medicineId"] == medicine["id"]


def test_seed_image_metadata_is_unavailable_and_existing_fields_are_preserved(client, memory_db):
    medicine = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    original_count = len(memory_db.medicines.documents)
    original_id = medicine["id"]
    original_price = medicine["price"]
    original_stock = medicine["inStock"]
    medicine["imageUrl"] = "https://images.unsplash.com/generic-stock-image"
    medicine["imageSource"] = "https://example.org/search-result"
    medicine["imageAlt"] = "Unverified stock photo"

    asyncio.run(server.init_medicine_data(memory_db))

    assert len(memory_db.medicines.documents) == original_count
    assert medicine["id"] == original_id
    assert medicine["price"] == original_price
    assert medicine["inStock"] == original_stock
    assert medicine["imageUrl"] is None
    assert medicine["imageSource"] is None
    assert medicine["imageAlt"] is None
    assert all(
        item["imageUrl"] is None and item.get("imageSource") is None and item.get("imageAlt") is None
        for item in memory_db.medicines.documents
        if (item.get("name"), item.get("manufacturer")) in server.SEED_MEDICINE_IDENTITIES
    )


def test_demo_catalog_seed_is_idempotent_labeled_and_preserves_existing_records(client, memory_db):
    demos = [row for row in memory_db.medicines.documents if row.get("isDemo") is True]
    added_demos = [row for row in demos if row["id"].startswith("demo-")]
    assert len(added_demos) == 12
    assert len({row["id"] for row in added_demos}) == 12
    assert len({(row["name"], row["manufacturer"]) for row in added_demos}) == 12
    prescription_items = {
        "demo-zincovit-tablets", "demo-shelcal-500-tablets",
    }

    for row in added_demos:
        assert row["price"] > 0
        assert row["inStock"] >= 0
        assert row["expiryDate"] >= "2026-10-31"
        assert row["imageUrl"] is row["imageSource"] is row["imageAlt"] is None
        assert row["prescriptionRequired"] is (row["id"] in prescription_items)
        assert row["type"] == (
            "Prescription Required" if row["prescriptionRequired"] else "Over-the-Counter"
        )
        detail = client.get(f"/api/medicines/{row['id']}")
        assert detail.status_code == 200
        assert detail.json()["isDemo"] is True
        assert detail.json()["imageUrl"] is None
        assert detail.json()["imageSource"] is None
        assert detail.json()["imageAlt"] is None

    original_count = len(memory_db.medicines.documents)
    preserved = next(row for row in memory_db.medicines.documents if row["name"] == "Paracetamol 500mg")
    preserved_fields = {key: preserved[key] for key in ("id", "price", "inStock", "expiryDate")}
    asyncio.run(server.init_medicine_data(memory_db))

    assert len(memory_db.medicines.documents) == original_count
    assert {key: preserved[key] for key in preserved_fields} == preserved_fields
    assert sum(row["id"] == "demo-electral-ors-21-8g" for row in memory_db.medicines.documents) == 1
