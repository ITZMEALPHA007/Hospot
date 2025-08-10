from fastapi import FastAPI, APIRouter, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime

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