"""Shared definition and inspection helpers for the platform-admin constraint."""

from typing import Any

try:
    from .auth import Role
except ImportError:
    from auth import Role

PLATFORM_ADMIN_INDEX_NAME = "one_platform_admin"
PLATFORM_ADMIN_INDEX_KEYS = [("role", 1)]
PLATFORM_ADMIN_INDEX_OPTIONS = {
    "name": PLATFORM_ADMIN_INDEX_NAME,
    "unique": True,
    "partialFilterExpression": {"role": Role.PLATFORM_ADMIN.value},
}


def is_platform_admin_unique_index(index: dict[str, Any]) -> bool:
    """Return whether an index description enforces one platform-admin row."""
    key = index.get("key", {})
    partial = index.get("partialFilterExpression", {})
    return (
        list(key.items()) == PLATFORM_ADMIN_INDEX_KEYS
        and index.get("unique") is True
        and partial == {"role": Role.PLATFORM_ADMIN.value}
    )


async def platform_admin_index_exists(users) -> bool:
    """Check existing metadata only; this function never creates an index."""
    indexes = await users.list_indexes().to_list(length=None)
    return any(is_platform_admin_unique_index(index) for index in indexes)
