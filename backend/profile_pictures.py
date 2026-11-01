"""Authenticated patient picture upload, retrieval, and removal endpoints."""

import asyncio
import io
import logging
import secrets
import warnings
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

try:
    from .auth import PublicUser, Role, current_user, get_db, public_user, require_roles
except ImportError:
    from auth import PublicUser, Role, current_user, get_db, public_user, require_roles


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["patient profile picture"])

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_IMAGE_DIMENSION = 4096
MAX_IMAGE_PIXELS = 16_000_000
FORMATS = {
    "JPEG": ("jpg", "image/jpeg"),
    "PNG": ("png", "image/png"),
    "WEBP": ("webp", "image/webp"),
}


def sanitize_image(content: bytes):
    """Decode and re-encode a supported raster image, stripping metadata/polyglots."""
    if not content:
        raise HTTPException(status_code=415, detail="Choose a valid JPEG, PNG, or WebP image")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as image:
                image_format = image.format
                if image_format not in FORMATS:
                    raise HTTPException(status_code=415, detail="Only JPEG, PNG, and WebP images are supported")
                width, height = image.size
                if width < 1 or height < 1 or width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION or width * height > MAX_IMAGE_PIXELS:
                    raise HTTPException(status_code=413, detail="Image dimensions exceed the allowed limit")
                if getattr(image, "n_frames", 1) != 1:
                    raise HTTPException(status_code=415, detail="Animated images are not supported")
                image.verify()

            with Image.open(io.BytesIO(content)) as image:
                image.load()
                image = ImageOps.exif_transpose(image)
                has_alpha = "A" in image.getbands() or "transparency" in image.info
                if image_format == "JPEG":
                    image = image.convert("RGB")
                else:
                    image = image.convert("RGBA" if has_alpha else "RGB")
                output = io.BytesIO()
                image.save(output, format=image_format, optimize=True)
                sanitized = output.getvalue()
    except HTTPException:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(status_code=413, detail="Image dimensions exceed the allowed limit")
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        raise HTTPException(status_code=415, detail="The uploaded file is not a valid supported image")

    if len(sanitized) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The processed image exceeds the 5 MB limit")
    extension, content_type = FORMATS[image_format]
    return sanitized, extension, content_type


def picture_storage(request: Request):
    storage = getattr(request.app.state, "profile_picture_storage", None)
    if storage is None:
        raise HTTPException(status_code=503, detail="Profile picture storage is unavailable")
    return storage


async def _best_effort_delete(storage, key: Optional[str]):
    if not key:
        return
    try:
        await storage.delete(key)
    except Exception:
        # Orphan cleanup must never invalidate the account's current image.
        logger.warning("Profile picture cleanup failed")


@router.post("/me/profile-picture", response_model=PublicUser)
async def upload_profile_picture(
    file: UploadFile = File(...),
    user=Depends(require_roles(Role.PATIENT)),
    db=Depends(get_db),
    storage=Depends(picture_storage),
):
    try:
        content = await file.read(MAX_UPLOAD_BYTES + 1)
    finally:
        await file.close()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 5 MB or smaller")

    sanitized, extension, content_type = await asyncio.to_thread(sanitize_image, content)
    new_key = f"{secrets.token_hex(16)}.{extension}"
    try:
        await storage.put(new_key, sanitized)
    except Exception:
        logger.warning("Profile picture storage write failed")
        raise HTTPException(status_code=503, detail="Profile picture could not be saved")

    old_key = user.get("profilePictureKey")
    version = secrets.token_hex(12)
    try:
        result = await db.users.update_one(
            {"id": user["id"], "active": True},
            {"$set": {
                "profilePictureKey": new_key,
                "profilePictureContentType": content_type,
                "profilePictureVersion": version,
            }},
        )
    except Exception:
        # The database outcome may be ambiguous. Retain both objects rather than
        # risk deleting the new object if its key was committed.
        logger.warning("Profile picture reference update failed")
        raise HTTPException(status_code=503, detail="Profile picture could not be saved")
    if result.matched_count != 1:
        await _best_effort_delete(storage, new_key)
        raise HTTPException(status_code=404, detail="Patient account not found")

    updated_user = dict(user)
    updated_user.update({
        "profilePictureKey": new_key,
        "profilePictureContentType": content_type,
        "profilePictureVersion": version,
    })
    if old_key and old_key != new_key:
        await _best_effort_delete(storage, old_key)
    return public_user(updated_user)


@router.get("/me/profile-picture")
async def get_profile_picture(
    user=Depends(current_user), storage=Depends(picture_storage),
):
    if user.get("role") != Role.PATIENT.value:
        raise HTTPException(status_code=404, detail="Profile picture not found")
    key = user.get("profilePictureKey")
    content_type = user.get("profilePictureContentType")
    allowed_types = {value[1] for value in FORMATS.values()}
    if not key or content_type not in allowed_types:
        raise HTTPException(status_code=404, detail="Profile picture not found")
    try:
        content = await storage.get(key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Profile picture not found")
    except Exception:
        logger.warning("Profile picture storage read failed")
        raise HTTPException(status_code=503, detail="Profile picture is temporarily unavailable")
    return Response(
        content=content,
        media_type=content_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        },
    )


@router.delete("/me/profile-picture", response_model=PublicUser)
async def remove_profile_picture(
    user=Depends(require_roles(Role.PATIENT)),
    db=Depends(get_db),
    storage=Depends(picture_storage),
):
    old_key = user.get("profilePictureKey")
    if not old_key:
        return public_user(user)
    try:
        result = await db.users.update_one(
            {"id": user["id"], "active": True},
            {"$set": {
                "profilePictureKey": None,
                "profilePictureContentType": None,
                "profilePictureVersion": None,
            }},
        )
    except Exception:
        logger.warning("Profile picture reference removal failed")
        raise HTTPException(status_code=503, detail="Profile picture could not be removed")
    if result.matched_count != 1:
        raise HTTPException(status_code=404, detail="Patient account not found")

    updated_user = dict(user)
    updated_user.update({
        "profilePictureKey": None,
        "profilePictureContentType": None,
        "profilePictureVersion": None,
    })
    await _best_effort_delete(storage, old_key)
    return public_user(updated_user)
