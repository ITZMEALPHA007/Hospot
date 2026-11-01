"""Authenticated, minimized patient profile summary data."""

from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

try:
    from .auth import Role, current_user, get_db, require_roles
except ImportError:
    from auth import Role, current_user, get_db, require_roles


router = APIRouter(prefix="/api/patient/profile", tags=["patient profile"])


class RecentActivity(BaseModel):
    id: str
    type: Literal["booking", "order"]
    title: str
    status: str
    occurredAt: datetime


class PatientProfileSummary(BaseModel):
    memberSince: Optional[datetime] = None
    accountStatus: Literal["active"]
    totalBookings: int
    bookingStatuses: Dict[str, int]
    totalMedicineOrders: int
    fulfilledMedicineOrders: int
    nonCancelledOrderValue: float
    currency: Literal["INR"]
    recentActivity: List[RecentActivity]


BOOKING_STATUSES = ("pending", "confirmed", "rejected", "cancelled")
FULFILLED_ORDER_STATUSES = {"delivered", "picked_up"}


def _activity_time(document: dict, fallback_field: str):
    value = document.get("updatedAt") or document.get(fallback_field)
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return datetime.min.replace(tzinfo=timezone.utc)


def _booking_activity(booking: dict) -> RecentActivity:
    hospital_name = str(booking.get("hospitalName") or "Hospital")
    bed_type = str(booking.get("bedType") or "bed")
    return RecentActivity(
        id=str(booking.get("id", "")), type="booking",
        title=f"{bed_type} bed booking at {hospital_name}",
        status=str(booking.get("status") or "unknown"),
        occurredAt=_activity_time(booking, "createdAt"),
    )


def _order_activity(order: dict) -> RecentActivity:
    items = order.get("items") if isinstance(order.get("items"), list) else []
    item_names = [str(item.get("medicineName", "")) for item in items if isinstance(item, dict) and item.get("medicineName")]
    title = ", ".join(item_names[:2]) or "Medicine order"
    if len(item_names) > 2:
        title += f" and {len(item_names) - 2} more"
    return RecentActivity(
        id=str(order.get("id", "")), type="order", title=title,
        status=str(order.get("status") or "unknown"),
        occurredAt=_activity_time(order, "orderDate"),
    )


def _order_amount(order: dict) -> float:
    try:
        value = float(order.get("totalAmount", 0) or 0)
    except (TypeError, ValueError):
        return 0.0
    return value if value >= 0 else 0.0


@router.get("/summary", response_model=PatientProfileSummary)
async def patient_profile_summary(
    user=Depends(require_roles(Role.PATIENT)), db=Depends(get_db),
):
    """Return aggregate counts and a short activity summary for this session's patient."""
    patient_id = user["id"]
    bookings = await db.bookings.find({"patientId": patient_id}).to_list(None)
    orders = await db.orders.find({"userId": patient_id}).to_list(None)

    booking_statuses = {status: 0 for status in BOOKING_STATUSES}
    for booking in bookings:
        status = booking.get("status")
        if status in booking_statuses:
            booking_statuses[status] += 1

    # Order records are value snapshots. Exclude cancelled orders; payment/refund
    # settlement is not modeled, so expose this as order value rather than paid spend.
    order_value = sum(
        _order_amount(order)
        for order in orders
        if order.get("status") != "cancelled"
    )
    fulfilled = sum(1 for order in orders if order.get("status") in FULFILLED_ORDER_STATUSES)

    activity = [_booking_activity(booking) for booking in bookings]
    activity.extend(_order_activity(order) for order in orders)
    activity.sort(key=lambda item: item.occurredAt, reverse=True)

    return PatientProfileSummary(
        memberSince=user.get("createdAt"),
        accountStatus="active",
        totalBookings=len(bookings),
        bookingStatuses=booking_statuses,
        totalMedicineOrders=len(orders),
        fulfilledMedicineOrders=fulfilled,
        nonCancelledOrderValue=round(order_value, 2),
        currency="INR",
        recentActivity=activity[:8],
    )
