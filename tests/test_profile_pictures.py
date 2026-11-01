from datetime import datetime, timedelta, timezone
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend import auth, server
from backend.profile_picture_storage import LocalProfilePictureStorage


class MemoryPictureStorage:
    def __init__(self):
        self.objects = {}
        self.fail_put = False
        self.fail_delete = False

    async def put(self, key, content):
        if self.fail_put:
            raise OSError("storage unavailable")
        self.objects[key] = content

    async def get(self, key):
        if key not in self.objects:
            raise FileNotFoundError(key)
        return self.objects[key]

    async def delete(self, key):
        if self.fail_delete:
            raise OSError("storage unavailable")
        self.objects.pop(key, None)


@pytest.fixture
def profile_picture_context(backend_server, memory_db):
    storage = MemoryPictureStorage()
    app = backend_server.create_app(
        database=memory_db,
        session_cookie_secure=False,
        allowed_origins=["http://localhost:3000"],
        profile_picture_storage=storage,
    )
    with TestClient(app) as client:
        account = {
            "id": "patient-picture-1", "email": "picture@example.org",
            "emailNormalized": "picture@example.org", "name": "Picture Patient",
            "role": "PATIENT", "active": True,
        }
        memory_db.users.documents.append(account)
        token = "patient-picture-session"
        memory_db.sessions.documents.append({
            "_id": "picture-session", "tokenHash": auth.token_hash(token),
            "userId": account["id"], "expiresAt": datetime.now(timezone.utc) + timedelta(hours=1),
        })
        client.cookies.set(auth.SESSION_COOKIE, token)
        yield client, memory_db, storage


def image_bytes(image_format="PNG", size=(32, 32), color=(40, 100, 80)):
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format=image_format)
    return buffer.getvalue()


def csrf_headers(client, *, include_token=True):
    response = client.get("/api/auth/csrf")
    headers = {"Origin": "http://localhost:3000"}
    if include_token:
        headers["X-CSRF-Token"] = response.json()["csrfToken"]
    return headers


def upload(client, data, filename="photo.png", mime="image/png"):
    return client.post(
        "/api/auth/me/profile-picture", headers=csrf_headers(client),
        files={"file": (filename, data, mime)},
    )


def test_upload_validates_and_persists_sanitized_image_and_serves_only_to_session(profile_picture_context):
    client, memory_db, storage = profile_picture_context
    response = upload(client, image_bytes())

    assert response.status_code == 200
    public_user = response.json()
    assert public_user["profilePictureUrl"].startswith("/auth/me/profile-picture?v=")
    assert "profilePictureKey" not in public_user
    assert "profilePictureContentType" not in public_user
    account = memory_db.users.documents[0]
    key = account["profilePictureKey"]
    assert key in storage.objects
    assert account["profilePictureContentType"] == "image/png"
    assert b"photo.png" not in storage.objects[key]

    fetched = client.get(f"/api{public_user['profilePictureUrl']}")
    assert fetched.status_code == 200
    assert fetched.headers["content-type"] == "image/png"
    assert fetched.headers["x-content-type-options"] == "nosniff"
    assert fetched.headers["cache-control"] == "no-store"
    assert fetched.content == storage.objects[key]



@pytest.mark.parametrize("data,filename,mime", [
    (b"<svg><script>alert(1)</script></svg>", "photo.svg", "image/svg+xml"),
    (b"this is not a raster image", "photo.jpg", "image/jpeg"),
])
def test_upload_rejects_unsupported_or_invalid_actual_image(profile_picture_context, data, filename, mime):
    client, _memory_db, _storage = profile_picture_context
    response = upload(client, data, filename, mime)
    assert response.status_code == 415


def test_upload_rejects_oversized_file_and_excessive_dimensions(profile_picture_context):
    client, _memory_db, _storage = profile_picture_context
    oversized = upload(client, b"x" * (5 * 1024 * 1024 + 1), "oversized.png", "image/png")
    assert oversized.status_code == 413
    excessive = upload(client, image_bytes(size=(4097, 1)))
    assert excessive.status_code == 413


def test_upload_requires_authentication_patient_role_and_csrf(profile_picture_context):
    client, memory_db, _storage = profile_picture_context
    session = client.cookies.get(auth.SESSION_COOKIE)
    client.cookies.delete(auth.SESSION_COOKIE)
    denied = upload(client, image_bytes())
    assert denied.status_code == 401
    client.cookies.set(auth.SESSION_COOKIE, session)

    memory_db.users.documents[0]["role"] = "DOCTOR"
    denied_role = upload(client, image_bytes())
    assert denied_role.status_code == 403

    memory_db.users.documents[0]["role"] = "PATIENT"
    no_csrf = client.post(
        "/api/auth/me/profile-picture", headers={"Origin": "http://localhost:3000"},
        files={"file": ("photo.png", image_bytes(), "image/png")},
    )
    assert no_csrf.status_code == 403


def test_replacement_removal_and_failed_storage_preserve_existing_image(profile_picture_context):
    client, memory_db, storage = profile_picture_context
    first = upload(client, image_bytes("PNG"))
    old_key = memory_db.users.documents[0]["profilePictureKey"]
    assert first.status_code == 200

    second = upload(client, image_bytes("JPEG", color=(150, 30, 20)), "new.jpg", "image/jpeg")
    assert second.status_code == 200
    new_key = memory_db.users.documents[0]["profilePictureKey"]
    assert new_key != old_key
    assert old_key not in storage.objects
    assert memory_db.users.documents[0]["profilePictureContentType"] == "image/jpeg"

    storage.fail_put = True
    failed = upload(client, image_bytes("WEBP", color=(20, 30, 140)), "last.webp", "image/webp")
    assert failed.status_code == 503
    assert memory_db.users.documents[0]["profilePictureKey"] == new_key
    assert new_key in storage.objects
    storage.fail_put = False

    removed = client.delete("/api/auth/me/profile-picture", headers=csrf_headers(client))
    assert removed.status_code == 200
    assert removed.json()["profilePictureUrl"] is None
    assert memory_db.users.documents[0]["profilePictureKey"] is None
    assert new_key not in storage.objects


def test_local_storage_rejects_path_traversal(tmp_path):
    storage = LocalProfilePictureStorage(tmp_path)
    with pytest.raises(ValueError):
        storage._path_for("..\\outside.png")
