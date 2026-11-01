"""Doctor account management routes scoped to Hospot's existing roles."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
try:
    from .auth import ProfileUpdate, Role, get_db, require_roles
except ImportError:
    from auth import ProfileUpdate, Role, get_db, require_roles

router = APIRouter(prefix="/api", tags=["hospital and doctor management"])


def doctor_public_fields(account):
    return {
        "id": account["id"],
        "email": account["email"],
        "name": account["name"],
        "role": account["role"],
        "hospitalId": account.get("hospitalId"),
        "active": bool(account.get("active", True)),
    }


@router.get("/doctors/me")
async def get_own_doctor_profile(user=Depends(require_roles(Role.DOCTOR))):
    return doctor_public_fields(user)


@router.patch("/doctors/me")
async def update_own_doctor_profile(
    payload: ProfileUpdate,
    user=Depends(require_roles(Role.DOCTOR)),
    db=Depends(get_db),
):
    name = payload.name.strip()
    result = await db.users.update_one(
        {"id": user["id"], "role": Role.DOCTOR.value, "active": True},
        {"$set": {"name": name}},
    )
    if result.matched_count != 1:
        raise HTTPException(status_code=404, detail="Doctor account not found")
    updated = {**user, "name": name}
    return doctor_public_fields(updated)


@router.get("/admin/doctors")
async def list_managed_doctors(
    hospital_id: Optional[str] = Query(None, alias="hospitalId"),
    user=Depends(require_roles(Role.HOSPITAL_ADMIN, Role.PLATFORM_ADMIN)),
    db=Depends(get_db),
):
    query = {"role": Role.DOCTOR.value}
    if user["role"] == Role.HOSPITAL_ADMIN.value:
        assigned_hospital = user.get("hospitalId")
        if not assigned_hospital:
            raise HTTPException(status_code=403, detail="No hospital is assigned to this account")
        if hospital_id and hospital_id != assigned_hospital:
            raise HTTPException(status_code=404, detail="Hospital not found")
        query["hospitalId"] = assigned_hospital
    elif hospital_id:
        query["hospitalId"] = hospital_id
    doctors = await db.users.find(query).to_list(500)
    return [doctor_public_fields(doctor) for doctor in doctors]


@router.get("/admin/doctors/{doctor_id}")
async def get_managed_doctor(
    doctor_id: str,
    user=Depends(require_roles(Role.HOSPITAL_ADMIN, Role.PLATFORM_ADMIN)),
    db=Depends(get_db),
):
    query = {"id": doctor_id, "role": Role.DOCTOR.value}
    if user["role"] == Role.HOSPITAL_ADMIN.value:
        hospital_id = user.get("hospitalId")
        if not hospital_id:
            raise HTTPException(status_code=403, detail="No hospital is assigned to this account")
        query["hospitalId"] = hospital_id
    doctor = await db.users.find_one(query)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return doctor_public_fields(doctor)


@router.patch("/admin/doctors/{doctor_id}/deactivate")
async def deactivate_managed_doctor(
    doctor_id: str,
    user=Depends(require_roles(Role.HOSPITAL_ADMIN, Role.PLATFORM_ADMIN)),
    db=Depends(get_db),
):
    query = {"id": doctor_id, "role": Role.DOCTOR.value, "active": {"$ne": False}}
    if user["role"] == Role.HOSPITAL_ADMIN.value:
        hospital_id = user.get("hospitalId")
        if not hospital_id:
            raise HTTPException(status_code=403, detail="No hospital is assigned to this account")
        query["hospitalId"] = hospital_id
    result = await db.users.update_one(query, {"$set": {"active": False}})
    if result.matched_count != 1:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return {"id": doctor_id, "active": False}
