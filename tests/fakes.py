"""Small in-memory Mongo-shaped objects used by backend tests only."""

from copy import deepcopy
import asyncio
import re


class UpdateResult:
    def __init__(self, matched_count=0):
        self.matched_count = matched_count


class Cursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *_args):
        return self

    async def to_list(self, _length):
        return deepcopy(self.documents)


class MemoryCollection:
    def __init__(self):
        self.documents = []
        self.index_requests = []
        self._update_lock = asyncio.Lock()
        self.fail_next_update = None
        self.fail_after_next_update = None
        self.fail_next_insert = None
        self.fail_after_next_insert = None

    async def count_documents(self, query):
        return sum(1 for document in self.documents if matches(document, query))

    async def find_one(self, query, session=None):
        for document in self.documents:
            if matches(document, query):
                return deepcopy(document)
        return None

    async def insert_one(self, document, session=None):
        if self.fail_next_insert is not None:
            error, self.fail_next_insert = self.fail_next_insert, None
            raise error
        stored = deepcopy(document)
        stored.setdefault("_id", f"memory-{len(self.documents)}")
        self.documents.append(stored)
        if self.fail_after_next_insert is not None:
            error, self.fail_after_next_insert = self.fail_after_next_insert, None
            raise error
        return UpdateResult(1)

    async def insert_many(self, documents):
        for document in documents:
            await self.insert_one(document)
        return UpdateResult(len(documents))

    async def update_one(self, query, update, session=None):
        if self.fail_next_update is not None:
            error, self.fail_next_update = self.fail_next_update, None
            raise error
        async with self._update_lock:
            for document in self.documents:
                if matches(document, query):
                    for key, value in update.get("$set", {}).items():
                        set_path(document, key, deepcopy(value))
                    for key, value in update.get("$inc", {}).items():
                        current = get_path(document, key) or 0
                        set_path(document, key, current + value)
                    for key in update.get("$unset", {}):
                        unset_path(document, key)
                    if self.fail_after_next_update is not None:
                        error, self.fail_after_next_update = self.fail_after_next_update, None
                        raise error
                    return UpdateResult(1)
            return UpdateResult(0)

    async def update_many(self, query, update):
        matched = 0
        for document in self.documents:
            if not matches(document, query):
                continue
            matched += 1
            for key, value in update.get("$set", {}).items():
                set_path(document, key, deepcopy(value))
            for key, value in update.get("$inc", {}).items():
                current = get_path(document, key) or 0
                set_path(document, key, current + value)
        return UpdateResult(matched)

    async def delete_one(self, query):
        for index, document in enumerate(self.documents):
            if matches(document, query):
                del self.documents[index]
                return UpdateResult(1)
        return UpdateResult(0)

    def find(self, query):
        return Cursor([doc for doc in self.documents if matches(doc, query)])

    async def create_index(self, *args, **kwargs):
        # Record the startup request; this fake never creates a database index.
        self.index_requests.append((args, kwargs))
        return "memory-index"


class MemoryDatabase:
    def __init__(self):
        self.users = MemoryCollection()
        self.sessions = MemoryCollection()
        self.invitations = MemoryCollection()
        self.hospitals = MemoryCollection()
        self.medicines = MemoryCollection()
        self.prescriptions = MemoryCollection()
        self.orders = MemoryCollection()
        self.carts = MemoryCollection()
        self.bookings = MemoryCollection()
        self._transaction_lock = asyncio.Lock()
        self.client = MemoryMongoClient(self)


class MemoryMongoClient:
    def __init__(self, database):
        self.database = database

    async def start_session(self):
        return MemorySession(self.database)


class MemorySession:
    def __init__(self, database):
        self.database = database

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def with_transaction(self, callback):
        async with self.database._transaction_lock:
            collections = {
                name: getattr(self.database, name)
                for name in (
                    "users", "sessions", "invitations", "hospitals", "medicines",
                    "prescriptions", "orders", "carts", "bookings",
                )
            }
            snapshots = {
                name: (deepcopy(collection.documents), list(collection.documents))
                for name, collection in collections.items()
            }
            try:
                return await callback(self)
            except BaseException:
                for name, collection in collections.items():
                    saved_documents, original_documents = snapshots[name]
                    for original, saved in zip(original_documents, saved_documents):
                        original.clear()
                        original.update(deepcopy(saved))
                    collection.documents[:] = original_documents
                raise


def matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(document, clause) for clause in expected):
                return False
            continue
        actual = get_path(document, key)
        if isinstance(expected, dict):
            if "$lt" in expected and (actual is None or actual >= expected["$lt"]):
                return False
            if "$gt" in expected and (actual is None or actual <= expected["$gt"]):
                return False
            if "$gte" in expected and (actual is None or actual < expected["$gte"]):
                return False
            if "$lte" in expected and (actual is None or actual > expected["$lte"]):
                return False
            if "$in" in expected and actual not in expected["$in"]:
                return False
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            if "$regex" in expected:
                flags = re.IGNORECASE if expected.get("$options") == "i" else 0
                if actual is None or re.search(expected["$regex"], str(actual), flags) is None:
                    return False
            if "$elemMatch" in expected:
                if not isinstance(actual, list) or not any(
                    matches({"value": item}, {"value": expected["$elemMatch"]})
                    for item in actual
                ):
                    return False
        elif actual != expected:
            return False
    return True


def get_path(document, path):
    value = document
    for key in path.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def set_path(document, path, value):
    parts = path.split(".")
    target = document
    for key in parts[:-1]:
        target = target.setdefault(key, {})
    target[parts[-1]] = value


def unset_path(document, path):
    parts = path.split(".")
    target = document
    for key in parts[:-1]:
        target = target.get(key)
        if not isinstance(target, dict):
            return
    target.pop(parts[-1], None)
