import requests
import sys
from datetime import datetime
import json
import uuid

class HospotAPITester:
    def __init__(self, base_url="https://pharmastore-6.preview.emergentagent.com"):
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
    print("🏥 Starting Hospot API Tests")
    print("=" * 50)
    
    # Setup
    tester = HospotAPITester()
    
    # Test API root
    tester.test_api_root()
    
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
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 FINAL RESULTS")
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed! Backend API is working correctly.")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed.")
        return 1

if __name__ == "__main__":
    sys.exit(main())