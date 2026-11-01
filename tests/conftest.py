"""Isolated FastAPI and database fixtures for backend tests."""

import importlib
import sys

import pytest
from fastapi.testclient import TestClient

from tests.fakes import MemoryDatabase


@pytest.fixture
def memory_db():
    return MemoryDatabase()


@pytest.fixture
def no_real_mongo(monkeypatch):
    def reject_real_mongo(*_args, **_kwargs):
        pytest.fail("A test attempted to construct a real MongoDB client")

    motor = importlib.import_module("motor.motor_asyncio")
    monkeypatch.setattr(motor, "AsyncIOMotorClient", reject_real_mongo)
    # Keep the guard active even when modules imported their constructor alias
    # during test collection, before fixtures are set up.
    for module_name in (
        "backend.server",
        "backend.provision_platform_admin",
        "backend.migrate_platform_admin_index",
    ):
        if module_name in sys.modules:
            monkeypatch.setattr(sys.modules[module_name], "AsyncIOMotorClient", reject_real_mongo)


@pytest.fixture(autouse=True)
def block_real_mongo_for_every_test(no_real_mongo):
    return no_real_mongo


@pytest.fixture
def backend_server():
    # Importing server must be inert; the app creates Mongo only in lifespan.
    server = importlib.import_module("backend.server")
    assert server.app.state.mongo_client is None
    return server


@pytest.fixture
def backend_app(backend_server, memory_db):
    return backend_server.create_app(
        database=memory_db,
        session_cookie_secure=False,
        allowed_origins=["http://localhost:3000"],
    )


@pytest.fixture
def client(backend_app):
    # Using the context manager intentionally exercises app lifespan startup
    # and shutdown. The injected database prevents Mongo client construction.
    with TestClient(backend_app) as test_client:
        yield test_client
