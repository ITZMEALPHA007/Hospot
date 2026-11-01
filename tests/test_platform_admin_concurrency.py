"""Isolated tests for the single-platform-admin uniqueness constraint."""

import asyncio
from copy import deepcopy

from pymongo.errors import DuplicateKeyError

from backend import migrate_platform_admin_index as migration
from backend import provision_platform_admin as provisioning
from backend.auth import Role
from backend.platform_admin_index import (
    PLATFORM_ADMIN_INDEX_KEYS,
    PLATFORM_ADMIN_INDEX_OPTIONS,
)


class FakeCursor:
    def __init__(self, values):
        self.values = deepcopy(values)

    async def to_list(self, length=None):
        return self.values if length is None else self.values[:length]


class UniqueAdminCollection:
    """In-memory fake that enforces the requested partial unique index."""

    def __init__(self, documents=(), *, synchronize_admin_reads=False):
        self.documents = [deepcopy(item) for item in documents]
        self.indexes = []
        self.index_requests = []
        self.synchronize_admin_reads = synchronize_admin_reads
        self.admin_read_count = 0
        self.both_admin_reads_done = asyncio.Event()
        self.insert_lock = asyncio.Lock()

    async def count_documents(self, query):
        return sum(all(document.get(key) == value for key, value in query.items()) for document in self.documents)

    async def find_one(self, query):
        found = next(
            (deepcopy(document) for document in self.documents
             if all(document.get(key) == value for key, value in query.items())),
            None,
        )
        if (
            query.get("role") == Role.PLATFORM_ADMIN.value
            and self.synchronize_admin_reads
            and self.admin_read_count < 2
        ):
            self.admin_read_count += 1
            if self.admin_read_count == 2:
                self.both_admin_reads_done.set()
            await self.both_admin_reads_done.wait()
        return found

    async def insert_one(self, document):
        async with self.insert_lock:
            role_index_enforced = any(
                index.get("key") == dict(PLATFORM_ADMIN_INDEX_KEYS)
                and index.get("unique") is True
                and index.get("partialFilterExpression") == {"role": Role.PLATFORM_ADMIN.value}
                for index in self.indexes
            )
            if (
                role_index_enforced
                and document.get("role") == Role.PLATFORM_ADMIN.value
                and any(row.get("role") == Role.PLATFORM_ADMIN.value for row in self.documents)
            ):
                raise DuplicateKeyError("isolated fake platform-admin unique index conflict")
            self.documents.append(deepcopy(document))

    async def create_index(self, keys, **options):
        self.index_requests.append((deepcopy(keys), deepcopy(options)))
        self.indexes.append({"key": dict(keys), **deepcopy(options)})
        return options.get("name", "fake-index")

    def list_indexes(self):
        return FakeCursor(self.indexes)


def account(email):
    return {
        "id": email,
        "email": email,
        "emailNormalized": email,
        "role": Role.PLATFORM_ADMIN.value,
        "passwordHash": "fake-hash",
    }


def test_competing_bootstrap_attempts_cannot_create_two_platform_admins():
    async def run_competition():
        users = UniqueAdminCollection(synchronize_admin_reads=True)
        await users.create_index(PLATFORM_ADMIN_INDEX_KEYS, **PLATFORM_ADMIN_INDEX_OPTIONS)
        outcomes = await asyncio.gather(
            provisioning.create_first_platform_admin(users, account("first@example.com")),
            provisioning.create_first_platform_admin(users, account("second@example.com")),
            return_exceptions=True,
        )
        return users, outcomes

    users, outcomes = asyncio.run(run_competition())
    assert sum(outcome is None for outcome in outcomes) == 1
    failures = [
        outcome for outcome in outcomes
        if isinstance(outcome, provisioning.ProvisioningConflict)
    ]
    assert len(failures) == 1
    assert "provisioned concurrently" in str(failures[0])
    assert sum(row.get("role") == Role.PLATFORM_ADMIN.value for row in users.documents) == 1


def test_provisioning_refuses_to_insert_until_constraint_is_installed():
    users = UniqueAdminCollection()

    try:
        asyncio.run(provisioning.create_first_platform_admin(users, account("first@example.com")))
    except provisioning.ProvisioningConflict as exc:
        assert "uniqueness index is missing" in str(exc)
    else:
        raise AssertionError("Provisioning unexpectedly proceeded without the unique index")

    assert users.documents == []


def test_migration_preflight_reports_duplicates_without_modifying_data():
    existing = [account("first@example.com"), account("second@example.com")]
    users = UniqueAdminCollection(existing)

    result = asyncio.run(migration.preflight_platform_admin_index(users))
    apply_result = asyncio.run(migration.apply_platform_admin_index(users))

    assert result == {"platform_admin_count": 2, "index_exists": False, "safe_to_apply": False}
    assert apply_result == result
    assert users.documents == existing
    assert users.index_requests == []


def test_migration_applies_only_the_partial_unique_platform_admin_index():
    users = UniqueAdminCollection([account("existing@example.com")])

    result = asyncio.run(migration.apply_platform_admin_index(users))

    assert result == {"platform_admin_count": 1, "index_exists": True, "safe_to_apply": True}
    assert users.index_requests == [(PLATFORM_ADMIN_INDEX_KEYS, PLATFORM_ADMIN_INDEX_OPTIONS)]
    assert users.indexes == [{"key": dict(PLATFORM_ADMIN_INDEX_KEYS), **PLATFORM_ADMIN_INDEX_OPTIONS}]
