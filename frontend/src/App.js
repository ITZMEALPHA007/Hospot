import React, { useState, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Search, MapPin, Phone, Star, Bed, ArrowLeft, Activity } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Landing Page Component
const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Activity className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Hospot</h1>
          </div>
          <Button 
            onClick={() => navigate('/login')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6"
          >
            Login
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-blue-100 rounded-full mb-6">
              <Activity className="h-12 w-12 text-blue-600" />
            </div>
            <h2 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Find & Book Hospital Beds<br />
              <span className="text-blue-600">in Real Time</span>
            </h2>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Connect with hospitals instantly. Check bed availability, compare facilities, 
              and secure the care you need when it matters most.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Button 
              size="lg"
              onClick={() => navigate('/login')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 text-lg"
            >
              Get Started
            </Button>
            <Button 
              size="lg"
              variant="outline"
              onClick={() => navigate('/home')}
              className="border-blue-600 text-blue-600 hover:bg-blue-50 px-8 py-4 text-lg"
            >
              Browse Hospitals
            </Button>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-8 mt-16">
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Search className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle className="text-xl">Real-time Search</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Search hospitals by location and instantly see bed availability across ICU, General, and Special care units.
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Bed className="h-6 w-6 text-blue-600" />
                </div>
                <CardTitle className="text-xl">Live Bed Count</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  View real-time bed availability with detailed breakdown by department and emergency status.
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <MapPin className="h-6 w-6 text-purple-600" />
                </div>
                <CardTitle className="text-xl">Location Based</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Find hospitals near you with distance information and ratings to make informed decisions quickly.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 mt-16">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Activity className="h-6 w-6" />
            <span className="text-xl font-bold">Hospot</span>
          </div>
          <p className="text-gray-400">
            Connecting patients with healthcare when it matters most.
          </p>
        </div>
      </footer>
    </div>
  );
};

// Login Page Component
const LoginPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    contact: '',
    loginType: 'email'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Simple validation - no actual OTP for demo
    if (formData.contact.trim()) {
      navigate('/home');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Activity className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Hospot</h1>
          </div>
          <CardTitle className="text-2xl">Welcome Back</CardTitle>
          <CardDescription>
            Login to find and book hospital beds instantly
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Email or Phone Number
              </label>
              <Input
                type="text"
                placeholder="Enter your email or phone number"
                value={formData.contact}
                onChange={(e) => setFormData({...formData, contact: e.target.value})}
                className="w-full"
                required
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Login
            </Button>
            
            <Button 
              type="button"
              variant="outline"
              onClick={() => navigate('/')}
              className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// Home Page Component
const HomePage = () => {
  const [hospitals, setHospitals] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchHospitals = async (search = '') => {
    setLoading(true);
    try {
      const url = search ? `${API}/hospitals?search=${encodeURIComponent(search)}` : `${API}/hospitals`;
      const response = await axios.get(url);
      setHospitals(response.data);
    } catch (error) {
      console.error('Error fetching hospitals:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHospitals();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchHospitals(searchTerm);
  };

  const getTotalBeds = (availableBeds) => {
    return availableBeds.ICU + availableBeds.General + availableBeds.Special;
  };

  const getBedStatus = (availableBeds) => {
    const total = getTotalBeds(availableBeds);
    if (total === 0) return { color: 'bg-red-100 text-red-800', text: 'No beds' };
    if (total < 10) return { color: 'bg-yellow-100 text-yellow-800', text: 'Limited' };
    return { color: 'bg-green-100 text-green-800', text: 'Available' };
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Hospot</h1>
            </div>
            <Button 
              variant="outline"
              onClick={() => navigate('/')}
              className="text-gray-600"
            >
              Home
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Search Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Find Hospital Beds</h2>
          <p className="text-gray-600 mb-6">Search for hospitals and check real-time bed availability</p>
          
          <form onSubmit={handleSearch} className="flex gap-4 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by hospital name, location, or area..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-6"
            >
              Search
            </Button>
          </form>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading hospitals...</p>
            </div>
          ) : hospitals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No hospitals found. Try a different search term.</p>
            </div>
          ) : (
            hospitals.map((hospital) => {
              const totalBeds = getTotalBeds(hospital.availableBeds);
              const bedStatus = getBedStatus(hospital.availableBeds);
              
              return (
                <Card key={hospital.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      {/* Hospital Info */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-1">{hospital.name}</h3>
                            <div className="flex items-center text-gray-600 mb-2">
                              <MapPin className="h-4 w-4 mr-1" />
                              <span className="text-sm">{hospital.location} • {hospital.distance}</span>
                            </div>
                            <div className="flex items-center text-gray-600 mb-2">
                              <Phone className="h-4 w-4 mr-1" />
                              <span className="text-sm">{hospital.phone}</span>
                            </div>
                            <p className="text-sm text-gray-600">{hospital.address}</p>
                          </div>
                          <div className="flex items-center">
                            <Star className="h-4 w-4 text-yellow-400 fill-current mr-1" />
                            <span className="text-sm font-medium">{hospital.rating}</span>
                          </div>
                        </div>
                      </div>

                      {/* Bed Availability */}
                      <div className="lg:min-w-[300px]">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium text-gray-900">Bed Availability</h4>
                          <Badge className={bedStatus.color}>
                            {bedStatus.text}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div className="bg-red-50 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-red-600">{hospital.availableBeds.ICU}</div>
                            <div className="text-xs text-red-600 font-medium">ICU</div>
                          </div>
                          <div className="bg-blue-50 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">{hospital.availableBeds.General}</div>
                            <div className="text-xs text-blue-600 font-medium">General</div>
                          </div>
                          <div className="bg-green-50 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">{hospital.availableBeds.Special}</div>
                            <div className="text-xs text-green-600 font-medium">Special</div>
                          </div>
                        </div>

                        <div className="mt-3 text-center">
                          <div className="text-lg font-semibold text-gray-900">
                            Total: {totalBeds} beds available
                          </div>
                          {hospital.emergency && (
                            <Badge variant="outline" className="mt-2 border-green-600 text-green-600">
                              Emergency Services
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
};

// Main App Component
function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/home" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;