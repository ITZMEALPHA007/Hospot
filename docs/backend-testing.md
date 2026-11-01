# Backend testing

## Safe test command

From the repository root, run:

```powershell
py -m pytest -q tests/test_auth.py
```

The backend test suite requires the packages in `backend/requirements.txt` to
already be available, including `pytest` and `httpx` (used by FastAPI's
`TestClient`). Do not point a test run at a production database. The tests in
this repository use an in-memory database and need no running MongoDB service.

## Isolation model

`backend.server.create_app(database=...)` accepts an application database.
Production MongoDB client creation is deferred until application lifespan
startup and only occurs when no database was injected. Importing the backend
module does not construct a Mongo client or perform database operations.

The fixtures in `tests/conftest.py` inject a fresh `MemoryDatabase` for every
test and replace the Motor client constructor with a fail-fast guard before
importing the application. A test that omits injection and attempts to create
a real Mongo client fails immediately. The `TestClient` fixture uses its
context manager, so FastAPI startup and shutdown run against the injected
database. The in-memory collection's `create_index` method only records the
startup request; it does not create a MongoDB index.

Tests create a new app rather than mutating the module-level production app.
Pytest's `monkeypatch` fixture restores the guarded constructor after each
test, and the fresh app/database are discarded at fixture teardown.
