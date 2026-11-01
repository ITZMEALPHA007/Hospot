"""Patient bed reservations and hospital-scoped booking management."""

import logging
import uuid
from datetime import date, datetime, timezone
from enum import Enum
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

try:
    from .auth import Role, current_user, get_db, require_roles
except ImportError:
    from auth import Role, current_user, get_db, require_roles

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["bed bookings"])

BedType = Literal["ICU", "General", "Special"]
BED_TYPES = ("ICU", "General", "Special")


class BookingStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class HospitalAdminBookingStatus(str, Enum):
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


class BookingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hospitalId: str = Field(min_length=1, max_length=128)
    bedType: BedType
    fullName: str = Field(min_length=2, max_length=120)
    age: int = Field(ge=1, le=120)
    gender: Literal["male", "female", "other"]
    bloodGroup: Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
    mobile: str = Field(min_length=3, max_length=32)
    email: Optional[EmailStr] = None
    emergencyContactName: str = Field(min_length=2, max_length=120)
    emergencyContactPhone: str = Field(min_length=3, max_length=32)
    primaryCondition: str = Field(min_length=2, max_length=2000)
    allergies: Optional[str] = Field(default=None, max_length=2000)
    currentMedications: Optional[str] = Field(default=None, max_length=4000)
    previousSurgeries: Optional[str] = Field(default=None, max_length=4000)
    insuranceProvider: Optional[str] = Field(default=None, max_length=200)
    policyNumber: Optional[str] = Field(default=None, max_length=200)
    specialRequests: Optional[str] = Field(default=None, max_length=4000)
    preferredAdmissionDate: Optional[date] = None
    admissionTime: Literal["immediate", "today", "week", "flexible"] = "immediate"

    @field_validator(
        "fullName", "mobile", "emergencyContactName", "emergencyContactPhone", "primaryCondition"
    )
    @classmethod
    def require_non_blank(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_is_optional(cls, value):
        return None if value == "" else value

    @field_validator("preferredAdmissionDate", mode="before")
    @classmethod
    def empty_admission_date_is_optional(cls, value):
        return None if value == "" else value


class BookingStatusUpdate(BaseModel):
    status: HospitalAdminBookingStatus


class BedBooking(BaseModel):
    id: str
    hospitalId: str
    hospitalName: str
    bedType: BedType
    patientId: str
    fullName: str
    age: int
    gender: str
    bloodGroup: str
    mobile: str
    email: Optional[EmailStr] = None
    emergencyContactName: str
    emergencyContactPhone: str
    primaryCondition: str
    allergies: Optional[str] = None
    currentMedications: Optional[str] = None
    previousSurgeries: Optional[str] = None
    insuranceProvider: Optional[str] = None
    policyNumber: Optional[str] = None
    specialRequests: Optional[str] = None
    preferredAdmissionDate: Optional[date] = None
    admissionTime: str
    status: BookingStatus
    createdAt: datetime
    updatedAt: datetime


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _hospital_supports_bed_type(hospital: Dict[str, Any], bed_type: str) -> bool:
    supported = hospital.get("bedTypes") or list(BED_TYPES)
    return bed_type in BED_TYPES and bed_type in supported


async def _run_transaction(db, operation):
    client = getattr(db, "client", None)
    if client is None:
        raise HTTPException(status_code=503, detail="Booking service requires transaction-capable MongoDB")
    try:
        session = await client.start_session()
        async with session:
            return await session.with_transaction(operation)
    except HTTPException:
        raise
    except Exception:
        logger.error("Booking transaction failed; no partial operation was accepted")
        raise HTTPException(status_code=503, detail="Booking service is temporarily unavailable")


async def _release_reserved_capacity(db, booking: Dict[str, Any], session) -> bool:
    bed_type = booking["bedType"]
    result = await db.hospitals.update_one(
        {"id": booking["hospitalId"], f"reservedBeds.{bed_type}": {"$gte": 1}},
        {"$inc": {f"availableBeds.{bed_type}": 1, f"reservedBeds.{bed_type}": -1}},
        session=session,
    )
    return result.matched_count == 1


async def _transition_and_release(db, scope_query, allowed_statuses, target_status):
    async def operation(session):
        booking = await db.bookings.find_one(scope_query, session=session)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        old_status = booking.get("status")
        if old_status not in allowed_statuses:
            raise HTTPException(status_code=409, detail="Booking cannot be changed in its current status")

        result = await db.bookings.update_one(
            {**scope_query, "status": old_status},
            {"$set": {"status": target_status, "updatedAt": utcnow()}},
            session=session,
        )
        if result.matched_count != 1:
            raise HTTPException(status_code=409, detail="Booking status has changed; reload and try again")

        if not await _release_reserved_capacity(db, booking, session):
            # Raising aborts the transaction, restoring the original booking
            # status rather than leaving a terminal booking with held capacity.
            raise HTTPException(status_code=409, detail="Booking capacity is inconsistent; contact the hospital")

        updated = await db.bookings.find_one(scope_query, session=session)
        return BedBooking(**updated)

    return await _run_transaction(db, operation)


@router.post("/bookings", response_model=BedBooking, status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: BookingCreate,
    user=Depends(require_roles(Role.PATIENT)),
    db=Depends(get_db),
):
    booking_id = str(uuid.uuid4())

    async def operation(session):
        hospital = await db.hospitals.find_one({"id": payload.hospitalId}, session=session)
        if not hospital or hospital.get("active") is False:
            raise HTTPException(status_code=404, detail="Hospital not found")
        if not _hospital_supports_bed_type(hospital, payload.bedType):
            raise HTTPException(status_code=422, detail="Bed type is not available at this hospital")

        bed_type = payload.bedType
        capacity_result = await db.hospitals.update_one(
            {"id": payload.hospitalId, f"availableBeds.{bed_type}": {"$gte": 1}},
            {"$inc": {f"availableBeds.{bed_type}": -1, f"reservedBeds.{bed_type}": 1}},
            session=session,
        )
        if capacity_result.matched_count != 1:
            raise HTTPException(status_code=409, detail="No beds of this type are currently available")

        now = utcnow()
        booking = payload.model_dump(mode="json")
        booking.update({
            "id": booking_id,
            "hospitalName": hospital.get("name", ""),
            "patientId": user["id"],
            "status": BookingStatus.PENDING.value,
            "createdAt": now,
            "updatedAt": now,
        })
        await db.bookings.insert_one(booking, session=session)
        return BedBooking(**booking)

    return await _run_transaction(db, operation)


@router.get("/bookings", response_model=list[BedBooking])
async def list_bookings(user=Depends(current_user), db=Depends(get_db)):
    if user.get("role") == Role.PATIENT.value:
        query = {"patientId": user["id"]}
    elif user.get("role") == Role.HOSPITAL_ADMIN.value:
        hospital_id = user.get("hospitalId")
        if not hospital_id:
            raise HTTPException(status_code=403, detail="No hospital is assigned to this account")
        query = {"hospitalId": hospital_id}
    else:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    bookings = await db.bookings.find(query).sort("createdAt", -1).to_list(100)
    return [BedBooking(**booking) for booking in bookings]


@router.get("/bookings/{booking_id}", response_model=BedBooking)
async def get_booking(booking_id: str, user=Depends(current_user), db=Depends(get_db)):
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    owns_booking = (
        user.get("role") == Role.PATIENT.value and booking.get("patientId") == user.get("id")
    )
    assigned_hospital = (
        user.get("role") == Role.HOSPITAL_ADMIN.value
        and bool(user.get("hospitalId"))
        and booking.get("hospitalId") == user.get("hospitalId")
    )
    if not (owns_booking or assigned_hospital):
        raise HTTPException(status_code=404, detail="Booking not found")
    return BedBooking(**booking)


@router.post("/bookings/{booking_id}/cancel", response_model=BedBooking)
async def cancel_booking(
    booking_id: str,
    user=Depends(require_roles(Role.PATIENT)),
    db=Depends(get_db),
):
    scope = {"id": booking_id, "patientId": user["id"]}
    return await _transition_and_release(
        db, scope,
        {BookingStatus.PENDING.value, BookingStatus.CONFIRMED.value},
        BookingStatus.CANCELLED.value,
    )


@router.patch("/admin/bookings/{booking_id}/status", response_model=BedBooking)
async def update_booking_status(
    booking_id: str,
    payload: BookingStatusUpdate,
    user=Depends(require_roles(Role.HOSPITAL_ADMIN)),
    db=Depends(get_db),
):
    hospital_id = user.get("hospitalId")
    if not hospital_id:
        raise HTTPException(status_code=403, detail="No hospital is assigned to this account")
    scope = {"id": booking_id, "hospitalId": hospital_id}
    if payload.status == BookingStatus.CONFIRMED:
        # Keep cross-hospital and unknown IDs indistinguishable, while
        # returning a conflict only for a booking in this hospital that has
        # already left the pending state.
        booking = await db.bookings.find_one(scope)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        result = await db.bookings.update_one(
            {**scope, "status": BookingStatus.PENDING.value},
            {"$set": {"status": BookingStatus.CONFIRMED.value, "updatedAt": utcnow()}},
        )
        if result.matched_count != 1:
            raise HTTPException(status_code=409, detail="Booking status has changed; reload and try again")
        updated = await db.bookings.find_one(scope)
        return BedBooking(**updated)
    return await _transition_and_release(
        db, scope, {BookingStatus.PENDING.value}, BookingStatus.REJECTED.value
    )
