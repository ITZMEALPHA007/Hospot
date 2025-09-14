import requests
import sys
from datetime import datetime
import json
import uuid

class HospotAPITester:
    def __init__(self, base_url="https://sample-meds.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_user_id = str(uuid.uuid4())
        self.test_medicine_id = None
        self.test_prescription_id = None
        self.test_order_id = None

    def run_test(self, name, method, endpoint, expected_status, params=None, data=None, expected_count=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            headers = {'Content-Type': 'application/json'}
            
            if method == 'GET':
                response = requests.get(url, params=params, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, timeout=10)
            
            print(f"   Status Code: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                
                # Try to parse JSON response
                try:
                    response_data = response.json()
                    if isinstance(response_data, list) and expected_count is not None:
                        print(f"   Response contains {len(response_data)} items (expected: {expected_count})")
                        if len(response_data) != expected_count:
                            print(f"⚠️  Warning: Expected {expected_count} items, got {len(response_data)}")
                    elif isinstance(response_data, dict):
                        print(f"   Response keys: {list(response_data.keys())}")
                    return success, response_data
                except json.JSONDecodeError:
                    print(f"   Response is not JSON: {response.text[:100]}...")
                    return success, response.text
                    
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")
                return False, {}

        except requests.exceptions.RequestException as e:
            print(f"❌ Failed - Network Error: {str(e)}")
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    # Medicine API Tests
    def test_get_all_medicines(self):
        """Test getting all medicines"""
        success, response = self.run_test(
            "Get All Medicines",
            "GET",
            "medicines",
            200,
            expected_count=23
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} medicines")
            if len(response) > 0:
                medicine = response[0]
                self.test_medicine_id = medicine.get('id')  # Store for later tests
                required_fields = ['id', 'name', 'category', 'type', 'description', 'price', 'dosage', 'prescriptionRequired']
                missing_fields = [field for field in required_fields if field not in medicine]
                if missing_fields:
                    print(f"⚠️  Missing fields in medicine data: {missing_fields}")
                else:
                    print("✅ All required fields present in medicine data")
                    print(f"   Sample medicine: {medicine['name']} - Price: ${medicine['price']}, Category: {medicine['category']}")
        
        return success, response

    def test_get_medicine_categories(self):
        """Test getting medicine categories"""
        success, response = self.run_test(
            "Get Medicine Categories",
            "GET",
            "medicines/categories",
            200,
            expected_count=15
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} categories")
            if len(response) > 0:
                category = response[0]
                if 'value' in category and 'label' in category:
                    print("✅ Categories have correct structure")
                    print(f"   Sample category: {category['label']}")
                    
                    # Check for specific categories mentioned in the request
                    category_names = [cat['label'] for cat in response]
                    required_categories = ["Pain Relief", "Vitamins", "Allergy & Cold", "Skin Care", "Child Health"]
                    missing_categories = [cat for cat in required_categories if cat not in category_names]
                    
                    if missing_categories:
                        print(f"⚠️  Missing required categories: {missing_categories}")
                    else:
                        print("✅ All required categories found")
                        
                    # Specifically check for the new "Allergy & Cold" category
                    if "Allergy & Cold" in category_names:
                        print("✅ New 'Allergy & Cold' category found")
                    else:
                        print("❌ New 'Allergy & Cold' category not found")
                else:
                    print("⚠️  Categories missing value/label structure")
        
        return success

    def test_search_medicines(self):
        """Test medicine search functionality"""
        # Test search by name - Paracetamol
        success1, response1 = self.run_test(
            "Search Medicines by Name (Paracetamol)",
            "GET",
            "medicines",
            200,
            params={"search": "Paracetamol"}
        )
        
        if success1 and isinstance(response1, list):
            paracetamol_medicines = [m for m in response1 if 'Paracetamol' in m.get('name', '')]
            print(f"   Found {len(paracetamol_medicines)} medicines with 'Paracetamol' in name")
        
        # Test search by name - Vitamin
        success2, response2 = self.run_test(
            "Search Medicines by Name (Vitamin)",
            "GET",
            "medicines",
            200,
            params={"search": "Vitamin"}
        )
        
        if success2 and isinstance(response2, list):
            vitamin_medicines = [m for m in response2 if 'Vitamin' in m.get('name', '')]
            print(f"   Found {len(vitamin_medicines)} medicines with 'Vitamin' in name")
        
        # Test search by name - Cough
        success3, response3 = self.run_test(
            "Search Medicines by Name (Cough)",
            "GET",
            "medicines",
            200,
            params={"search": "Cough"}
        )
        
        if success3 and isinstance(response3, list):
            cough_medicines = [m for m in response3 if 'Cough' in m.get('name', '')]
            print(f"   Found {len(cough_medicines)} medicines with 'Cough' in name")
        
        return success1 and success2 and success3

    def test_category_filtering(self):
        """Test filtering medicines by specific categories"""
        categories_to_test = ["Pain Relief", "Vitamins", "Allergy & Cold", "Skin Care", "Child Health"]
        all_success = True
        
        for category in categories_to_test:
            success, response = self.run_test(
                f"Filter Medicines by Category ({category})",
                "GET",
                "medicines",
                200,
                params={"category": category}
            )
            
            if success and isinstance(response, list):
                category_medicines = [m for m in response if m.get('category') == category]
                print(f"   Found {len(category_medicines)} {category} medicines")
                if len(category_medicines) == 0:
                    print(f"⚠️  No medicines found for category: {category}")
            else:
                all_success = False
        
        return all_success

    def test_prescription_filtering(self):
        """Test filtering medicines by prescription requirement"""
        # Test OTC medicines
        success1, response1 = self.run_test(
            "Filter Medicines by Prescription (OTC)",
            "GET",
            "medicines",
            200,
            params={"prescription_required": False}
        )
        
        if success1 and isinstance(response1, list):
            otc_medicines = [m for m in response1 if not m.get('prescriptionRequired', True)]
            print(f"   Found {len(otc_medicines)} Over-the-Counter medicines")
        
        # Test Prescription Required medicines
        success2, response2 = self.run_test(
            "Filter Medicines by Prescription (Required)",
            "GET",
            "medicines",
            200,
            params={"prescription_required": True}
        )
        
        if success2 and isinstance(response2, list):
            prescription_medicines = [m for m in response2 if m.get('prescriptionRequired', False)]
            print(f"   Found {len(prescription_medicines)} Prescription Required medicines")
        
        return success1 and success2

    def test_get_specific_medicine(self, medicine_id):
        """Test getting a specific medicine by ID"""
        success, response = self.run_test(
            f"Get Medicine by ID",
            "GET",
            f"medicines/{medicine_id}",
            200
        )
        
        if success and isinstance(response, dict):
            print(f"   Medicine: {response.get('name', 'Unknown')}")
            print(f"   Category: {response.get('category', 'Unknown')}")
            print(f"   Price: ${response.get('price', 0)}")
        
        return success

    # Prescription API Tests
    def test_create_prescription(self):
        """Test creating a new prescription"""
        prescription_data = {
            "userId": self.test_user_id,
            "doctorName": "Dr. Sarah Johnson",
            "hospitalName": "City General Hospital",
            "prescriptionDate": datetime.now().isoformat(),
            "medicines": [
                {
                    "medicineId": self.test_medicine_id or "test-medicine-id",
                    "medicineName": "Amoxicillin 500mg",
                    "dosage": "1 capsule 3 times daily",
                    "duration": "7 days"
                }
            ],
            "notes": "Take with food to avoid stomach upset"
        }
        
        success, response = self.run_test(
            "Create Prescription",
            "POST",
            "prescriptions",
            200,
            data=prescription_data
        )
        
        if success and isinstance(response, dict):
            self.test_prescription_id = response.get('id')
            print(f"   Created prescription ID: {self.test_prescription_id}")
            print(f"   Doctor: {response.get('doctorName', 'Unknown')}")
        
        return success

    def test_get_user_prescriptions(self):
        """Test getting user prescriptions"""
        success, response = self.run_test(
            "Get User Prescriptions",
            "GET",
            f"prescriptions/user/{self.test_user_id}",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} prescriptions for user")
            if len(response) > 0:
                prescription = response[0]
                print(f"   Sample prescription: Doctor {prescription.get('doctorName', 'Unknown')}")
        
        return success

    def test_get_specific_prescription(self):
        """Test getting a specific prescription by ID"""
        if not self.test_prescription_id:
            print("⚠️  Skipping - No prescription ID available")
            return True
            
        success, response = self.run_test(
            "Get Prescription by ID",
            "GET",
            f"prescriptions/{self.test_prescription_id}",
            200
        )
        
        if success and isinstance(response, dict):
            print(f"   Prescription Doctor: {response.get('doctorName', 'Unknown')}")
            print(f"   Used Status: {response.get('isUsed', False)}")
        
        return success

    def test_mark_prescription_used(self):
        """Test marking prescription as used"""
        if not self.test_prescription_id:
            print("⚠️  Skipping - No prescription ID available")
            return True
            
        success, response = self.run_test(
            "Mark Prescription as Used",
            "PUT",
            f"prescriptions/{self.test_prescription_id}/use",
            200
        )
        
        if success and isinstance(response, dict):
            print(f"   Message: {response.get('message', 'No message')}")
        
        return success

    # Shopping Cart API Tests
    def test_get_cart(self):
        """Test getting user's cart"""
        success, response = self.run_test(
            "Get User Cart",
            "GET",
            f"cart/{self.test_user_id}",
            200
        )
        
        if success and isinstance(response, dict):
            print(f"   Cart ID: {response.get('id', 'Unknown')}")
            print(f"   Items: {len(response.get('items', []))}")
            print(f"   Total: ${response.get('totalAmount', 0)}")
        
        return success

    def test_add_to_cart(self):
        """Test adding item to cart"""
        if not self.test_medicine_id:
            print("⚠️  Skipping - No medicine ID available")
            return True
            
        cart_item = {
            "medicineId": self.test_medicine_id,
            "medicineName": "Paracetamol 500mg",
            "price": 15.99,
            "quantity": 2
        }
        
        success, response = self.run_test(
            "Add Item to Cart",
            "POST",
            f"cart/{self.test_user_id}/add",
            200,
            data=cart_item
        )
        
        if success and isinstance(response, dict):
            print(f"   Message: {response.get('message', 'No message')}")
        
        return success

    def test_update_cart_item(self):
        """Test updating cart item quantity"""
        if not self.test_medicine_id:
            print("⚠️  Skipping - No medicine ID available")
            return True
            
        success, response = self.run_test(
            "Update Cart Item Quantity",
            "PUT",
            f"cart/{self.test_user_id}/update?medicine_id={self.test_medicine_id}&quantity=3",
            200
        )
        
        if success and isinstance(response, dict):
            print(f"   Message: {response.get('message', 'No message')}")
        
        return success

    def test_remove_from_cart(self):
        """Test removing item from cart"""
        if not self.test_medicine_id:
            print("⚠️  Skipping - No medicine ID available")
            return True
            
        success, response = self.run_test(
            "Remove Item from Cart",
            "DELETE",
            f"cart/{self.test_user_id}/remove/{self.test_medicine_id}",
            200
        )
        
        if success and isinstance(response, dict):
            print(f"   Message: {response.get('message', 'No message')}")
        
        return success

    def test_clear_cart(self):
        """Test clearing user's cart"""
        success, response = self.run_test(
            "Clear Cart",
            "DELETE",
            f"cart/{self.test_user_id}/clear",
            200
        )
        
        if success and isinstance(response, dict):
            print(f"   Message: {response.get('message', 'No message')}")
        
        return success

    # Order API Tests
    def test_create_order(self):
        """Test creating a new order"""
        order_data = {
            "userId": self.test_user_id,
            "items": [
                {
                    "medicineId": self.test_medicine_id or "test-medicine-id",
                    "medicineName": "Paracetamol 500mg",
                    "price": 15.99,
                    "quantity": 2
                }
            ],
            "totalAmount": 31.98,
            "deliveryAddress": "123 Main Street, Downtown, City 12345",
            "contactNumber": "+1-555-0123",
            "paymentMethod": "cash_on_delivery",
            "notes": "Please call before delivery"
        }
        
        success, response = self.run_test(
            "Create Order",
            "POST",
            "orders",
            200,
            data=order_data
        )
        
        if success and isinstance(response, dict):
            self.test_order_id = response.get('id')
            print(f"   Created order ID: {self.test_order_id}")
            print(f"   Status: {response.get('status', 'Unknown')}")
            print(f"   Total: ${response.get('totalAmount', 0)}")
        
        return success

    def test_get_user_orders(self):
        """Test getting user orders"""
        success, response = self.run_test(
            "Get User Orders",
            "GET",
            f"orders/user/{self.test_user_id}",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} orders for user")
            if len(response) > 0:
                order = response[0]
                print(f"   Sample order: Status {order.get('status', 'Unknown')}, Total ${order.get('totalAmount', 0)}")
        
        return success

    def test_get_specific_order(self):
        """Test getting a specific order by ID"""
        if not self.test_order_id:
            print("⚠️  Skipping - No order ID available")
            return True
            
        success, response = self.run_test(
            "Get Order by ID",
            "GET",
            f"orders/{self.test_order_id}",
            200
        )
        
        if success and isinstance(response, dict):
            print(f"   Order Status: {response.get('status', 'Unknown')}")
            print(f"   Delivery Address: {response.get('deliveryAddress', 'Unknown')}")
        
        return success

    def test_update_order_status(self):
        """Test updating order status"""
        if not self.test_order_id:
            print("⚠️  Skipping - No order ID available")
            return True
            
        success, response = self.run_test(
            "Update Order Status",
            "PUT",
            f"orders/{self.test_order_id}/status?status=confirmed",
            200
        )
        
        if success and isinstance(response, dict):
            print(f"   Message: {response.get('message', 'No message')}")
        
        return success

    def test_api_root(self):
        """Test API root endpoint"""
        success, response = self.run_test(
            "API Root",
            "GET", 
            "",
            200
        )
        if success and isinstance(response, dict):
            print(f"   Message: {response.get('message', 'No message found')}")
        return success

    def test_get_all_hospitals(self):
        """Test getting all hospitals"""
        success, response = self.run_test(
            "Get All Hospitals",
            "GET",
            "hospitals",
            200,
            expected_count=7
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} hospitals")
            if len(response) > 0:
                hospital = response[0]
                required_fields = ['id', 'name', 'location', 'phone', 'address', 'availableBeds', 'rating']
                missing_fields = [field for field in required_fields if field not in hospital]
                if missing_fields:
                    print(f"⚠️  Missing fields in hospital data: {missing_fields}")
                else:
                    print("✅ All required fields present in hospital data")
                    
                # Check bed availability structure
                beds = hospital.get('availableBeds', {})
                bed_types = ['ICU', 'General', 'Special']
                missing_bed_types = [bt for bt in bed_types if bt not in beds]
                if missing_bed_types:
                    print(f"⚠️  Missing bed types: {missing_bed_types}")
                else:
                    print("✅ All bed types present")
                    print(f"   Sample hospital: {hospital['name']} - ICU: {beds['ICU']}, General: {beds['General']}, Special: {beds['Special']}")
        
        return success, response

    def test_search_hospitals(self):
        """Test hospital search functionality"""
        # Test search by name
        success1, response1 = self.run_test(
            "Search Hospitals by Name (Metro)",
            "GET",
            "hospitals",
            200,
            params={"search": "Metro"}
        )
        
        if success1 and isinstance(response1, list):
            metro_hospitals = [h for h in response1 if 'Metro' in h.get('name', '')]
            print(f"   Found {len(metro_hospitals)} hospitals with 'Metro' in name")
        
        # Test search by location
        success2, response2 = self.run_test(
            "Search Hospitals by Location (Downtown)",
            "GET",
            "hospitals",
            200,
            params={"search": "Downtown"}
        )
        
        if success2 and isinstance(response2, list):
            downtown_hospitals = [h for h in response2 if 'Downtown' in h.get('location', '') or 'Downtown' in h.get('address', '')]
            print(f"   Found {len(downtown_hospitals)} hospitals in Downtown area")
        
        # Test search with no results
        success3, response3 = self.run_test(
            "Search Hospitals (No Results)",
            "GET",
            "hospitals",
            200,
            params={"search": "NonExistentHospital"}
        )
        
        if success3 and isinstance(response3, list):
            print(f"   Search for non-existent hospital returned {len(response3)} results")
        
        return success1 and success2 and success3

    def test_get_specific_hospital(self, hospital_id):
        """Test getting a specific hospital by ID"""
        success, response = self.run_test(
            f"Get Hospital by ID",
            "GET",
            f"hospitals/{hospital_id}",
            200
        )
        
        if success and isinstance(response, dict):
            print(f"   Hospital: {response.get('name', 'Unknown')}")
            print(f"   Location: {response.get('location', 'Unknown')}")
        
        return success

    def test_invalid_hospital_id(self):
        """Test getting hospital with invalid ID"""
        success, response = self.run_test(
            "Get Hospital with Invalid ID",
            "GET",
            "hospitals/invalid-id-123",
            404
        )
        return success

def main():
    print("🏥 Starting Hospot Medicine System API Tests")
    print("=" * 60)
    
    # Setup
    tester = HospotAPITester()
    
    print(f"🧪 Test User ID: {tester.test_user_id}")
    
    # Test API root
    tester.test_api_root()
    
    print("\n" + "=" * 60)
    print("🏥 HOSPITAL SYSTEM TESTS")
    print("=" * 60)
    
    # Test getting all hospitals
    success, hospitals = tester.test_get_all_hospitals()
    
    # Test search functionality
    tester.test_search_hospitals()
    
    # Test getting specific hospital (if we have hospitals)
    if success and hospitals and len(hospitals) > 0:
        first_hospital_id = hospitals[0].get('id')
        if first_hospital_id:
            tester.test_get_specific_hospital(first_hospital_id)
    
    # Test invalid hospital ID
    tester.test_invalid_hospital_id()
    
    print("\n" + "=" * 60)
    print("💊 MEDICINE SYSTEM TESTS")
    print("=" * 60)
    
    # Test Medicine APIs
    success, medicines = tester.test_get_all_medicines()
    tester.test_get_medicine_categories()
    tester.test_search_medicines()
    
    # Test getting specific medicine (if we have medicines)
    if success and medicines and len(medicines) > 0:
        first_medicine_id = medicines[0].get('id')
        if first_medicine_id:
            tester.test_medicine_id = first_medicine_id
            tester.test_get_specific_medicine(first_medicine_id)
    
    print("\n" + "=" * 60)
    print("📋 PRESCRIPTION SYSTEM TESTS")
    print("=" * 60)
    
    # Test Prescription APIs
    tester.test_create_prescription()
    tester.test_get_user_prescriptions()
    tester.test_get_specific_prescription()
    tester.test_mark_prescription_used()
    
    print("\n" + "=" * 60)
    print("🛒 SHOPPING CART SYSTEM TESTS")
    print("=" * 60)
    
    # Test Shopping Cart APIs
    tester.test_get_cart()
    tester.test_add_to_cart()
    tester.test_update_cart_item()
    tester.test_remove_from_cart()
    tester.test_clear_cart()
    
    print("\n" + "=" * 60)
    print("📦 ORDER SYSTEM TESTS")
    print("=" * 60)
    
    # Test Order APIs
    tester.test_create_order()
    tester.test_get_user_orders()
    tester.test_get_specific_order()
    tester.test_update_order_status()
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"📊 FINAL RESULTS")
    print("=" * 60)
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed! Medicine System Backend API is working correctly.")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed.")
        return 1

if __name__ == "__main__":
    sys.exit(main())