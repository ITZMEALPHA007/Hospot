from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, Query, HTTPException, Depends, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
from pathlib import Path
from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import List, Optional, Dict, Any, Literal
import uuid
from datetime import date, datetime, timedelta, timezone
from enum import Enum
import hmac
try:
    from .auth import router as auth_router, current_user, require_roles, Role, get_db
    from .bookings import router as bookings_router
    from .management import router as management_router
    from .profile_summary import router as profile_summary_router
    from .profile_pictures import router as profile_picture_router
    from .profile_picture_storage import LocalProfilePictureStorage
    from .email_change import router as email_change_router
    from .email_delivery import email_delivery_from_environment
except ImportError:
    from auth import router as auth_router, current_user, require_roles, Role, get_db
    from bookings import router as bookings_router
    from management import router as management_router
    from profile_summary import router as profile_summary_router
    from profile_pictures import router as profile_picture_router
    from profile_picture_storage import LocalProfilePictureStorage
    from email_change import router as email_change_router
    from email_delivery import email_delivery_from_environment

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

def configured_origins_from_environment():
    configured = [origin.strip() for origin in os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",") if origin.strip() and origin.strip() != "*"]
    return configured or ["http://localhost:3000", "http://127.0.0.1:3000"]


async def protect_api_mutations(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        csrf_cookie = request.cookies.get("hospot_csrf")
        csrf_header = request.headers.get("x-csrf-token")
        if origin not in request.app.state.allowed_origins or not csrf_cookie or not csrf_header or not hmac.compare_digest(csrf_cookie, csrf_header):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=403, content={"detail": "CSRF validation failed"})
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Hospital Models
class BedAvailability(BaseModel):
    ICU: int = Field(default=0, ge=0)
    General: int = Field(default=0, ge=0)
    Special: int = Field(default=0, ge=0)

class Hospital(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    location: str
    phone: str
    address: str
    bedTypes: List[str] = ["ICU", "General", "Special"]
    availableBeds: BedAvailability
    reservedBeds: BedAvailability = Field(default_factory=BedAvailability)
    rating: float = 4.5
    distance: str = "2.5 km"
    emergency: bool = True
    active: bool = True

class HospitalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=160)
    location: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=3, max_length=32)
    address: str = Field(min_length=2, max_length=500)
    bedTypes: List[Literal["ICU", "General", "Special"]] = Field(
        default_factory=lambda: ["ICU", "General", "Special"], min_length=1
    )
    availableBeds: BedAvailability = Field(default_factory=BedAvailability)
    rating: float = Field(default=4.5, ge=0, le=5)
    distance: str = Field(default="2.5 km", max_length=80)
    emergency: bool = True

    @field_validator("name", "location", "phone", "address")
    @classmethod
    def clean_hospital_text(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value


class HospitalUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    location: Optional[str] = Field(default=None, min_length=2, max_length=160)
    phone: Optional[str] = Field(default=None, min_length=3, max_length=32)
    address: Optional[str] = Field(default=None, min_length=2, max_length=500)
    rating: Optional[float] = Field(default=None, ge=0, le=5)
    distance: Optional[str] = Field(default=None, max_length=80)
    emergency: Optional[bool] = None

    @field_validator("name", "location", "phone", "address", "distance")
    @classmethod
    def clean_optional_hospital_text(cls, value):
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value

    @model_validator(mode="after")
    def require_update(self):
        if not any(getattr(self, field) is not None for field in self.model_fields_set):
            raise ValueError("At least one hospital field must be supplied")
        return self

# Medicine System Models
class MedicineCategory(str, Enum):
    PAIN_RELIEF = "Pain Relief"
    ANTIBIOTICS = "Antibiotics"
    VITAMINS = "Vitamins"
    DIABETES = "Diabetes"
    HEART = "Heart & Blood Pressure"
    DIGESTIVE = "Digestive Health"
    RESPIRATORY = "Respiratory"
    SKIN_CARE = "Skin Care"
    MENTAL_HEALTH = "Mental Health"
    WOMEN_HEALTH = "Women's Health"
    CHILD_HEALTH = "Child Health"
    EYE_CARE = "Eye Care"
    SUPPLEMENTS = "Supplements"
    FIRST_AID = "First Aid"
    ALLERGY_COLD = "Allergy & Cold"

class MedicineType(str, Enum):
    OTC = "Over-the-Counter"
    PRESCRIPTION = "Prescription Required"

class Medicine(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: MedicineCategory
    type: MedicineType
    description: str
    price: float = Field(ge=0)
    dosage: str
    sideEffects: List[str] = []
    activeIngredients: List[str] = []
    manufacturer: str
    expiryDate: str
    inStock: int = Field(default=0, ge=0)
    imageUrl: Optional[str] = None
    imageSource: Optional[str] = None
    imageAlt: Optional[str] = None
    prescriptionRequired: bool
    minAge: Optional[int] = None
    maxAge: Optional[int] = None
    warnings: List[str] = []
    usage: str
    createdAt: datetime = Field(default_factory=datetime.now)
    updatedAt: Optional[datetime] = None
    active: bool = True
    lowStock: bool = False
    expired: bool = False
    # True identifies curated example records; it is not a claim of sellable stock.
    isDemo: bool = False

class MedicineCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=160)
    category: MedicineCategory
    type: MedicineType
    description: str = Field(min_length=2, max_length=2000)
    price: float = Field(ge=0)
    dosage: str = Field(min_length=1, max_length=500)
    sideEffects: List[str] = Field(default_factory=list)
    activeIngredients: List[str] = Field(default_factory=list)
    manufacturer: str = Field(min_length=2, max_length=160)
    expiryDate: str = Field(min_length=4, max_length=40)
    inStock: int = Field(default=0, ge=0)
    imageUrl: Optional[AnyHttpUrl] = None
    imageSource: Optional[AnyHttpUrl] = None
    imageAlt: Optional[str] = Field(default=None, max_length=300)
    prescriptionRequired: bool
    minAge: Optional[int] = Field(default=None, ge=0, le=130)
    maxAge: Optional[int] = Field(default=None, ge=0, le=130)
    warnings: List[str] = Field(default_factory=list)
    usage: str = Field(min_length=1, max_length=1000)

    @field_validator("name", "description", "dosage", "manufacturer", "expiryDate", "usage")
    @classmethod
    def clean_medicine_text(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value

    @field_validator("expiryDate")
    @classmethod
    def validate_expiry_date(cls, value):
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("expiryDate must use YYYY-MM-DD format") from exc
        return value

    @field_validator("imageAlt")
    @classmethod
    def clean_image_alt(cls, value):
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("imageAlt cannot be blank")
        return value

    @model_validator(mode="after")
    def validate_image_metadata(self):
        image_parts = (self.imageUrl, self.imageSource, self.imageAlt)
        if any(part is not None for part in image_parts) and not all(part is not None for part in image_parts):
            raise ValueError("imageUrl, imageSource and imageAlt must be supplied together")
        if self.minAge is not None and self.maxAge is not None and self.minAge > self.maxAge:
            raise ValueError("minAge cannot exceed maxAge")
        return self


class MedicineUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    category: Optional[MedicineCategory] = None
    type: Optional[MedicineType] = None
    description: Optional[str] = Field(default=None, min_length=2, max_length=2000)
    price: Optional[float] = Field(default=None, ge=0)
    dosage: Optional[str] = Field(default=None, min_length=1, max_length=500)
    sideEffects: Optional[List[str]] = None
    activeIngredients: Optional[List[str]] = None
    manufacturer: Optional[str] = Field(default=None, min_length=2, max_length=160)
    expiryDate: Optional[str] = Field(default=None, min_length=4, max_length=40)
    imageUrl: Optional[AnyHttpUrl] = None
    imageSource: Optional[AnyHttpUrl] = None
    imageAlt: Optional[str] = Field(default=None, max_length=300)
    prescriptionRequired: Optional[bool] = None
    minAge: Optional[int] = Field(default=None, ge=0, le=130)
    maxAge: Optional[int] = Field(default=None, ge=0, le=130)
    warnings: Optional[List[str]] = None
    usage: Optional[str] = Field(default=None, min_length=1, max_length=1000)

    @field_validator("name", "description", "dosage", "manufacturer", "expiryDate", "usage")
    @classmethod
    def reject_blank_medicine_text(cls, value):
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value

    @field_validator("expiryDate")
    @classmethod
    def validate_optional_expiry_date(cls, value):
        if value is None:
            return value
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("expiryDate must use YYYY-MM-DD format") from exc
        return value

    @field_validator("imageAlt")
    @classmethod
    def clean_optional_image_alt(cls, value):
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("imageAlt cannot be blank")
        return value

    @model_validator(mode="after")
    def validate_update_payload(self):
        if not self.model_fields_set:
            raise ValueError("At least one medicine field must be supplied")
        nullable_fields = {"minAge", "maxAge", "imageUrl", "imageSource", "imageAlt"}
        for field in self.model_fields_set - nullable_fields:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        image_fields = {"imageUrl", "imageSource", "imageAlt"}
        supplied_images = self.model_fields_set & image_fields
        if supplied_images and supplied_images != image_fields:
            raise ValueError("imageUrl, imageSource and imageAlt must be updated together")
        if supplied_images and any(getattr(self, field) is not None for field in image_fields):
            if not all(getattr(self, field) is not None for field in image_fields):
                raise ValueError("imageUrl, imageSource and imageAlt must be supplied together")
        if self.minAge is not None and self.maxAge is not None and self.minAge > self.maxAge:
            raise ValueError("minAge cannot exceed maxAge")
        return self


class MedicineStockAdjustment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    adjustment: int = Field(ge=-1_000_000, le=1_000_000)

    @field_validator("adjustment")
    @classmethod
    def require_nonzero_adjustment(cls, value):
        if value == 0:
            raise ValueError("Stock adjustment must be nonzero")
        return value


LOW_STOCK_THRESHOLD = 10


def medicine_response(document: Dict[str, Any]) -> Medicine:
    data = dict(document)
    data.setdefault("active", True)
    data["lowStock"] = int(data.get("inStock", 0) or 0) <= LOW_STOCK_THRESHOLD
    try:
        data["expired"] = date.fromisoformat(str(data.get("expiryDate", ""))) < date.today()
    except ValueError:
        # Fail closed for unparseable legacy expiry values.
        data["expired"] = True
    return Medicine(**data)

# Prescription Models
class Prescription(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    doctorName: str
    hospitalName: str
    prescriptionDate: datetime
    medicines: List[Dict[str, Any]]  # [{"medicineId": str, "medicineName": str, "dosage": str, "duration": str}]
    notes: Optional[str] = None
    imageUrl: Optional[str] = None  # Prescription image
    isUsed: bool = False
    createdAt: datetime = Field(default_factory=datetime.now)

class PrescriptionCreate(BaseModel):
    userId: Optional[str] = None
    doctorName: str
    hospitalName: str
    prescriptionDate: datetime
    medicines: List[Dict[str, Any]]
    notes: Optional[str] = None
    imageUrl: Optional[str] = None

# Shopping Cart Models
class CartItem(BaseModel):
    medicineId: str = Field(min_length=1, max_length=128)
    medicineName: str = Field(min_length=1, max_length=160)
    price: float = Field(ge=0)
    quantity: int = Field(ge=1, le=1000)
    prescriptionId: Optional[str] = None

class CartAddRequest(BaseModel):
    # Legacy UI fields such as medicineName and price are ignored on input.
    medicineId: str = Field(min_length=1, max_length=128)
    quantity: int = Field(ge=1, le=1000)
    prescriptionId: Optional[str] = None

class Cart(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    items: List[CartItem] = Field(default_factory=list)
    totalAmount: float = 0.0
    updatedAt: datetime = Field(default_factory=datetime.now)

# Order Models
class OrderStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PREPARING = "preparing"
    READY_FOR_PICKUP = "ready_for_pickup"
    PICKED_UP = "picked_up"
    READY_FOR_DISPATCH = "ready_for_dispatch"
    DISPATCHED = "dispatched"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class FulfillmentMethod(str, Enum):
    PICKUP = "PICKUP"
    HOME_DELIVERY = "HOME_DELIVERY"

class PaymentMethod(str, Enum):
    CASH_ON_DELIVERY = "cash_on_delivery"
    CARD = "card"
    UPI = "upi"

class OrderItem(BaseModel):
    medicineId: str = Field(min_length=1, max_length=128)
    medicineName: str = Field(min_length=1, max_length=160)
    price: float = Field(ge=0)  # Unit price snapshot from the catalog.
    quantity: int = Field(ge=1, le=1000)
    prescriptionId: Optional[str] = None


class PickupLocationSnapshot(BaseModel):
    id: str
    name: str
    location: str
    address: str
    phone: str

class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    items: List[OrderItem]
    totalAmount: float
    itemSubtotal: Optional[float] = None
    deliveryFee: Optional[float] = None
    currency: Optional[Literal["INR"]] = None
    fulfillmentMethod: Optional[FulfillmentMethod] = None
    pickupLocation: Optional[PickupLocationSnapshot] = None
    pickupReference: Optional[str] = None
    # Stock remains global and has not been allocated to this location.
    inventoryScope: Optional[Literal["GLOBAL_UNALLOCATED"]] = None
    deliveryAddress: Optional[str] = None
    contactNumber: Optional[str] = None
    paymentMethod: PaymentMethod
    status: OrderStatus = OrderStatus.PENDING
    orderDate: datetime = Field(default_factory=datetime.now)
    estimatedDelivery: Optional[datetime] = None
    notes: Optional[str] = None
    prescriptionIds: List[str] = Field(default_factory=list)
    updatedAt: Optional[datetime] = None
    deliveryProvider: Optional[str] = None
    shipmentId: Optional[str] = None
    trackingNumber: Optional[str] = None
    trackingUrl: Optional[str] = None
    shipmentStatus: Optional[str] = None
    dispatchedAt: Optional[datetime] = None
    deliveredAt: Optional[datetime] = None

class OrderCreate(BaseModel):
    # Unknown legacy checkout fields (items, totalAmount, userId) are ignored;
    # the cart, session, and current catalog are authoritative.
    model_config = ConfigDict(extra="ignore")

    fulfillmentMethod: FulfillmentMethod = FulfillmentMethod.HOME_DELIVERY
    pickupLocationId: Optional[str] = Field(default=None, min_length=1, max_length=128)
    deliveryAddress: Optional[str] = Field(default=None, min_length=5, max_length=500)
    contactNumber: Optional[str] = Field(default=None, min_length=3, max_length=32)
    paymentMethod: PaymentMethod
    notes: Optional[str] = None

    @field_validator("deliveryAddress", "contactNumber", "pickupLocationId")
    @classmethod
    def clean_checkout_text(cls, value):
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value

    @model_validator(mode="after")
    def validate_fulfillment_details(self):
        if self.fulfillmentMethod == FulfillmentMethod.PICKUP:
            if not self.pickupLocationId:
                raise ValueError("pickupLocationId is required for pharmacy pickup")
        elif not self.deliveryAddress or not self.contactNumber:
            raise ValueError("deliveryAddress and contactNumber are required for home delivery")
        return self

# Initialize dummy hospital data
async def init_dummy_data(database):
    """Initialize the database with dummy hospital data"""
    existing_count = await database.hospitals.count_documents({})
    if existing_count == 0:
        dummy_hospitals = [
            {
                "id": str(uuid.uuid4()),
                "name": "City General Hospital",
                "location": "Downtown",
                "phone": "+1-555-0101",
                "address": "123 Main Street, Downtown",
                "bedTypes": ["ICU", "General", "Special"],
                "availableBeds": {"ICU": 5, "General": 25, "Special": 8},
                "rating": 4.7,
                "distance": "1.2 km",
                "emergency": True
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Metro Medical Center",
                "location": "Midtown",
                "phone": "+1-555-0102",
                "address": "456 Health Ave, Midtown",
                "bedTypes": ["ICU", "General", "Special"],
                "availableBeds": {"ICU": 12, "General": 45, "Special": 15},
                "rating": 4.8,
                "distance": "2.1 km",
                "emergency": True
            },
            {
                "id": str(uuid.uuid4()),
                "name": "St. Mary's Hospital",
                "location": "Westside",
                "phone": "+1-555-0103",
                "address": "789 Care Blvd, Westside",
                "bedTypes": ["ICU", "General", "Special"],
                "availableBeds": {"ICU": 8, "General": 30, "Special": 10},
                "rating": 4.6,
                "distance": "3.5 km",
                "emergency": True
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Riverside Emergency Hospital",
                "location": "Eastside",
                "phone": "+1-555-0104",
                "address": "321 River Road, Eastside",
                "bedTypes": ["ICU", "General", "Special"],
                "availableBeds": {"ICU": 3, "General": 18, "Special": 5},
                "rating": 4.4,
                "distance": "4.2 km",
                "emergency": True
            },
            {
                "id": str(uuid.uuid4()),
                "name": "North Hills Medical",
                "location": "Northside",
                "phone": "+1-555-0105",
                "address": "654 Hill Top Dr, Northside",
                "bedTypes": ["ICU", "General", "Special"],
                "availableBeds": {"ICU": 15, "General": 60, "Special": 20},
                "rating": 4.9,
                "distance": "5.8 km",
                "emergency": True
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Sunset Community Hospital",
                "location": "Southside",
                "phone": "+1-555-0106",
                "address": "987 Sunset Blvd, Southside",
                "bedTypes": ["ICU", "General", "Special"],
                "availableBeds": {"ICU": 0, "General": 12, "Special": 3},
                "rating": 4.3,
                "distance": "6.1 km",
                "emergency": False
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Central Heart Institute",
                "location": "Medical District",
                "phone": "+1-555-0107",
                "address": "147 Medical Plaza, Medical District",
                "bedTypes": ["ICU", "General", "Special"],
                "availableBeds": {"ICU": 20, "General": 35, "Special": 25},
                "rating": 4.8,
                "distance": "3.2 km",
                "emergency": True
            }
        ]
        
        await database.hospitals.insert_many(dummy_hospitals)
        logger.info("Dummy hospital data initialized")

# Initialize dummy medicine data
SEED_MEDICINE_IDENTITIES = {
    ("Paracetamol 500mg", "HealthCorp"),
    ("Ibuprofen 400mg", "PharmaMax"),
    ("Amoxicillin 500mg", "BioMed Solutions"),
    ("Vitamin D3 1000 IU", "NutriCare"),
    ("Metformin 500mg", "DiabetCare Ltd"),
    ("Amlodipine 5mg", "CardioMed"),
    ("Omeprazole 20mg", "GastroHealth"),
    ("Salbutamol Inhaler", "RespiCare"),
    ("Antiseptic Cream", "FirstAid Plus"),
    ("Sertraline 50mg", "MindWell Pharma"),
    ("Aspirin 325mg", "CardioHealth"),
    ("Tramadol 50mg", "PainCare Ltd"),
    ("Vitamin C 1000mg", "ImmuneBoost"),
    ("B-Complex", "EnergyPlus"),
    ("Azithromycin 250mg", "InfectiCure"),
    ("Cetirizine 10mg", "AllergyFree"),
    ("Cough Syrup", "CoughCure"),
    ("Probiotics", "GutHealth Pro"),
    ("Hydrocortisone Cream 1%", "SkinCare Plus"),
    ("Sunscreen SPF 50", "SunGuard"),
    ("Artificial Tears", "EyeComfort"),
    ("Children's Fever Reducer", "KidsHealth"),
    ("Multivitamin Gummies for Kids", "KidsVitamin Co"),
}

# Clearly labeled examples for local/demo catalog use. These are inserted only
# when neither the stable demo ID nor the exact name/manufacturer exists.
# Product imagery is intentionally unavailable until reuse rights are verified.
DEMO_MEDICINES = [
    {
        "id": "demo-electral-ors-21-8g", "name": "Electral ORS Powder 21.8g",
        "category": "First Aid", "type": "Over-the-Counter",
        "description": "Demo catalog entry for an oral rehydration salts sachet.",
        "price": 22.0, "dosage": "Dissolve one sachet in the volume of clean water stated on the pack.",
        "sideEffects": [], "activeIngredients": ["Oral rehydration salts"],
        "manufacturer": "FDC Limited", "expiryDate": "2028-06-30", "inStock": 40,
        "prescriptionRequired": False, "warnings": ["Use the full sachet with the pack-directed volume of water."],
        "usage": "Rehydration support; follow the product label.",
    },
    {
        "id": "demo-digene-gel-200ml", "name": "Digene Gel 200ml",
        "category": "Digestive Health", "type": "Over-the-Counter",
        "description": "Demo catalog entry for an antacid and antiflatulent oral gel.",
        "price": 145.0, "dosage": "Use only as directed on the product label.",
        "sideEffects": [], "activeIngredients": ["Aluminium hydroxide", "Magnesium hydroxide", "Simethicone"],
        "manufacturer": "Abbott India Limited", "expiryDate": "2028-03-31", "inStock": 25,
        "prescriptionRequired": False, "warnings": ["Check the pack label and consult a clinician if symptoms persist."],
        "usage": "For occasional acidity and gas symptoms; follow the product label.",
    },
    {
        "id": "demo-dabur-honitus-100ml", "name": "Dabur Honitus Cough Syrup 100ml",
        "category": "Respiratory", "type": "Over-the-Counter",
        "description": "Demo catalog entry for an Ayurvedic honey-based cough syrup.",
        "price": 121.0, "dosage": "Use only as directed on the product label.",
        "sideEffects": [], "activeIngredients": [], "manufacturer": "Dabur India Limited",
        "expiryDate": "2028-05-31", "inStock": 18, "prescriptionRequired": False,
        "warnings": ["Review age directions and ingredients on the pack."],
        "usage": "Use according to the product label.",
    },
    {
        "id": "demo-volini-gel-30g", "name": "Volini Pain Relief Gel 30g",
        "category": "Pain Relief", "type": "Over-the-Counter",
        "description": "Demo catalog entry for a topical pain-relief gel.",
        "price": 105.0, "dosage": "Apply only as directed on the product label.",
        "sideEffects": [], "activeIngredients": [], "manufacturer": "Sun Pharmaceutical Industries Limited",
        "expiryDate": "2028-02-29", "inStock": 20, "prescriptionRequired": False,
        "warnings": ["For external use only. Avoid eyes and broken skin."],
        "usage": "Topical use; follow the product label.",
    },
    {
        "id": "demo-limcee-vitamin-c-500mg", "name": "Limcee Vitamin C 500mg",
        "category": "Vitamins", "type": "Over-the-Counter",
        "description": "Demo catalog entry for a vitamin C chewable tablet.",
        "price": 24.0, "dosage": "Use only as directed on the product label.",
        "sideEffects": [], "activeIngredients": ["Ascorbic acid 500mg"],
        "manufacturer": "Abbott Healthcare Private Limited", "expiryDate": "2028-04-30",
        "inStock": 50, "prescriptionRequired": False, "warnings": [],
        "usage": "Vitamin C supplement; follow the product label.",
    },
    {
        "id": "demo-zincovit-tablets", "name": "Zincovit Tablets",
        "category": "Supplements", "type": "Prescription Required",
        "description": "Demo catalog entry for a multivitamin and mineral supplement.",
        "price": 110.0, "dosage": "Use only as directed on the product label.",
        "sideEffects": [], "activeIngredients": [], "manufacturer": "Apex Laboratories Private Limited",
        "expiryDate": "2028-07-31", "inStock": 30, "prescriptionRequired": True,
        "warnings": ["Do not exceed the label directions."],
        "usage": "Nutritional supplement; follow the product label.",
    },
    {
        "id": "demo-dabur-chyawanprash-500g", "name": "Dabur Chyawanprash 500g",
        "category": "Supplements", "type": "Over-the-Counter",
        "description": "Demo catalog entry for a traditional herbal health tonic.",
        "price": 245.0, "dosage": "Use only as directed on the product label.",
        "sideEffects": [], "activeIngredients": [], "manufacturer": "Dabur India Limited",
        "expiryDate": "2028-08-31", "inStock": 16, "prescriptionRequired": False,
        "warnings": ["Review ingredients and age directions on the pack."],
        "usage": "Use according to the product label.",
    },
    {
        "id": "demo-eno-fruit-salt-5g", "name": "ENO Fruit Salt Lemon 5g",
        "category": "Digestive Health", "type": "Over-the-Counter",
        "description": "Demo catalog entry for a single-use effervescent antacid sachet.",
        "price": 10.0, "dosage": "Dissolve and use only as directed on the product label.",
        "sideEffects": [], "activeIngredients": [], "manufacturer": "Haleon India",
        "expiryDate": "2028-01-31", "inStock": 35, "prescriptionRequired": False,
        "warnings": ["Review sodium content and pack directions."],
        "usage": "For occasional acidity; follow the product label.",
    },
    {
        "id": "demo-pudin-hara-pearls-10", "name": "Dabur Pudin Hara Pearls 10 Capsules",
        "category": "Digestive Health", "type": "Over-the-Counter",
        "description": "Demo catalog entry for an herbal digestive product.",
        "price": 42.0, "dosage": "Use only as directed on the product label.",
        "sideEffects": [], "activeIngredients": [], "manufacturer": "Dabur India Limited",
        "expiryDate": "2028-06-30", "inStock": 22, "prescriptionRequired": False,
        "warnings": ["Review ingredients and directions on the pack."],
        "usage": "Use according to the product label.",
    },
    {
        "id": "demo-betadine-ointment-5-20g", "name": "Betadine Ointment 5% 20g",
        "category": "First Aid", "type": "Over-the-Counter",
        "description": "Demo catalog entry for a povidone-iodine topical antiseptic ointment.",
        "price": 105.0, "dosage": "Apply only as directed on the product label.",
        "sideEffects": [], "activeIngredients": ["Povidone-iodine 5%"],
        "manufacturer": "Win-Medicare Private Limited", "expiryDate": "2028-03-31",
        "inStock": 14, "prescriptionRequired": False,
        "warnings": ["For external use only. Avoid eyes. Seek medical advice for large or deep wounds."],
        "usage": "Topical antiseptic use; follow the product label.",
    },
    {
        "id": "demo-vicks-vaporub-25g", "name": "Vicks VapoRub 25g",
        "category": "Respiratory", "type": "Over-the-Counter",
        "description": "Demo catalog entry for a topical aromatic ointment.",
        "price": 75.0, "dosage": "Use only as directed on the product label.",
        "sideEffects": [], "activeIngredients": [], "manufacturer": "Procter & Gamble Hygiene and Health Care Limited",
        "expiryDate": "2028-05-31", "inStock": 27, "prescriptionRequired": False,
        "warnings": ["For external use only. Do not ingest."],
        "usage": "Use according to the product label.",
    },
    {
        "id": "demo-shelcal-500-tablets", "name": "Shelcal 500 Tablets",
        "category": "Supplements", "type": "Prescription Required",
        "description": "Demo catalog entry for a calcium and vitamin D supplement.",
        "price": 135.0, "dosage": "Use only as directed on the product label.",
        "sideEffects": [], "activeIngredients": ["Calcium 500mg", "Vitamin D3"],
        "manufacturer": "Torrent Pharmaceuticals Limited", "expiryDate": "2028-09-30",
        "inStock": 24, "prescriptionRequired": True,
        "warnings": ["Ask a clinician before use if you have a kidney condition."],
        "usage": "Calcium supplement; follow the product label.",
    },
]


def demo_medicine_document(seed):
    return {
        **seed,
        "imageUrl": None,
        "imageSource": None,
        "imageAlt": None,
        "isDemo": True,
        "active": True,
        "createdAt": datetime.now(timezone.utc),
    }


async def init_medicine_data(database):
    """Initialize the database with dummy medicine data"""
    existing_count = await database.medicines.count_documents({})
    if existing_count == 0:
        dummy_medicines = [
            # Pain Relief
            {
                "id": str(uuid.uuid4()),
                "name": "Paracetamol 500mg",
                "category": "Pain Relief",
                "type": "Over-the-Counter",
                "description": "Effective pain reliever and fever reducer",
                "price": 15.99,
                "dosage": "1-2 tablets every 4-6 hours, max 8 tablets/day",
                "sideEffects": ["Nausea", "Stomach upset (rare)"],
                "activeIngredients": ["Paracetamol 500mg"],
                "manufacturer": "HealthCorp",
                "expiryDate": "2026-12-31",
                "inStock": 100,
                "imageUrl": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300",
                "prescriptionRequired": False,
                "minAge": 12,
                "warnings": ["Do not exceed recommended dose", "Avoid alcohol"],
                "usage": "Take with or after food",
                "createdAt": datetime.now()
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Ibuprofen 400mg",
                "category": "Pain Relief",
                "type": "Over-the-Counter",
                "description": "Anti-inflammatory pain reliever",
                "price": 22.50,
                "dosage": "1 tablet every 6-8 hours with food",
                "sideEffects": ["Stomach irritation", "Dizziness", "Headache"],
                "activeIngredients": ["Ibuprofen 400mg"],
                "manufacturer": "PharmaMax",
                "expiryDate": "2025-10-15",
                "inStock": 75,
                "imageUrl": "https://images.unsplash.com/photo-1550572017-dda13fca1095?w=300",
                "prescriptionRequired": False,
                "minAge": 12,
                "warnings": ["Take with food", "Not suitable for pregnant women"],
                "usage": "Best taken with meals",
                "createdAt": datetime.now()
            },
            
            # Antibiotics
            {
                "id": str(uuid.uuid4()),
                "name": "Amoxicillin 500mg",
                "category": "Antibiotics",
                "type": "Prescription Required",
                "description": "Broad-spectrum antibiotic for bacterial infections",
                "price": 45.00,
                "dosage": "1 capsule 3 times daily for 7-10 days",
                "sideEffects": ["Nausea", "Diarrhea", "Skin rash", "Allergic reactions"],
                "activeIngredients": ["Amoxicillin 500mg"],
                "manufacturer": "BioMed Solutions",
                "expiryDate": "2025-08-20",
                "inStock": 50,
                "imageUrl": "https://images.unsplash.com/photo-1576671081837-49000212a370?w=300",
                "prescriptionRequired": True,
                "warnings": ["Complete full course", "Inform doctor of allergies"],
                "usage": "Take with water, can be taken with or without food",
                "createdAt": datetime.now()
            },
            
            # Vitamins
            {
                "id": str(uuid.uuid4()),
                "name": "Vitamin D3 1000 IU",
                "category": "Vitamins",
                "type": "Over-the-Counter",
                "description": "Essential vitamin for bone health and immunity",
                "price": 18.99,
                "dosage": "1 tablet daily with meal",
                "sideEffects": ["Rare: nausea, constipation"],
                "activeIngredients": ["Cholecalciferol 1000 IU"],
                "manufacturer": "NutriCare",
                "expiryDate": "2026-05-30",
                "inStock": 120,
                "imageUrl": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300",
                "prescriptionRequired": False,
                "warnings": ["Store in cool, dry place"],
                "usage": "Take with fat-containing meal for better absorption",
                "createdAt": datetime.now()
            },
            
            # Diabetes
            {
                "id": str(uuid.uuid4()),
                "name": "Metformin 500mg",
                "category": "Diabetes",
                "type": "Prescription Required",
                "description": "First-line treatment for type 2 diabetes",
                "price": 35.75,
                "dosage": "1 tablet twice daily with meals",
                "sideEffects": ["Nausea", "Diarrhea", "Metallic taste", "Lactic acidosis (rare)"],
                "activeIngredients": ["Metformin HCl 500mg"],
                "manufacturer": "DiabetCare Ltd",
                "expiryDate": "2025-12-15",
                "inStock": 80,
                "imageUrl": "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=300",
                "prescriptionRequired": True,
                "warnings": ["Monitor kidney function", "Avoid alcohol"],
                "usage": "Take with meals to reduce stomach upset",
                "createdAt": datetime.now()
            },
            
            # Heart & Blood Pressure
            {
                "id": str(uuid.uuid4()),
                "name": "Amlodipine 5mg",
                "category": "Heart & Blood Pressure",
                "type": "Prescription Required",
                "description": "Calcium channel blocker for high blood pressure",
                "price": 28.50,
                "dosage": "1 tablet once daily",
                "sideEffects": ["Ankle swelling", "Dizziness", "Flushing", "Fatigue"],
                "activeIngredients": ["Amlodipine besylate 5mg"],
                "manufacturer": "CardioMed",
                "expiryDate": "2025-09-10",
                "inStock": 60,
                "imageUrl": "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=300",
                "prescriptionRequired": True,
                "warnings": ["Monitor blood pressure regularly", "Rise slowly from sitting"],
                "usage": "Can be taken with or without food",
                "createdAt": datetime.now()
            },
            
            # Digestive Health
            {
                "id": str(uuid.uuid4()),
                "name": "Omeprazole 20mg",
                "category": "Digestive Health",
                "type": "Over-the-Counter",
                "description": "Proton pump inhibitor for acid reflux and heartburn",
                "price": 19.99,
                "dosage": "1 capsule daily before breakfast",
                "sideEffects": ["Headache", "Nausea", "Abdominal pain", "Constipation"],
                "activeIngredients": ["Omeprazole 20mg"],
                "manufacturer": "GastroHealth",
                "expiryDate": "2026-03-25",
                "inStock": 90,
                "imageUrl": "https://images.unsplash.com/photo-1628771065518-0d82f1938462?w=300",
                "prescriptionRequired": False,
                "minAge": 18,
                "warnings": ["Not for immediate relief", "Consult doctor if symptoms persist"],
                "usage": "Take 30 minutes before eating",
                "createdAt": datetime.now()
            },
            
            # Respiratory
            {
                "id": str(uuid.uuid4()),
                "name": "Salbutamol Inhaler",
                "category": "Respiratory",
                "type": "Prescription Required",
                "description": "Fast-acting bronchodilator for asthma and COPD",
                "price": 55.00,
                "dosage": "1-2 puffs as needed, max 8 puffs/day",
                "sideEffects": ["Tremor", "Rapid heartbeat", "Nervousness", "Headache"],
                "activeIngredients": ["Salbutamol 100mcg/puff"],
                "manufacturer": "RespiCare",
                "expiryDate": "2025-07-30",
                "inStock": 40,
                "imageUrl": "https://images.unsplash.com/photo-1584362917165-526f39dcc19c?w=300",
                "prescriptionRequired": True,
                "warnings": ["Shake before use", "Rinse mouth after use"],
                "usage": "Inhale slowly and deeply",
                "createdAt": datetime.now()
            },
            
            # First Aid
            {
                "id": str(uuid.uuid4()),
                "name": "Antiseptic Cream",
                "category": "First Aid",
                "type": "Over-the-Counter",
                "description": "Prevents infection in minor cuts and wounds",
                "price": 12.99,
                "dosage": "Apply thin layer 2-3 times daily",
                "sideEffects": ["Mild skin irritation (rare)"],
                "activeIngredients": ["Chlorhexidine 0.1%"],
                "manufacturer": "FirstAid Plus",
                "expiryDate": "2026-01-15",
                "inStock": 150,
                "imageUrl": "https://images.unsplash.com/photo-1556909114-d8cb3b2de43c?w=300",
                "prescriptionRequired": False,
                "warnings": ["For external use only", "Avoid contact with eyes"],
                "usage": "Clean wound before application",
                "createdAt": datetime.now()
            },
            
            {
                "id": str(uuid.uuid4()),
                "name": "Sertraline 50mg",
                "category": "Mental Health",
                "type": "Prescription Required",
                "description": "SSRI antidepressant for depression and anxiety",
                "price": 42.00,
                "dosage": "1 tablet daily, preferably in morning",
                "sideEffects": ["Nausea", "Insomnia", "Dizziness", "Sexual dysfunction"],
                "activeIngredients": ["Sertraline HCl 50mg"],
                "manufacturer": "MindWell Pharma",
                "expiryDate": "2025-11-20",
                "inStock": 30,
                "imageUrl": "https://images.unsplash.com/photo-1628771065485-a501d4e5b29c?w=300",
                "prescriptionRequired": True,
                "warnings": ["May take 4-6 weeks to show effect", "Do not stop suddenly"],
                "usage": "Take with food to reduce nausea",
                "createdAt": datetime.now()
            },
            
            # Additional Pain Relief medicines
            {
                "id": str(uuid.uuid4()),
                "name": "Aspirin 325mg",
                "category": "Pain Relief",
                "type": "Over-the-Counter",
                "description": "Pain reliever, fever reducer and blood thinner",
                "price": 12.99,
                "dosage": "1-2 tablets every 4 hours, max 12 tablets/day",
                "sideEffects": ["Stomach irritation", "Bleeding risk", "Tinnitus"],
                "activeIngredients": ["Acetylsalicylic acid 325mg"],
                "manufacturer": "CardioHealth",
                "expiryDate": "2026-04-10",
                "inStock": 85,
                "imageUrl": "https://images.unsplash.com/photo-1584362917165-526f39dcc19c?w=300",
                "prescriptionRequired": False,
                "minAge": 18,
                "warnings": ["Not for children under 18", "Take with food", "Consult doctor if on blood thinners"],
                "usage": "Take with food or milk",
                "createdAt": datetime.now()
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Tramadol 50mg",
                "category": "Pain Relief",
                "type": "Prescription Required",
                "description": "Strong pain reliever for moderate to severe pain",
                "price": 38.75,
                "dosage": "1-2 tablets every 6-8 hours as needed",
                "sideEffects": ["Drowsiness", "Nausea", "Constipation", "Dizziness"],
                "activeIngredients": ["Tramadol HCl 50mg"],
                "manufacturer": "PainCare Ltd",
                "expiryDate": "2025-09-15",
                "inStock": 45,
                "imageUrl": "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=300",
                "prescriptionRequired": True,
                "warnings": ["May cause drowsiness", "Avoid alcohol", "Risk of dependency"],
                "usage": "Can be taken with or without food",
                "createdAt": datetime.now()
            },
            
            # Additional Vitamins
            {
                "id": str(uuid.uuid4()),
                "name": "Vitamin C 1000mg",
                "category": "Vitamins",
                "type": "Over-the-Counter",
                "description": "Immune system support and antioxidant",
                "price": 16.50,
                "dosage": "1 tablet daily",
                "sideEffects": ["Stomach upset", "Diarrhea (high doses)"],
                "activeIngredients": ["Ascorbic acid 1000mg"],
                "manufacturer": "ImmuneBoost",
                "expiryDate": "2026-08-20",
                "inStock": 110,
                "imageUrl": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300",
                "prescriptionRequired": False,
                "warnings": ["Store in cool, dry place"],
                "usage": "Take with or after meals",
                "createdAt": datetime.now()
            },
            {
                "id": str(uuid.uuid4()),
                "name": "B-Complex",
                "category": "Vitamins",
                "type": "Over-the-Counter",
                "description": "Complete B vitamin complex for energy and metabolism",
                "price": 21.99,
                "dosage": "1 capsule daily with breakfast",
                "sideEffects": ["Bright yellow urine (normal)", "Mild nausea"],
                "activeIngredients": ["B1, B2, B3, B5, B6, B7, B9, B12"],
                "manufacturer": "EnergyPlus",
                "expiryDate": "2026-06-30",
                "inStock": 95,
                "imageUrl": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300",
                "prescriptionRequired": False,
                "warnings": ["Take with food to avoid nausea"],
                "usage": "Best taken with breakfast",
                "createdAt": datetime.now()
            },
            
            # Additional Antibiotics
            {
                "id": str(uuid.uuid4()),
                "name": "Azithromycin 250mg",
                "category": "Antibiotics",
                "type": "Prescription Required",
                "description": "Antibiotic for respiratory and skin infections",
                "price": 52.00,
                "dosage": "1 tablet daily for 5 days",
                "sideEffects": ["Nausea", "Diarrhea", "Abdominal pain", "Headache"],
                "activeIngredients": ["Azithromycin 250mg"],
                "manufacturer": "InfectiCure",
                "expiryDate": "2025-10-25",
                "inStock": 35,
                "imageUrl": "https://images.unsplash.com/photo-1576671081837-49000212a370?w=300",
                "prescriptionRequired": True,
                "warnings": ["Complete full course", "Take at same time daily"],
                "usage": "Can be taken with or without food",
                "createdAt": datetime.now()
            },
            
            # Allergy & Cold medicines
            {
                "id": str(uuid.uuid4()),
                "name": "Cetirizine 10mg",
                "category": "Allergy & Cold",
                "type": "Over-the-Counter",
                "description": "Antihistamine for allergies and hay fever",
                "price": 14.25,
                "dosage": "1 tablet daily",
                "sideEffects": ["Drowsiness", "Dry mouth", "Fatigue"],
                "activeIngredients": ["Cetirizine HCl 10mg"],
                "manufacturer": "AllergyFree",
                "expiryDate": "2026-02-15",
                "inStock": 70,
                "imageUrl": "https://images.unsplash.com/photo-1550572017-dda13fca1095?w=300",
                "prescriptionRequired": False,
                "warnings": ["May cause drowsiness", "Avoid alcohol"],
                "usage": "Take in the evening to minimize drowsiness",
                "createdAt": datetime.now()
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Cough Syrup",
                "category": "Allergy & Cold",
                "type": "Over-the-Counter",
                "description": "Relieves cough and soothes throat irritation",
                "price": 18.75,
                "dosage": "10ml every 4-6 hours, max 6 doses/day",
                "sideEffects": ["Drowsiness", "Nausea", "Constipation"],
                "activeIngredients": ["Dextromethorphan 15mg/5ml"],
                "manufacturer": "CoughCure",
                "expiryDate": "2025-12-10",
                "inStock": 65,
                "imageUrl": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300",
                "prescriptionRequired": False,
                "minAge": 6,
                "warnings": ["Not for children under 6", "Shake well before use"],
                "usage": "Measure with provided cup",
                "createdAt": datetime.now()
            },
            
            # Additional Digestive Health
            {
                "id": str(uuid.uuid4()),
                "name": "Probiotics",
                "category": "Digestive Health",
                "type": "Over-the-Counter",
                "description": "Beneficial bacteria for digestive health",
                "price": 29.99,
                "dosage": "1 capsule daily with meal",
                "sideEffects": ["Mild bloating initially", "Gas (temporary)"],
                "activeIngredients": ["Lactobacillus, Bifidobacterium 10 billion CFU"],
                "manufacturer": "GutHealth Pro",
                "expiryDate": "2026-01-30",
                "inStock": 55,
                "imageUrl": "https://images.unsplash.com/photo-1556909114-d8cb3b2de43c?w=300",
                "prescriptionRequired": False,
                "warnings": ["Keep refrigerated", "Start with half dose if sensitive"],
                "usage": "Take with food for best results",
                "createdAt": datetime.now()
            },
            
            # Skin Care
            {
                "id": str(uuid.uuid4()),
                "name": "Hydrocortisone Cream 1%",
                "category": "Skin Care",
                "type": "Over-the-Counter",
                "description": "Relieves itching, redness and inflammation",
                "price": 13.50,
                "dosage": "Apply thin layer 2-4 times daily",
                "sideEffects": ["Skin thinning (prolonged use)", "Burning sensation"],
                "activeIngredients": ["Hydrocortisone 1%"],
                "manufacturer": "SkinCare Plus",
                "expiryDate": "2025-11-05",
                "inStock": 80,
                "imageUrl": "https://images.unsplash.com/photo-1556909114-d8cb3b2de43c?w=300",
                "prescriptionRequired": False,
                "warnings": ["For external use only", "Not on broken skin", "Limit use to 7 days"],
                "usage": "Clean area before application",
                "createdAt": datetime.now()
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Sunscreen SPF 50",
                "category": "Skin Care",
                "type": "Over-the-Counter",
                "description": "Broad spectrum UV protection",
                "price": 24.99,
                "dosage": "Apply generously 15 minutes before sun exposure",
                "sideEffects": ["Rare: skin irritation", "Eye irritation if contact"],
                "activeIngredients": ["Zinc oxide 15%, Octinoxate 7.5%"],
                "manufacturer": "SunGuard",
                "expiryDate": "2026-07-20",
                "inStock": 100,
                "imageUrl": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300",
                "prescriptionRequired": False,
                "warnings": ["Reapply every 2 hours", "Water resistant up to 80 minutes"],
                "usage": "Apply 15 minutes before sun exposure",
                "createdAt": datetime.now()
            },
            
            # Eye Care
            {
                "id": str(uuid.uuid4()),
                "name": "Artificial Tears",
                "category": "Eye Care",
                "type": "Over-the-Counter",
                "description": "Lubricating drops for dry eyes",
                "price": 11.99,
                "dosage": "1-2 drops in each eye as needed",
                "sideEffects": ["Temporary blurred vision", "Mild eye irritation"],
                "activeIngredients": ["Carboxymethylcellulose 0.5%"],
                "manufacturer": "EyeComfort",
                "expiryDate": "2025-08-15",
                "inStock": 90,
                "imageUrl": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300",
                "prescriptionRequired": False,
                "warnings": ["Single use vials", "Do not touch dropper to eye"],
                "usage": "Remove contact lenses before use",
                "createdAt": datetime.now()
            },
            
            # Child Health
            {
                "id": str(uuid.uuid4()),
                "name": "Children's Fever Reducer",
                "category": "Child Health",
                "type": "Over-the-Counter",
                "description": "Gentle fever and pain relief for children",
                "price": 16.75,
                "dosage": "Follow age/weight chart on package",
                "sideEffects": ["Rare: upset stomach", "Allergic reaction (rare)"],
                "activeIngredients": ["Acetaminophen 80mg/5ml"],
                "manufacturer": "KidsHealth",
                "expiryDate": "2026-03-10",
                "inStock": 75,
                "imageUrl": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300",
                "prescriptionRequired": False,
                "minAge": 2,
                "warnings": ["Not for children under 2 without doctor approval", "Do not exceed recommended dose"],
                "usage": "Give with food if stomach upset occurs",
                "createdAt": datetime.now()
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Multivitamin Gummies for Kids",
                "category": "Child Health",
                "type": "Over-the-Counter",
                "description": "Complete vitamins for growing children",
                "price": 19.50,
                "dosage": "2 gummies daily for children 4+",
                "sideEffects": ["None when used as directed"],
                "activeIngredients": ["Vitamins A, C, D, E, B-complex"],
                "manufacturer": "KidsVitamin Co",
                "expiryDate": "2026-05-25",
                "inStock": 85,
                "imageUrl": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300",
                "prescriptionRequired": False,
                "minAge": 4,
                "warnings": ["Keep out of reach of children", "Do not exceed 2 gummies daily"],
                "usage": "Take with or after meals",
                "createdAt": datetime.now()
            }
        ]
        
        for medicine in dummy_medicines:
            # The previous seed URLs were generic stock photos, not verified
            # images of the catalog products. Leave image fields unavailable.
            medicine["imageUrl"] = None
            medicine["imageSource"] = None
            medicine["imageAlt"] = None
            medicine["active"] = True
            medicine["isDemo"] = True
        await database.medicines.insert_many(dummy_medicines)
        logger.info("Dummy medicine data initialized")

    # Existing seeded items predate the explicit demo marker. Add only this
    # metadata to the exact known seed identities; never rewrite commercial
    # fields, IDs, prices, stock, expiry, or image metadata here.
    for name, manufacturer in SEED_MEDICINE_IDENTITIES:
        await database.medicines.update_many(
            {"name": name, "manufacturer": manufacturer, "isDemo": {"$ne": True}},
            {"$set": {"isDemo": True}},
        )

    for seed in DEMO_MEDICINES:
        identity = {"name": seed["name"], "manufacturer": seed["manufacturer"]}
        existing = await database.medicines.find_one({"$or": [{"id": seed["id"]}, identity]})
        if existing is None:
            await database.medicines.insert_one(demo_medicine_document(seed))

    # Update only image metadata for matching legacy seed records. Keep their
    # IDs, stock, pricing, and all other catalog fields untouched.
    for name, manufacturer in SEED_MEDICINE_IDENTITIES:
        await database.medicines.update_many(
            {
                "name": name,
                "manufacturer": manufacturer,
                "imageUrl": {"$regex": r"^https://images\.unsplash\.com/"},
            },
            {"$set": {"imageUrl": None, "imageSource": None, "imageAlt": None}},
        )

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Hospot API - Find & Book Hospital Beds in Real Time"}

@api_router.get("/hospitals", response_model=List[Hospital])
async def get_hospitals(search: Optional[str] = Query(None, max_length=120, description="Search hospitals by name or location"), db=Depends(get_db)):
    """Get all hospitals or search hospitals by name/location"""

    if search:
        # Treat the user input as literal text, not as a Mongo regular expression.
        safe_search = re.escape(search)
        query = {
            "$or": [
                {"name": {"$regex": safe_search, "$options": "i"}},
                {"location": {"$regex": safe_search, "$options": "i"}},
                {"address": {"$regex": safe_search, "$options": "i"}}
            ]
        }
    else:
        query = {}

    hospitals = await db.hospitals.find(query).to_list(500)
    hospitals = [hospital for hospital in hospitals if hospital.get("active") is not False]

    def normalize_hospital(doc: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize hospital document shape so frontend always receives ICU/General/Special."""
        available = doc.get("availableBeds") or {}
        doc["availableBeds"] = {
            "ICU": int(available.get("ICU", 0) or 0),
            "General": int(available.get("General", 0) or 0),
            "Special": int(available.get("Special", 0) or 0),
        }
        reserved = doc.get("reservedBeds") or {}
        doc["reservedBeds"] = {
            "ICU": int(reserved.get("ICU", 0) or 0),
            "General": int(reserved.get("General", 0) or 0),
            "Special": int(reserved.get("Special", 0) or 0),
        }
        # Ensure required scalar fields exist
        doc["rating"] = float(doc.get("rating", 4.5) or 4.5)
        doc["emergency"] = bool(doc.get("emergency", True))
        return doc

    # Sort by availability (hospitals with more beds first) and rating
    def sort_key(hospital: Dict[str, Any]):
        available = hospital.get("availableBeds") or {}
        total_beds = int(available.get("ICU", 0) or 0) + int(available.get("General", 0) or 0) + int(available.get("Special", 0) or 0)
        return (-total_beds, -float(hospital.get("rating", 4.5) or 4.5))

    hospitals = [normalize_hospital(h) for h in hospitals]
    hospitals.sort(key=sort_key)

    return [Hospital(**hospital) for hospital in hospitals]


@api_router.get("/hospitals/{hospital_id}", response_model=Hospital)
async def get_hospital(hospital_id: str, db=Depends(get_db)):
    """Get a specific hospital by ID"""
    hospital = await db.hospitals.find_one({"id": hospital_id})
    if not hospital or hospital.get("active") is False:
        raise HTTPException(status_code=404, detail="Hospital not found")

    available = hospital.get("availableBeds") or {}
    hospital["availableBeds"] = {
        "ICU": int(available.get("ICU", 0) or 0),
        "General": int(available.get("General", 0) or 0),
        "Special": int(available.get("Special", 0) or 0),
    }
    reserved = hospital.get("reservedBeds") or {}
    hospital["reservedBeds"] = {
        "ICU": int(reserved.get("ICU", 0) or 0),
        "General": int(reserved.get("General", 0) or 0),
        "Special": int(reserved.get("Special", 0) or 0),
    }
    hospital["rating"] = float(hospital.get("rating", 4.5) or 4.5)
    hospital["emergency"] = bool(hospital.get("emergency", True))

    return Hospital(**hospital)


@api_router.get("/admin/hospitals", response_model=List[Hospital])
async def list_all_hospitals(
    user=Depends(require_roles(Role.PLATFORM_ADMIN)), db=Depends(get_db)
):
    hospitals = await db.hospitals.find({}).to_list(500)
    return [Hospital(**hospital) for hospital in hospitals]


@api_router.get("/admin/hospitals/{hospital_id}", response_model=Hospital)
async def get_managed_hospital(
    hospital_id: str,
    user=Depends(require_roles(Role.HOSPITAL_ADMIN, Role.PLATFORM_ADMIN)),
    db=Depends(get_db),
):
    query = {"id": hospital_id}
    if user["role"] == Role.HOSPITAL_ADMIN.value:
        if user.get("hospitalId") != hospital_id:
            raise HTTPException(status_code=404, detail="Hospital not found")
    hospital = await db.hospitals.find_one(query)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return Hospital(**hospital)


@api_router.post("/admin/hospitals", response_model=Hospital, status_code=201)
async def create_hospital(
    payload: HospitalCreate,
    user=Depends(require_roles(Role.PLATFORM_ADMIN)),
    db=Depends(get_db),
):
    hospital = payload.model_dump()
    hospital.update({
        "id": str(uuid.uuid4()),
        "reservedBeds": BedAvailability().model_dump(),
        "active": True,
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    })
    await db.hospitals.insert_one(hospital)
    return Hospital(**hospital)


@api_router.patch("/admin/hospitals/{hospital_id}", response_model=Hospital)
async def update_hospital(
    hospital_id: str,
    payload: HospitalUpdate,
    user=Depends(require_roles(Role.HOSPITAL_ADMIN, Role.PLATFORM_ADMIN)),
    db=Depends(get_db),
):
    if user["role"] == Role.HOSPITAL_ADMIN.value and user.get("hospitalId") != hospital_id:
        raise HTTPException(status_code=404, detail="Hospital not found")
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    result = await db.hospitals.update_one(
        {"id": hospital_id}, {"$set": {**updates, "updatedAt": datetime.now(timezone.utc)}}
    )
    if result.matched_count != 1:
        raise HTTPException(status_code=404, detail="Hospital not found")
    hospital = await db.hospitals.find_one({"id": hospital_id})
    return Hospital(**hospital)


@api_router.patch("/admin/hospitals/{hospital_id}/deactivate")
async def deactivate_hospital(
    hospital_id: str,
    user=Depends(require_roles(Role.PLATFORM_ADMIN)),
    db=Depends(get_db),
):
    result = await db.hospitals.update_one(
        {"id": hospital_id, "active": {"$ne": False}},
        {"$set": {"active": False, "updatedAt": datetime.now(timezone.utc)}},
    )
    if result.matched_count != 1:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return {"id": hospital_id, "active": False}


@api_router.put("/admin/hospitals/{hospital_id}/beds")
async def update_hospital_beds(hospital_id: str, availability: BedAvailability,
                               user=Depends(require_roles(Role.HOSPITAL_ADMIN, Role.PLATFORM_ADMIN)),
                               db=Depends(get_db)):
    """Update bed availability only for the caller's assigned hospital or as platform admin."""
    if user.get("role") == Role.HOSPITAL_ADMIN.value and user.get("hospitalId") != hospital_id:
        raise HTTPException(status_code=404, detail="Hospital not found")
    result = await db.hospitals.update_one(
        {"id": hospital_id}, {"$set": {"availableBeds": availability.dict()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return {"message": "Bed availability updated"}


# Medicine API Routes
@api_router.get("/medicines", response_model=List[Medicine])
async def get_medicines(
    category: Optional[MedicineCategory] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, min_length=1, max_length=120, description="Search medicines by name"),
    prescription_required: Optional[bool] = Query(None, description="Filter by prescription requirement"),
    db=Depends(get_db),
):
    """List active catalog entries with optional search and filters."""
    query = {"active": {"$ne": False}}
    
    if category:
        query["category"] = category.value
        
    if prescription_required is not None:
        query["prescriptionRequired"] = prescription_required
        
    if search:
        safe_search = re.escape(search)
        query["$or"] = [
            {"name": {"$regex": safe_search, "$options": "i"}},
            {"description": {"$regex": safe_search, "$options": "i"}},
            {"activeIngredients": {"$elemMatch": {"$regex": safe_search, "$options": "i"}}}
        ]
    
    medicines = await db.medicines.find(query).to_list(500)
    return [
        medicine for medicine in (medicine_response(row) for row in medicines)
        if not medicine.expired
    ]


@api_router.get("/admin/medicines", response_model=List[Medicine])
async def list_managed_medicines(
    low_stock: Optional[bool] = Query(None, alias="lowStock"),
    user=Depends(require_roles(Role.PLATFORM_ADMIN)),
    db=Depends(get_db),
):
    medicines = await db.medicines.find({}).to_list(500)
    results = [medicine_response(medicine) for medicine in medicines]
    if low_stock is not None:
        results = [medicine for medicine in results if medicine.lowStock is low_stock]
    return results


@api_router.get("/admin/medicines/{medicine_id}", response_model=Medicine)
async def get_managed_medicine(
    medicine_id: str,
    user=Depends(require_roles(Role.PLATFORM_ADMIN)),
    db=Depends(get_db),
):
    medicine = await db.medicines.find_one({"id": medicine_id})
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    return medicine_response(medicine)


@api_router.post("/admin/medicines", response_model=Medicine, status_code=201)
async def create_medicine(
    payload: MedicineCreate,
    user=Depends(require_roles(Role.PLATFORM_ADMIN)),
    db=Depends(get_db),
):
    medicine = payload.model_dump(mode="json")
    medicine.update({
        "id": str(uuid.uuid4()),
        "active": True,
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    })
    await db.medicines.insert_one(medicine)
    return medicine_response(medicine)


@api_router.patch("/admin/medicines/{medicine_id}", response_model=Medicine)
async def update_medicine(
    medicine_id: str,
    payload: MedicineUpdate,
    user=Depends(require_roles(Role.PLATFORM_ADMIN)),
    db=Depends(get_db),
):
    updates = payload.model_dump(mode="json", exclude_unset=True)
    current = await db.medicines.find_one({"id": medicine_id})
    if not current:
        raise HTTPException(status_code=404, detail="Medicine not found")
    minimum_age = updates.get("minAge", current.get("minAge"))
    maximum_age = updates.get("maxAge", current.get("maxAge"))
    if minimum_age is not None and maximum_age is not None and minimum_age > maximum_age:
        raise HTTPException(status_code=422, detail="minAge cannot exceed maxAge")
    result = await db.medicines.update_one(
        {"id": medicine_id},
        {"$set": {**updates, "updatedAt": datetime.now(timezone.utc)}},
    )
    if result.matched_count != 1:
        raise HTTPException(status_code=404, detail="Medicine not found")
    medicine = await db.medicines.find_one({"id": medicine_id})
    return medicine_response(medicine)


@api_router.patch("/admin/medicines/{medicine_id}/stock", response_model=Medicine)
async def adjust_medicine_stock(
    medicine_id: str,
    payload: MedicineStockAdjustment,
    user=Depends(require_roles(Role.PLATFORM_ADMIN)),
    db=Depends(get_db),
):
    query = {"id": medicine_id}
    if payload.adjustment < 0:
        query["inStock"] = {"$gte": -payload.adjustment}
    result = await db.medicines.update_one(
        query,
        {"$inc": {"inStock": payload.adjustment}, "$set": {"updatedAt": datetime.now(timezone.utc)}},
    )
    if result.matched_count != 1:
        if not await db.medicines.find_one({"id": medicine_id}):
            raise HTTPException(status_code=404, detail="Medicine not found")
        raise HTTPException(status_code=409, detail="Insufficient stock for this adjustment")
    medicine = await db.medicines.find_one({"id": medicine_id})
    return medicine_response(medicine)


@api_router.patch("/admin/medicines/{medicine_id}/deactivate")
async def deactivate_medicine(
    medicine_id: str,
    user=Depends(require_roles(Role.PLATFORM_ADMIN)),
    db=Depends(get_db),
):
    medicine = await db.medicines.find_one({"id": medicine_id})
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    await db.medicines.update_one(
        {"id": medicine_id},
        {"$set": {"active": False, "updatedAt": datetime.now(timezone.utc)}},
    )
    return {"id": medicine_id, "active": False}

@api_router.get("/medicines/categories")
async def get_medicine_categories():
    """Get all medicine categories"""
    return [{"value": cat.value, "label": cat.value} for cat in MedicineCategory]

@api_router.get("/medicines/{medicine_id}", response_model=Medicine)
async def get_medicine(medicine_id: str, db=Depends(get_db)):
    """Get a specific medicine by ID"""
    medicine = await db.medicines.find_one({"id": medicine_id, "active": {"$ne": False}})
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    result = medicine_response(medicine)
    if result.expired:
        raise HTTPException(status_code=404, detail="Medicine not found")
    return result

# Prescription API Routes
@api_router.post("/prescriptions", response_model=Prescription)
async def create_prescription(prescription: PrescriptionCreate, user=Depends(current_user), db=Depends(get_db)):
    """Create a new prescription"""
    if user.get("role") != Role.PATIENT.value:
        raise HTTPException(status_code=403, detail="Patient account required")
    prescription_dict = prescription.dict()
    prescription_dict["userId"] = user["id"]
    prescription_dict["id"] = str(uuid.uuid4())
    prescription_dict["createdAt"] = datetime.now()
    prescription_dict["isUsed"] = False
    
    await db.prescriptions.insert_one(prescription_dict)
    return Prescription(**prescription_dict)

@api_router.get("/prescriptions", response_model=List[Prescription])
async def get_user_prescriptions(user=Depends(current_user), db=Depends(get_db)):
    """Get all prescriptions for a user"""
    if user.get("role") != Role.PATIENT.value:
        raise HTTPException(status_code=403, detail="Patient account required")
    prescriptions = await db.prescriptions.find({"userId": user["id"]}).to_list(100)
    return [Prescription(**prescription) for prescription in prescriptions]

@api_router.get("/prescriptions/{prescription_id}", response_model=Prescription)
async def get_prescription(prescription_id: str, user=Depends(current_user), db=Depends(get_db)):
    """Get a specific prescription by ID"""
    if user.get("role") != Role.PATIENT.value:
        raise HTTPException(status_code=403, detail="Patient account required")
    prescription = await db.prescriptions.find_one({"id": prescription_id, "userId": user["id"]})
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")
    return Prescription(**prescription)

@api_router.put("/prescriptions/{prescription_id}/use")
async def mark_prescription_used(prescription_id: str, user=Depends(current_user), db=Depends(get_db)):
    """Mark a prescription as used"""
    if user.get("role") != Role.PATIENT.value:
        raise HTTPException(status_code=403, detail="Patient account required")
    result = await db.prescriptions.update_one(
        {"id": prescription_id, "userId": user["id"]},
        {"$set": {"isUsed": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Prescription not found")
    return {"message": "Prescription marked as used"}

# Shopping Cart API Routes
@api_router.get("/cart", response_model=Cart)
async def get_cart(user=Depends(current_user), db=Depends(get_db)):
    """Get user's shopping cart"""
    if user.get("role") != Role.PATIENT.value:
        raise HTTPException(status_code=403, detail="Patient account required")
    user_id = user["id"]
    cart = await db.carts.find_one({"userId": user_id})
    if not cart:
        # Create empty cart if doesn't exist
        cart_dict = {
            "id": str(uuid.uuid4()),
            "userId": user_id,
            "items": [],
            "totalAmount": 0.0,
            "updatedAt": datetime.now(timezone.utc)
        }
        await db.carts.insert_one(cart_dict)
        return Cart(**cart_dict)
    return Cart(**cart)

@api_router.post("/cart/add")
async def add_to_cart(item: CartAddRequest, user=Depends(current_user), db=Depends(get_db)):
    """Add item to cart"""
    if user.get("role") != Role.PATIENT.value:
        raise HTTPException(status_code=403, detail="Patient account required")
    user_id = user["id"]
    medicine = await db.medicines.find_one({"id": item.medicineId, "active": {"$ne": False}})
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    if medicine_response(medicine).expired:
        raise HTTPException(status_code=409, detail="Expired medicine is unavailable")
    cart = await db.carts.find_one({"userId": user_id})
    items = cart.get("items", []) if cart else []
    existing_quantity = sum(
        entry.get("quantity", 0) for entry in items if entry.get("medicineId") == item.medicineId
    )
    if existing_quantity + item.quantity > int(medicine.get("inStock", 0) or 0):
        raise HTTPException(status_code=409, detail="Requested quantity is not currently available")
    catalog_item = CartItem(
        medicineId=item.medicineId, medicineName=medicine["name"],
        price=medicine["price"], quantity=item.quantity, prescriptionId=item.prescriptionId,
    )
    
    if not cart:
        # Create new cart
        cart_dict = {
            "id": str(uuid.uuid4()),
            "userId": user_id,
            "items": [catalog_item.model_dump()],
            "totalAmount": catalog_item.price * catalog_item.quantity,
            "updatedAt": datetime.now(timezone.utc)
        }
        await db.carts.insert_one(cart_dict)
    else:
        # Update existing cart
        existing_item = None
        
        for i, existing in enumerate(items):
            if existing["medicineId"] == item.medicineId:
                existing_item = i
                break
        
        if existing_item is not None:
            # Keep any existing prescription reference while refreshing the
            # catalog-owned name and price.
            items[existing_item]["medicineName"] = catalog_item.medicineName
            items[existing_item]["price"] = catalog_item.price
            items[existing_item]["quantity"] = existing_quantity + item.quantity
        else:
            items.append(catalog_item.model_dump())
        
        # Calculate total
        total_amount = sum(i["price"] * i["quantity"] for i in items)
        
        await db.carts.update_one(
            {"userId": user_id},
            {
                "$set": {
                    "items": items,
                    "totalAmount": total_amount,
                    "updatedAt": datetime.now(timezone.utc)
                }
            }
        )
    
    return {"message": "Item added to cart"}

@api_router.put("/cart/update")
async def update_cart_item(medicine_id: str, quantity: int = Query(..., ge=0, le=1000), user=Depends(current_user), db=Depends(get_db)):
    """Update cart item quantity"""
    if user.get("role") != Role.PATIENT.value:
        raise HTTPException(status_code=403, detail="Patient account required")
    user_id = user["id"]
    cart = await db.carts.find_one({"userId": user_id})
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    
    items = cart.get("items", [])
    found = False
    for item in items:
        if item["medicineId"] == medicine_id:
            found = True
            if quantity <= 0:
                items.remove(item)
            else:
                medicine = await db.medicines.find_one({"id": medicine_id, "active": {"$ne": False}})
                if not medicine:
                    raise HTTPException(status_code=404, detail="Medicine not found")
                if medicine_response(medicine).expired:
                    raise HTTPException(status_code=409, detail="Expired medicine is unavailable")
                if quantity > int(medicine.get("inStock", 0) or 0):
                    raise HTTPException(status_code=409, detail="Requested quantity is not currently available")
                item["quantity"] = quantity
                item["medicineName"] = medicine["name"]
                item["price"] = medicine["price"]
            break
    if not found:
        raise HTTPException(status_code=404, detail="Cart item not found")
    
    # Calculate total
    total_amount = sum(i["price"] * i["quantity"] for i in items)
    
    await db.carts.update_one(
        {"userId": user_id},
        {
            "$set": {
                "items": items,
                "totalAmount": total_amount,
                "updatedAt": datetime.now(timezone.utc)
            }
        }
    )
    
    return {"message": "Cart updated"}

@api_router.delete("/cart/remove/{medicine_id}")
async def remove_from_cart(medicine_id: str, user=Depends(current_user), db=Depends(get_db)):
    """Remove item from cart"""
    if user.get("role") != Role.PATIENT.value:
        raise HTTPException(status_code=403, detail="Patient account required")
    user_id = user["id"]
    cart = await db.carts.find_one({"userId": user_id})
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    
    items = cart.get("items", [])
    items = [item for item in items if item["medicineId"] != medicine_id]
    
    # Calculate total
    total_amount = sum(i["price"] * i["quantity"] for i in items)
    
    await db.carts.update_one(
        {"userId": user_id},
        {
            "$set": {
                "items": items,
                "totalAmount": total_amount,
                "updatedAt": datetime.now(timezone.utc)
            }
        }
    )
    
    return {"message": "Item removed from cart"}

@api_router.delete("/cart/clear")
async def clear_cart(user=Depends(current_user), db=Depends(get_db)):
    """Clear user's cart"""
    if user.get("role") != Role.PATIENT.value:
        raise HTTPException(status_code=403, detail="Patient account required")
    user_id = user["id"]
    await db.carts.update_one(
        {"userId": user_id},
        {
            "$set": {
                "items": [],
                "totalAmount": 0.0,
                "updatedAt": datetime.now()
            }
        }
    )
    return {"message": "Cart cleared"}

# Order API Routes
async def _run_order_transaction(db, operation):
    client = getattr(db, "client", None)
    if client is None:
        raise HTTPException(status_code=503, detail="Order service requires transaction-capable MongoDB")
    try:
        session = await client.start_session()
        async with session:
            return await session.with_transaction(operation)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Order transaction failed; no partial operation was accepted")
        raise HTTPException(status_code=503, detail="Order service is temporarily unavailable")


@api_router.post("/orders", response_model=Order, status_code=201)
async def create_order(order: OrderCreate, user=Depends(require_roles(Role.PATIENT)), db=Depends(get_db)):
    """Check out the authenticated patient's current cart."""
    if user.get("role") != Role.PATIENT.value:
        raise HTTPException(status_code=403, detail="Patient account required")

    async def operation(session):
        user_id = user["id"]
        pickup_location = None
        pickup_reference = None
        if order.fulfillmentMethod == FulfillmentMethod.PICKUP:
            hospital = await db.hospitals.find_one(
                {"id": order.pickupLocationId, "active": {"$ne": False}}, session=session
            )
            if not hospital:
                raise HTTPException(status_code=404, detail="Pickup location not found or inactive")
            required_location_fields = ("name", "location", "address", "phone")
            if any(not str(hospital.get(field, "")).strip() for field in required_location_fields):
                raise HTTPException(status_code=409, detail="Pickup location details are incomplete")
            pickup_location = {
                "id": hospital["id"], "name": hospital["name"],
                "location": hospital["location"], "address": hospital["address"],
                "phone": hospital["phone"],
            }
            pickup_reference = f"HSP-{uuid.uuid4().hex.upper()}"

        cart = await db.carts.find_one({"userId": user_id}, session=session)
        if not cart or not cart.get("items"):
            raise HTTPException(status_code=409, detail="Cart is empty")

        # Aggregate duplicate legacy lines and snapshot all sale details from
        # the current catalog, never from client-supplied order items/prices.
        quantities = {}
        prescription_ids = []
        for raw_item in cart["items"]:
            try:
                cart_item = CartItem(**raw_item)
            except Exception as exc:
                raise HTTPException(status_code=409, detail="Cart contains an invalid item") from exc
            line = quantities.setdefault(
                cart_item.medicineId, {"quantity": 0, "prescriptionId": None}
            )
            line["quantity"] += cart_item.quantity
            if line["quantity"] > 1000:
                raise HTTPException(status_code=409, detail="Cart quantity exceeds the allowed limit")
            if cart_item.prescriptionId and line["prescriptionId"] is None:
                line["prescriptionId"] = cart_item.prescriptionId
            if cart_item.prescriptionId and cart_item.prescriptionId not in prescription_ids:
                prescription_ids.append(cart_item.prescriptionId)

        order_items = []
        today = date.today().isoformat()
        for medicine_id, line in quantities.items():
            quantity = line["quantity"]
            medicine = await db.medicines.find_one(
                {"id": medicine_id, "active": {"$ne": False}}, session=session
            )
            if not medicine:
                raise HTTPException(status_code=409, detail="A cart medicine is unavailable")
            if medicine_response(medicine).expired:
                raise HTTPException(status_code=409, detail="An expired cart medicine is unavailable")
            if int(medicine.get("inStock", 0) or 0) < quantity:
                raise HTTPException(status_code=409, detail="A cart medicine has insufficient stock")

            stock_result = await db.medicines.update_one(
                {
                    "id": medicine_id,
                    "active": {"$ne": False},
                    "expiryDate": {"$gte": today},
                    "inStock": {"$gte": quantity},
                },
                {"$inc": {"inStock": -quantity}},
                session=session,
            )
            if stock_result.matched_count != 1:
                raise HTTPException(status_code=409, detail="A cart medicine is no longer available")

            order_items.append(OrderItem(
                medicineId=medicine_id,
                medicineName=medicine["name"],
                price=medicine["price"],
                quantity=quantity,
                prescriptionId=line["prescriptionId"],
            ))

        now = datetime.now(timezone.utc)
        item_subtotal = round(sum(item.price * item.quantity for item in order_items), 2)
        delivery_fee = 0.0
        order_dict = {
            "id": str(uuid.uuid4()),
            "userId": user_id,
            "items": [item.model_dump() for item in order_items],
            "itemSubtotal": item_subtotal,
            "deliveryFee": delivery_fee,
            "totalAmount": round(item_subtotal + delivery_fee, 2),
            "currency": "INR",
            "fulfillmentMethod": order.fulfillmentMethod.value,
            "pickupLocation": pickup_location,
            "pickupReference": pickup_reference,
            "inventoryScope": "GLOBAL_UNALLOCATED",
            "deliveryAddress": order.deliveryAddress
            if order.fulfillmentMethod == FulfillmentMethod.HOME_DELIVERY else None,
            "contactNumber": order.contactNumber
            if order.fulfillmentMethod == FulfillmentMethod.HOME_DELIVERY else None,
            "paymentMethod": order.paymentMethod.value,
            "status": OrderStatus.PENDING.value,
            "orderDate": now,
            "estimatedDelivery": now + timedelta(days=2)
            if order.fulfillmentMethod == FulfillmentMethod.HOME_DELIVERY else None,
            "notes": order.notes,
            "prescriptionIds": prescription_ids,
            "updatedAt": now,
            "deliveryProvider": None,
            "shipmentId": None,
            "trackingNumber": None,
            "trackingUrl": None,
            "shipmentStatus": None,
            "dispatchedAt": None,
            "deliveredAt": None,
        }
        await db.orders.insert_one(order_dict, session=session)

        cart_result = await db.carts.update_one(
            {"userId": user_id, "id": cart["id"]},
            {"$set": {"items": [], "totalAmount": 0.0, "updatedAt": now}},
            session=session,
        )
        if cart_result.matched_count != 1:
            raise HTTPException(status_code=409, detail="Cart changed during checkout; please retry")
        return Order(**order_dict)

    return await _run_order_transaction(db, operation)

@api_router.get("/orders", response_model=List[Order])
async def get_user_orders(user=Depends(current_user), db=Depends(get_db)):
    """Get all orders for a user"""
    if user.get("role") != Role.PATIENT.value:
        raise HTTPException(status_code=403, detail="Patient account required")
    orders = await db.orders.find({"userId": user["id"]}).sort("orderDate", -1).to_list(100)
    return [Order(**order) for order in orders]

@api_router.get("/orders/{order_id}", response_model=Order)
async def get_order(order_id: str, user=Depends(current_user), db=Depends(get_db)):
    """Get a specific order by ID"""
    if user.get("role") != Role.PATIENT.value:
        raise HTTPException(status_code=403, detail="Patient account required")
    order = await db.orders.find_one({"id": order_id, "userId": user["id"]})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return Order(**order)

@api_router.get("/admin/orders", response_model=List[Order])
async def get_all_orders(user=Depends(require_roles(Role.PLATFORM_ADMIN)), db=Depends(get_db)):
    orders = await db.orders.find({}).sort("orderDate", -1).to_list(500)
    return [Order(**order) for order in orders]

@api_router.get("/admin/orders/{order_id}", response_model=Order)
async def get_any_order(order_id: str, user=Depends(require_roles(Role.PLATFORM_ADMIN)), db=Depends(get_db)):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return Order(**order)


LEGACY_ORDER_TRANSITIONS = {
    OrderStatus.PENDING: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
    OrderStatus.CONFIRMED: {OrderStatus.PREPARING, OrderStatus.CANCELLED},
    OrderStatus.PREPARING: {OrderStatus.OUT_FOR_DELIVERY},
    OrderStatus.OUT_FOR_DELIVERY: {OrderStatus.DELIVERED},
    OrderStatus.DELIVERED: set(),
    OrderStatus.CANCELLED: set(),
}

FULFILLMENT_ORDER_TRANSITIONS = {
    FulfillmentMethod.PICKUP: {
        OrderStatus.PENDING: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
        OrderStatus.CONFIRMED: {OrderStatus.PREPARING, OrderStatus.CANCELLED},
        OrderStatus.PREPARING: {OrderStatus.READY_FOR_PICKUP},
        OrderStatus.READY_FOR_PICKUP: {OrderStatus.PICKED_UP},
        OrderStatus.PICKED_UP: set(),
        OrderStatus.CANCELLED: set(),
    },
    FulfillmentMethod.HOME_DELIVERY: {
        OrderStatus.PENDING: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
        OrderStatus.CONFIRMED: {OrderStatus.PREPARING, OrderStatus.CANCELLED},
        OrderStatus.PREPARING: {OrderStatus.READY_FOR_DISPATCH},
        OrderStatus.READY_FOR_DISPATCH: {OrderStatus.DISPATCHED},
        OrderStatus.DISPATCHED: {OrderStatus.OUT_FOR_DELIVERY},
        OrderStatus.OUT_FOR_DELIVERY: {OrderStatus.DELIVERED},
        OrderStatus.DELIVERED: set(),
        OrderStatus.CANCELLED: set(),
    },
}


async def _transition_order(db, order_id, target_status, *, user_id=None, patient_cancel=False):
    scope = {"id": order_id}
    if user_id is not None:
        scope["userId"] = user_id

    async def operation(session):
        order = await db.orders.find_one(scope, session=session)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        try:
            current_status = OrderStatus(order["status"])
        except (KeyError, ValueError):
            raise HTTPException(status_code=409, detail="Order has an invalid status")
        if patient_cancel and current_status != OrderStatus.PENDING:
            raise HTTPException(status_code=409, detail="Only pending orders can be cancelled by the patient")
        fulfillment_method = order.get("fulfillmentMethod")
        if fulfillment_method is None:
            transitions = LEGACY_ORDER_TRANSITIONS
        else:
            try:
                method = FulfillmentMethod(fulfillment_method)
            except ValueError:
                raise HTTPException(status_code=409, detail="Order has an invalid fulfillment method")
            transitions = FULFILLMENT_ORDER_TRANSITIONS[method]
        if target_status not in transitions.get(current_status, set()):
            raise HTTPException(status_code=409, detail="Order status transition is not allowed")

        now = datetime.now(timezone.utc)
        updated = await db.orders.update_one(
            {**scope, "status": current_status.value},
            {"$set": {"status": target_status.value, "updatedAt": now}},
            session=session,
        )
        if updated.matched_count != 1:
            raise HTTPException(status_code=409, detail="Order status changed; reload and try again")

        if target_status == OrderStatus.CANCELLED:
            for item in order.get("items", []):
                restored = await db.medicines.update_one(
                    {"id": item["medicineId"]},
                    {"$inc": {"inStock": int(item["quantity"])}},
                    session=session,
                )
                if restored.matched_count != 1:
                    raise HTTPException(status_code=409, detail="Order inventory could not be restored")
        return await db.orders.find_one(scope, session=session)

    return await _run_order_transaction(db, operation)


@api_router.post("/orders/{order_id}/cancel", response_model=Order)
async def cancel_order(order_id: str, user=Depends(require_roles(Role.PATIENT)), db=Depends(get_db)):
    return await _transition_order(
        db, order_id, OrderStatus.CANCELLED, user_id=user["id"], patient_cancel=True
    )

@api_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: OrderStatus, user=Depends(require_roles(Role.PLATFORM_ADMIN)), db=Depends(get_db)):
    """Apply one allowed platform-admin order status transition."""
    await _transition_order(db, order_id, status)
    return {"message": f"Order status updated to {status.value}"}

def create_app(database=None, *, initialize_reference_data=True, ensure_indexes=True,
               session_cookie_secure=None, allowed_origins=None, profile_picture_storage=None,
               email_delivery=None, email_public_frontend_url=None):
    """Build an app with an optional injected database.

    Mongo is not constructed until lifespan startup and only when no database
    was injected. Tests should always inject a test database.
    """
    @asynccontextmanager
    async def lifespan(application):
        owned_client = None
        if application.state.db is None:
            mongo_url = os.environ.get("MONGO_URL")
            db_name = os.environ.get("DB_NAME")
            if not mongo_url or not db_name:
                raise RuntimeError("MONGO_URL and DB_NAME must be configured before starting the backend.")
            owned_client = AsyncIOMotorClient(mongo_url)
            application.state.db = owned_client[db_name]
            application.state.mongo_client = owned_client
        try:
            database_for_app = application.state.db
            if initialize_reference_data:
                await init_dummy_data(database_for_app)
                await init_medicine_data(database_for_app)
            if ensure_indexes:
                await database_for_app.users.create_index("emailNormalized", unique=True)
                await database_for_app.sessions.create_index("tokenHash", unique=True)
                await database_for_app.sessions.create_index("expiresAt", expireAfterSeconds=0)
                await database_for_app.invitations.create_index("tokenHash", unique=True)
                await database_for_app.invitations.create_index("expiresAt", expireAfterSeconds=0)
                await database_for_app.bookings.create_index("id", unique=True)
                await database_for_app.bookings.create_index([("patientId", 1), ("createdAt", -1)])
                await database_for_app.bookings.create_index([("hospitalId", 1), ("createdAt", -1)])
            yield
        finally:
            if owned_client is not None:
                owned_client.close()
                application.state.mongo_client = None

    application = FastAPI(lifespan=lifespan)
    application.state.db = database
    application.state.mongo_client = None
    application.state.profile_picture_storage = (
        profile_picture_storage if profile_picture_storage is not None else LocalProfilePictureStorage()
    )
    application.state.email_delivery = (
        email_delivery if email_delivery is not None else email_delivery_from_environment()
    )
    application.state.email_public_frontend_url = (
        email_public_frontend_url if email_public_frontend_url is not None
        else os.environ.get("HOSPOT_PUBLIC_FRONTEND_URL")
    )
    if session_cookie_secure is None:
        session_cookie_secure = os.environ.get("SESSION_COOKIE_SECURE", "true").strip().lower() not in ("0", "false", "no")
    origins = allowed_origins if allowed_origins is not None else configured_origins_from_environment()
    application.state.session_cookie_secure = session_cookie_secure
    application.state.allowed_origins = set(origins)
    application.add_middleware(BaseHTTPMiddleware, dispatch=protect_api_mutations)
    application.include_router(api_router)
    application.include_router(auth_router)
    application.include_router(bookings_router)
    application.include_router(management_router)
    application.include_router(profile_summary_router)
    application.include_router(profile_picture_router)
    application.include_router(email_change_router)
    application.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )
    return application


# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Importing the module creates no Mongo client and performs no database I/O.
app = create_app()
