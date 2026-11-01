"""One-time interactive provisioning for the first HOSPOT platform administrator."""

import asyncio
import getpass
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import EmailStr, TypeAdapter
from pymongo.errors import DuplicateKeyError

try:
    from .auth import Role, hash_password, normalize_email, utcnow
    from .platform_admin_index import platform_admin_index_exists
except ImportError:
    from auth import Role, hash_password, normalize_email, utcnow
    from platform_admin_index import platform_admin_index_exists


class ProvisioningConflict(Exception):
    """Expected conflict caused by an existing account or concurrent bootstrap."""


def reject_existing_platform_admin(existing_account):
    """Refuse routine provisioning once any platform admin exists."""
    if existing_account:
        raise SystemExit("A platform administrator already exists; refusing to provision another with this command.")


def build_platform_admin_account(email, password):
    """Build a platform-admin document without database access."""
    normalized_email = normalize_email(str(TypeAdapter(EmailStr).validate_python(email)))
    if len(password) < 12:
        raise ValueError("Platform administrator passwords must contain at least 12 characters.")
    return {
        "id": secrets.token_urlsafe(18), "email": normalized_email, "emailNormalized": normalized_email,
        "name": normalized_email.split("@", 1)[0], "passwordHash": hash_password(password),
        "role": Role.PLATFORM_ADMIN.value, "active": True, "createdAt": utcnow(),
    }


async def create_first_platform_admin(users, account):
    """Insert the initial admin, relying on the database constraint for races."""
    if not await platform_admin_index_exists(users):
        raise ProvisioningConflict(
            "The platform-admin uniqueness index is missing. Run the approved preflight/migration before provisioning."
        )
    if await users.find_one({"role": Role.PLATFORM_ADMIN.value}):
        raise ProvisioningConflict(
            "A platform administrator already exists; refusing to create another."
        )
    if await users.find_one({"emailNormalized": account["emailNormalized"]}):
        raise ProvisioningConflict("An account with this email already exists.")
    try:
        await users.insert_one(account)
    except DuplicateKeyError as exc:
        # A competing bootstrap may win after our read. Recheck to report the
        # expected one-admin conflict without exposing MongoDB details.
        if await users.find_one({"role": Role.PLATFORM_ADMIN.value}):
            raise ProvisioningConflict(
                "A platform administrator was provisioned concurrently; no additional account was created."
            ) from exc
        raise ProvisioningConflict(
            "An account with this email already exists; no platform administrator was created."
        ) from exc


async def provision():
    load_dotenv(Path(__file__).parent / ".env")
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        raise SystemExit("MONGO_URL and DB_NAME must be configured in the backend environment.")

    email = normalize_email(str(TypeAdapter(EmailStr).validate_python(input("Platform administrator email: "))))
    password = getpass.getpass("Password (at least 12 characters): ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation or len(password) < 12:
        raise SystemExit("Passwords must match and contain at least 12 characters.")

    client = AsyncIOMotorClient(mongo_url)
    try:
        users = client[db_name].users
        try:
            await create_first_platform_admin(
                users, build_platform_admin_account(email, password)
            )
        except ProvisioningConflict as exc:
            raise SystemExit(str(exc)) from exc
        print("Platform administrator provisioned.")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(provision())
