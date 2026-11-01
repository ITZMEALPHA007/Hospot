"""Private profile-picture storage with a development-local implementation."""

import asyncio
import os
import re
import tempfile
from pathlib import Path
from typing import Protocol


_SAFE_KEY = re.compile(r"^[0-9a-f]{32}\.(?:jpg|png|webp)$")


class ProfilePictureStorage(Protocol):
    async def put(self, key: str, content: bytes) -> None: ...
    async def get(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> None: ...


class LocalProfilePictureStorage:
    """Private disk storage for local development or a persistent shared volume."""

    def __init__(self, root: Path | str | None = None):
        configured_root = root or os.environ.get("HOSPOT_PROFILE_PICTURE_DIR")
        self.root = Path(configured_root).expanduser().resolve() if configured_root else (
            Path(__file__).resolve().parent / "uploads" / "profile-pictures"
        )

    def _path_for(self, key: str) -> Path:
        if not _SAFE_KEY.fullmatch(key):
            raise ValueError("Invalid profile picture storage key")
        target = (self.root / key).resolve()
        try:
            target.relative_to(self.root)
        except ValueError as exc:
            raise ValueError("Invalid profile picture storage key") from exc
        return target

    def _put(self, key: str, content: bytes) -> None:
        target = self._path_for(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(dir=target.parent, prefix=".profile-", delete=False) as temporary:
                temporary_path = Path(temporary.name)
                temporary.write(content)
                temporary.flush()
                os.fsync(temporary.fileno())
            os.replace(temporary_path, target)
        finally:
            if temporary_path is not None and temporary_path.exists():
                temporary_path.unlink(missing_ok=True)

    def _get(self, key: str) -> bytes:
        return self._path_for(key).read_bytes()

    def _delete(self, key: str) -> None:
        self._path_for(key).unlink(missing_ok=True)

    async def put(self, key: str, content: bytes) -> None:
        await asyncio.to_thread(self._put, key, content)

    async def get(self, key: str) -> bytes:
        return await asyncio.to_thread(self._get, key)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._delete, key)
