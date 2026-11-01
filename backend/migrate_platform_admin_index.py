"""Preflight or explicitly apply the single-platform-admin MongoDB index.

Default execution is read-only. Pass --apply only during an approved,
controlled rollout after reviewing the preflight output.
"""

import argparse
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

try:
    from .auth import Role
    from .platform_admin_index import (
        PLATFORM_ADMIN_INDEX_KEYS,
        PLATFORM_ADMIN_INDEX_OPTIONS,
        platform_admin_index_exists,
    )
except ImportError:
    from auth import Role
    from platform_admin_index import (
        PLATFORM_ADMIN_INDEX_KEYS,
        PLATFORM_ADMIN_INDEX_OPTIONS,
        platform_admin_index_exists,
    )


async def preflight_platform_admin_index(users):
    """Report count and current constraint state without changing the database."""
    count = await users.count_documents({"role": Role.PLATFORM_ADMIN.value})
    exists = await platform_admin_index_exists(users)
    return {"platform_admin_count": count, "index_exists": exists, "safe_to_apply": count <= 1}


async def apply_platform_admin_index(users):
    """Create the partial unique index only after a duplicate-safe preflight."""
    result = await preflight_platform_admin_index(users)
    if result["platform_admin_count"] > 1:
        return result
    if not result["index_exists"]:
        await users.create_index(PLATFORM_ADMIN_INDEX_KEYS, **PLATFORM_ADMIN_INDEX_OPTIONS)
    result["index_exists"] = True
    return result


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Create the index after preflight; use only after approval and review.",
    )
    return parser.parse_args(argv)


async def run(apply=False):
    load_dotenv(Path(__file__).parent / ".env")
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        raise SystemExit("MONGO_URL and DB_NAME must be configured in the backend environment.")

    client = AsyncIOMotorClient(mongo_url)
    try:
        users = client[db_name].users
        result = (
            await apply_platform_admin_index(users)
            if apply
            else await preflight_platform_admin_index(users)
        )
        print(f"Existing platform-admin account count: {result['platform_admin_count']}")
        if result["platform_admin_count"] > 1:
            print("Duplicate platform-admin accounts found. No changes were made; resolve manually before applying.")
            return 1
        if apply:
            print("Platform-admin uniqueness index is present.")
        elif result["index_exists"]:
            print("Platform-admin uniqueness index is already present; no changes were made.")
        else:
            print("Preflight is clear. No changes were made. Use --apply only after approved rollout review.")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(apply=parse_args().apply)))
