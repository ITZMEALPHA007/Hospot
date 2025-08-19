import React, { useState, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Progress } from "./components/ui/progress";
import { Search, MapPin, Phone, Star, Bed, ArrowLeft, Activity, Calendar, Clock, Users, CheckCircle } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Header Component with Logo Navigation
const Header = ({ showHomeButton = false }) => {
  const navigate = useNavigate();

  return (
    <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div 
          className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate('/home')}
        >
          <Activity className="h-8 w-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Hospot</h1>
        </div>
        <div className="flex items-center space-x-4">
          {showHomeButton && (
            <Button 
              variant="outline"
              onClick={() => navigate('/home')}
              className="text-gray-600"
            >
              Home
            </Button>
          )}
          <Button 
            onClick={() => navigate('/login')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6"
          >
            Login
          </Button>
        </div>
      </div>
    </header>
  );
};

// Landing Page Component
const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <Header />

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-blue-100 rounded-full mb-6">
              <Activity className="h-12 w-12 text-blue-600" />
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Find & Book Hospital Beds<br />
              <span className="text-blue-600">in Real Time</span>
            </h2>
            <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 mt-16">
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
          <div 
            className="flex items-center justify-center space-x-2 mb-4 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate('/home')}
          >
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

// Home Page Component (Hospital List)
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
            <div 
              className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate('/home')}
            >
              <Activity className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Hospot</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                variant="outline"
                onClick={() => navigate('/')}
                className="text-gray-600"
              >
                Landing
              </Button>
              <Button 
                onClick={() => navigate('/login')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6"
              >
                Login
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Search Section */}
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Find Hospital Beds</h2>
          <p className="text-gray-600 mb-6">Search for hospitals and check real-time bed availability</p>
          
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4 max-w-2xl">
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
        <div className="grid gap-6">
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
                <Card 
                  key={hospital.id} 
                  className="hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-[1.01]"
                  onClick={() => navigate(`/hospital/${hospital.id}`)}
                >
                  <CardContent className="p-4 md:p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                      {/* Hospital Info */}
                      <div className="lg:col-span-2">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">{hospital.name}</h3>
                            <div className="space-y-2">
                              <div className="flex items-center text-gray-600">
                                <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
                                <span className="text-sm">{hospital.location} • {hospital.distance}</span>
                              </div>
                              <div className="flex items-center text-gray-600">
                                <Phone className="h-4 w-4 mr-2 flex-shrink-0" />
                                <span className="text-sm">{hospital.phone}</span>
                              </div>
                              <p className="text-sm text-gray-600">{hospital.address}</p>
                            </div>
                          </div>
                          <div className="flex items-center mt-2 sm:mt-0">
                            <Star className="h-4 w-4 text-yellow-400 fill-current mr-1" />
                            <span className="text-sm font-medium">{hospital.rating}</span>
                          </div>
                        </div>
                      </div>

                      {/* Bed Availability */}
                      <div className="lg:col-span-1">
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="font-medium text-gray-900 text-sm">Bed Availability</h4>
                            <Badge className={bedStatus.color} variant="outline">
                              {bedStatus.text}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className="bg-red-50 p-2 rounded text-center">
                              <div className="text-lg font-bold text-red-600">{hospital.availableBeds.ICU}</div>
                              <div className="text-xs text-red-600 font-medium">ICU</div>
                            </div>
                            <div className="bg-blue-50 p-2 rounded text-center">
                              <div className="text-lg font-bold text-blue-600">{hospital.availableBeds.General}</div>
                              <div className="text-xs text-blue-600 font-medium">General</div>
                            </div>
                            <div className="bg-green-50 p-2 rounded text-center">
                              <div className="text-lg font-bold text-green-600">{hospital.availableBeds.Special}</div>
                              <div className="text-xs text-green-600 font-medium">Special</div>
                            </div>
                          </div>

                          <div className="text-center">
                            <div className="text-sm font-semibold text-gray-900 mb-2">
                              Total: {totalBeds} beds available
                            </div>
                            <div className="flex flex-wrap gap-1 justify-center">
                              {hospital.emergency && (
                                <Badge variant="outline" className="border-green-600 text-green-600 text-xs">
                                  Emergency
                                </Badge>
                              )}
                              <Button 
                                size="sm" 
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/hospital/${hospital.id}`);
                                }}
                              >
                                View Details
                              </Button>
                            </div>
                          </div>
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

// Hospital Progress/Detail Page
const HospitalProgressPage = () => {
  const { hospitalId } = useParams();
  const navigate = useNavigate();
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedBedType, setSelectedBedType] = useState(null);

  useEffect(() => {
    const fetchHospital = async () => {
      try {
        const response = await axios.get(`${API}/hospitals/${hospitalId}`);
        setHospital(response.data);
      } catch (error) {
        console.error('Error fetching hospital:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHospital();
  }, [hospitalId]);

  const handleBookNow = (bedType) => {
    setSelectedBedType(bedType);
    // Simulate booking - in real app this would open a booking form or redirect to booking page
    alert(`Booking ${bedType} bed at ${hospital.name}. This would normally open a booking form.`);
  };

  const getBedProgress = (available, total = 100) => {
    return (available / total) * 100;
  };

  const getBedColor = (bedType) => {
    switch (bedType) {
      case 'ICU': return { bg: 'bg-red-500', light: 'bg-red-100', text: 'text-red-700' };
      case 'General': return { bg: 'bg-blue-500', light: 'bg-blue-100', text: 'text-blue-700' };
      case 'Special': return { bg: 'bg-green-500', light: 'bg-green-100', text: 'text-green-700' };
      default: return { bg: 'bg-gray-500', light: 'bg-gray-100', text: 'text-gray-700' };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading hospital details...</p>
        </div>
      </div>
    );
  }

  if (!hospital) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Hospital Not Found</h2>
          <Button onClick={() => navigate('/home')}>Back to Home</Button>
        </div>
      </div>
    );
  }

  const totalBeds = hospital.availableBeds.ICU + hospital.availableBeds.General + hospital.availableBeds.Special;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showHomeButton={true} />

      <main className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Button 
          variant="outline" 
          onClick={() => navigate('/home')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Hospitals
        </Button>

        {/* Hospital Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{hospital.name}</h1>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center text-gray-600">
                    <MapPin className="h-5 w-5 mr-3 text-blue-600" />
                    <div>
                      <div className="font-medium">{hospital.location}</div>
                      <div className="text-sm">{hospital.distance} away</div>
                    </div>
                  </div>
                  <div className="flex items-center text-gray-600">
                    <Phone className="h-5 w-5 mr-3 text-blue-600" />
                    <div>{hospital.phone}</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <Star className="h-5 w-5 text-yellow-400 fill-current mr-2" />
                    <span className="font-semibold">{hospital.rating}</span>
                    <span className="text-gray-500 ml-2">Rating</span>
                  </div>
                  {hospital.emergency && (
                    <div className="flex items-center">
                      <Activity className="h-5 w-5 text-green-600 mr-2" />
                      <Badge className="bg-green-100 text-green-800">
                        Emergency Services Available
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-gray-600 mt-4">{hospital.address}</p>
            </div>
            
            {/* Quick Stats */}
            <div className="lg:min-w-[200px]">
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4 text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">{totalBeds}</div>
                  <div className="text-blue-700 font-medium">Total Beds Available</div>
                  <div className="text-sm text-blue-600 mt-2">Updated in real-time</div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Bed Availability Progress */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {Object.entries(hospital.availableBeds).map(([bedType, available]) => {
            const colors = getBedColor(bedType);
            const progress = getBedProgress(available);
            
            return (
              <Card key={bedType} className="overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">{bedType} Beds</h3>
                    <Bed className={`h-6 w-6 ${colors.text}`} />
                  </div>
                  
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-2xl font-bold text-gray-900">{available}</span>
                      <span className="text-sm text-gray-500">Available</span>
                    </div>
                    <Progress 
                      value={progress} 
                      className="h-3"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>0</span>
                      <span>100 Total</span>
                    </div>
                  </div>

                  <Button
                    onClick={() => handleBookNow(bedType)}
                    disabled={available === 0}
                    className={`w-full ${
                      available === 0 
                        ? 'bg-gray-300 cursor-not-allowed' 
                        : `${colors.bg} hover:opacity-90`
                    } text-white`}
                  >
                    {available === 0 ? (
                      <>
                        <Clock className="h-4 w-4 mr-2" />
                        No Beds Available
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Book {bedType} Bed
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Additional Information */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2 text-blue-600" />
                Departments & Services
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span>Intensive Care Unit (ICU)</span>
                  <Badge variant="outline" className={hospital.availableBeds.ICU > 0 ? 'border-green-600 text-green-600' : 'border-red-600 text-red-600'}>
                    {hospital.availableBeds.ICU > 0 ? 'Available' : 'Full'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>General Medicine</span>
                  <Badge variant="outline" className={hospital.availableBeds.General > 0 ? 'border-green-600 text-green-600' : 'border-red-600 text-red-600'}>
                    {hospital.availableBeds.General > 0 ? 'Available' : 'Full'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Specialized Care</span>
                  <Badge variant="outline" className={hospital.availableBeds.Special > 0 ? 'border-green-600 text-green-600' : 'border-red-600 text-red-600'}>
                    {hospital.availableBeds.Special > 0 ? 'Available' : 'Full'}
                  </Badge>
                </div>
                {hospital.emergency && (
                  <div className="flex items-center justify-between">
                    <span>Emergency Services</span>
                    <Badge className="bg-green-100 text-green-800">
                      24/7 Available
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-5 w-5 mr-2 text-blue-600" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => window.open(`tel:${hospital.phone}`, '_self')}
              >
                <Phone className="h-4 w-4 mr-2" />
                Call Hospital
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(hospital.address)}`, '_blank')}
              >
                <MapPin className="h-4 w-4 mr-2" />
                Get Directions
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => navigate('/home')}
              >
                <Search className="h-4 w-4 mr-2" />
                Compare Hospitals
              </Button>
            </CardContent>
          </Card>
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
          <Route path="/hospital/:hospitalId" element={<HospitalProgressPage />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;