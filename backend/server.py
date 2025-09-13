from fastapi import FastAPI, APIRouter, Query, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Hospital Models
class BedAvailability(BaseModel):
    ICU: int = 0
    General: int = 0
    Special: int = 0

class Hospital(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    location: str
    phone: str
    address: str
    bedTypes: List[str] = ["ICU", "General", "Special"]
    availableBeds: BedAvailability
    rating: float = 4.5
    distance: str = "2.5 km"
    emergency: bool = True

class HospitalCreate(BaseModel):
    name: str
    location: str
    phone: str
    address: str
    availableBeds: BedAvailability
    rating: Optional[float] = 4.5
    distance: Optional[str] = "2.5 km"
    emergency: Optional[bool] = True

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

class MedicineType(str, Enum):
    OTC = "Over-the-Counter"
    PRESCRIPTION = "Prescription Required"

class Medicine(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: MedicineCategory
    type: MedicineType
    description: str
    price: float
    dosage: str
    sideEffects: List[str] = []
    activeIngredients: List[str] = []
    manufacturer: str
    expiryDate: str
    inStock: int
    imageUrl: Optional[str] = None
    prescriptionRequired: bool
    minAge: Optional[int] = None
    maxAge: Optional[int] = None
    warnings: List[str] = []
    usage: str
    createdAt: datetime = Field(default_factory=datetime.now)

class MedicineCreate(BaseModel):
    name: str
    category: MedicineCategory
    type: MedicineType
    description: str
    price: float
    dosage: str
    sideEffects: List[str] = []
    activeIngredients: List[str] = []
    manufacturer: str
    expiryDate: str
    inStock: int
    imageUrl: Optional[str] = None
    prescriptionRequired: bool
    minAge: Optional[int] = None
    maxAge: Optional[int] = None
    warnings: List[str] = []
    usage: str

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
    userId: str
    doctorName: str
    hospitalName: str
    prescriptionDate: datetime
    medicines: List[Dict[str, Any]]
    notes: Optional[str] = None
    imageUrl: Optional[str] = None

# Shopping Cart Models
class CartItem(BaseModel):
    medicineId: str
    medicineName: str
    price: float
    quantity: int
    prescriptionId: Optional[str] = None

class Cart(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    items: List[CartItem] = []
    totalAmount: float = 0.0
    updatedAt: datetime = Field(default_factory=datetime.now)

# Order Models
class OrderStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PREPARING = "preparing"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"

class PaymentMethod(str, Enum):
    CASH_ON_DELIVERY = "cash_on_delivery"
    CARD = "card"
    UPI = "upi"

class OrderItem(BaseModel):
    medicineId: str
    medicineName: str
    price: float
    quantity: int
    prescriptionId: Optional[str] = None

class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    items: List[OrderItem]
    totalAmount: float
    deliveryAddress: str
    contactNumber: str
    paymentMethod: PaymentMethod
    status: OrderStatus = OrderStatus.PENDING
    orderDate: datetime = Field(default_factory=datetime.now)
    estimatedDelivery: Optional[datetime] = None
    notes: Optional[str] = None
    prescriptionIds: List[str] = []

class OrderCreate(BaseModel):
    userId: str
    items: List[OrderItem]
    totalAmount: float
    deliveryAddress: str
    contactNumber: str
    paymentMethod: PaymentMethod
    notes: Optional[str] = None
    prescriptionIds: List[str] = []

# Initialize dummy hospital data
async def init_dummy_data():
    """Initialize the database with dummy hospital data"""
    existing_count = await db.hospitals.count_documents({})
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
        
        await db.hospitals.insert_many(dummy_hospitals)
        logger.info("Dummy hospital data initialized")

# Initialize dummy medicine data
async def init_medicine_data():
    """Initialize the database with dummy medicine data"""
    existing_count = await db.medicines.count_documents({})
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
            
            # Mental Health
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
            }
        ]
        
        await db.medicines.insert_many(dummy_medicines)
        logger.info("Dummy medicine data initialized")

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Hospot API - Find & Book Hospital Beds in Real Time"}

@api_router.get("/hospitals", response_model=List[Hospital])
async def get_hospitals(search: Optional[str] = Query(None, description="Search hospitals by name or location")):
    """Get all hospitals or search hospitals by name/location"""
    
    if search:
        # Case-insensitive search in name and location fields
        query = {
            "$or": [
                {"name": {"$regex": search, "$options": "i"}},
                {"location": {"$regex": search, "$options": "i"}},
                {"address": {"$regex": search, "$options": "i"}}
            ]
        }
    else:
        query = {}
    
    hospitals = await db.hospitals.find(query).to_list(100)
    
    # Sort by availability (hospitals with more beds first) and rating
    def sort_key(hospital):
        total_beds = hospital['availableBeds']['ICU'] + hospital['availableBeds']['General'] + hospital['availableBeds']['Special']
        return (-total_beds, -hospital['rating'])
    
    hospitals.sort(key=sort_key)
    
    return [Hospital(**hospital) for hospital in hospitals]

@api_router.get("/hospitals/{hospital_id}", response_model=Hospital)
async def get_hospital(hospital_id: str):
    """Get a specific hospital by ID"""
    hospital = await db.hospitals.find_one({"id": hospital_id})
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return Hospital(**hospital)

# Initialize data on startup
@app.on_event("startup")
async def startup_event():
    await init_dummy_data()

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()