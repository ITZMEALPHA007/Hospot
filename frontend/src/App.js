import React, { useState, useEffect, createContext, useContext } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate } from "react-router-dom";
import axios from "axios";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Progress } from "./components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";
import { Search, MapPin, Phone, Star, Bed, ArrowLeft, Activity, Calendar, Clock, Users, CheckCircle, User, Heart, Shield, FileText, X, Eye, EyeOff, ShoppingCart, Pill, Upload, Package } from "lucide-react";
import { PrescriptionsPage, CartPage, CheckoutPage, OrdersPage } from "./components/MedicineComponents";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Authentication Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check if user is logged in from localStorage
    const savedUser = localStorage.getItem('hospot_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
    }
  }, []);

  const login = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
    localStorage.setItem('hospot_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('hospot_user');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// Booking Form Component (Updated to use new user data)
const BookingForm = ({ hospital, bedType, isOpen, onClose }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    // Personal Information
    fullName: user?.name || '',
    age: '',
    gender: '',
    bloodGroup: '',
    
    // Contact Information
    mobile: '',
    email: user?.email || '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    
    // Medical Information
    primaryCondition: '',
    allergies: '',
    currentMedications: '',
    previousSurgeries: '',
    
    // Insurance Information
    insuranceProvider: '',
    policyNumber: '',
    
    // Additional Information
    specialRequests: '',
    preferredAdmissionDate: '',
    admissionTime: 'immediate'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate booking submission
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      alert(`Booking Confirmation!\n\nHospital: ${hospital?.name}\nBed Type: ${bedType}\nPatient: ${formData.fullName}\n\nYour bed booking request has been submitted successfully. You will receive a confirmation call within 15 minutes.`);
      
      onClose();
      setFormData({
        fullName: user?.name || '',
        age: '',
        gender: '',
        bloodGroup: '',
        mobile: user?.contact || '',
        email: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        primaryCondition: '',
        allergies: '',
        currentMedications: '',
        previousSurgeries: '',
        insuranceProvider: '',
        policyNumber: '',
        specialRequests: '',
        preferredAdmissionDate: '',
        admissionTime: 'immediate'
      });
    } catch (error) {
      alert('Booking failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-2xl">
            <FileText className="h-6 w-6 mr-2 text-blue-600" />
            Bed Booking Application
          </DialogTitle>
          <DialogDescription>
            {hospital?.name} - {bedType} Bed Reservation
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Information */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-3 flex items-center">
                  <User className="h-4 w-4 mr-2" />
                  Personal Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Full Name *</label>
                    <Input
                      value={formData.fullName}
                      onChange={(e) => handleInputChange('fullName', e.target.value)}
                      placeholder="Enter full name"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Age *</label>
                      <Input
                        type="number"
                        value={formData.age}
                        onChange={(e) => handleInputChange('age', e.target.value)}
                        placeholder="Age"
                        min="1"
                        max="120"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Gender *</label>
                      <Select value={formData.gender} onValueChange={(value) => handleInputChange('gender', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Blood Group *</label>
                    <Select value={formData.bloodGroup} onValueChange={(value) => handleInputChange('bloodGroup', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select blood group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A+">A+</SelectItem>
                        <SelectItem value="A-">A-</SelectItem>
                        <SelectItem value="B+">B+</SelectItem>
                        <SelectItem value="B-">B-</SelectItem>
                        <SelectItem value="AB+">AB+</SelectItem>
                        <SelectItem value="AB-">AB-</SelectItem>
                        <SelectItem value="O+">O+</SelectItem>
                        <SelectItem value="O-">O-</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-3 flex items-center">
                  <Phone className="h-4 w-4 mr-2" />
                  Contact Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Mobile Number *</label>
                    <Input
                      type="tel"
                      value={formData.mobile}
                      onChange={(e) => handleInputChange('mobile', e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Email Address</label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="example@email.com"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Emergency Contact Name *</label>
                    <Input
                      value={formData.emergencyContactName}
                      onChange={(e) => handleInputChange('emergencyContactName', e.target.value)}
                      placeholder="Emergency contact person"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Emergency Contact Phone *</label>
                    <Input
                      type="tel"
                      value={formData.emergencyContactPhone}
                      onChange={(e) => handleInputChange('emergencyContactPhone', e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Medical Information */}
              <div className="bg-red-50 p-4 rounded-lg">
                <h3 className="font-semibold text-red-900 mb-3 flex items-center">
                  <Heart className="h-4 w-4 mr-2" />
                  Medical Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Primary Condition/Reason for Admission *</label>
                    <Textarea
                      value={formData.primaryCondition}
                      onChange={(e) => handleInputChange('primaryCondition', e.target.value)}
                      placeholder="Describe the medical condition or reason for hospital admission"
                      rows={3}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Known Allergies</label>
                    <Input
                      value={formData.allergies}
                      onChange={(e) => handleInputChange('allergies', e.target.value)}
                      placeholder="Food, medications, environmental allergies (or None)"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Current Medications</label>
                    <Textarea
                      value={formData.currentMedications}
                      onChange={(e) => handleInputChange('currentMedications', e.target.value)}
                      placeholder="List all current medications, dosages, and frequency"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Previous Surgeries/Major Medical History</label>
                    <Textarea
                      value={formData.previousSurgeries}
                      onChange={(e) => handleInputChange('previousSurgeries', e.target.value)}
                      placeholder="Any previous surgeries, chronic conditions, or major medical events"
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* Insurance Information */}
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="font-semibold text-purple-900 mb-3 flex items-center">
                  <Shield className="h-4 w-4 mr-2" />
                  Insurance Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Insurance Provider</label>
                    <Input
                      value={formData.insuranceProvider}
                      onChange={(e) => handleInputChange('insuranceProvider', e.target.value)}
                      placeholder="Insurance company name"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Policy/Member Number</label>
                    <Input
                      value={formData.policyNumber}
                      onChange={(e) => handleInputChange('policyNumber', e.target.value)}
                      placeholder="Policy or member ID number"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              Admission Preferences
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Preferred Admission Date</label>
                <Input
                  type="date"
                  value={formData.preferredAdmissionDate}
                  onChange={(e) => handleInputChange('preferredAdmissionDate', e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Admission Urgency</label>
                <Select value={formData.admissionTime} onValueChange={(value) => handleInputChange('admissionTime', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate/Emergency</SelectItem>
                    <SelectItem value="today">Within Today</SelectItem>
                    <SelectItem value="week">Within This Week</SelectItem>
                    <SelectItem value="flexible">Flexible Timing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3">
              <label className="text-sm font-medium text-gray-700 mb-1 block">Special Requests or Additional Information</label>
              <Textarea
                value={formData.specialRequests}
                onChange={(e) => handleInputChange('specialRequests', e.target.value)}
                placeholder="Any special accommodation requests, dietary requirements, or additional information"
                rows={3}
              />
            </div>
          </div>

          {/* Booking Summary */}
          <div className="bg-blue-100 p-4 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">Booking Summary</h3>
            <div className="text-sm text-blue-800">
              <p><strong>Hospital:</strong> {hospital?.name}</p>
              <p><strong>Bed Type:</strong> {bedType}</p>
              <p><strong>Patient:</strong> {formData.fullName || 'Not specified'}</p>
              <p><strong>Contact:</strong> {formData.mobile || 'Not specified'}</p>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-between items-center pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={isSubmitting}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Submit Booking Request
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Header Component with Auth
const Header = ({ showHomeButton = false }) => {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div 
          className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate(isAuthenticated ? '/home' : '/')}
        >
          <Activity className="h-8 w-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Hospot</h1>
        </div>

        {/* Navigation Menu for Authenticated Users */}
        {isAuthenticated && (
          <nav className="hidden md:flex items-center space-x-6">
            <Button 
              variant="ghost"
              onClick={() => navigate('/home')}
              className="text-gray-700 hover:text-blue-600"
            >
              <Bed className="h-4 w-4 mr-2" />
              Hospitals
            </Button>
            <Button 
              variant="ghost"
              onClick={() => navigate('/medicines')}
              className="text-gray-700 hover:text-blue-600"
            >
              <Pill className="h-4 w-4 mr-2" />
              Medicines
            </Button>
            <Button 
              variant="ghost"
              onClick={() => navigate('/prescriptions')}
              className="text-gray-700 hover:text-blue-600"
            >
              <FileText className="h-4 w-4 mr-2" />
              Prescriptions
            </Button>
            <Button 
              variant="ghost"
              onClick={() => navigate('/cart')}
              className="text-gray-700 hover:text-blue-600 relative"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Cart
            </Button>
            <Button 
              variant="ghost"
              onClick={() => navigate('/orders')}
              className="text-gray-700 hover:text-blue-600"
            >
              <Package className="h-4 w-4 mr-2" />
              Orders
            </Button>
          </nav>
        )}
        
        <div className="flex items-center space-x-4">
          {isAuthenticated ? (
            <>
              {showHomeButton && (
                <Button 
                  variant="outline"
                  onClick={() => navigate('/home')}
                  className="text-gray-600 md:hidden"
                >
                  Home
                </Button>
              )}
              <span className="text-sm text-gray-600 hidden sm:block">Welcome, {user?.name}</span>
              <Button 
                onClick={handleLogout}
                variant="outline"
                className="text-gray-600"
              >
                Logout
              </Button>
            </>
          ) : (
            <Button 
              onClick={() => navigate('/login')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6"
            >
              Login
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

// Landing Page Component (Updated)
const LandingPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Redirect to home if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/home');
    }
  }, [isAuthenticated, navigate]);

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
              onClick={() => navigate('/login')}
              className="border-blue-600 text-blue-600 hover:bg-blue-50 px-8 py-4 text-lg"
            >
              Login to Continue
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

          {/* Call to Action */}
          <div className="mt-16 bg-white rounded-2xl shadow-lg p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Ready to Get Started?</h3>
            <p className="text-gray-600 mb-6">
              Create your account or login to access real-time hospital bed availability and book instantly.
            </p>
            <Button 
              size="lg"
              onClick={() => navigate('/login')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
            >
              Login Now
            </Button>
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

// Login Page Component (Enhanced with Validations)
const LoginPage = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: ''
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/home');
    }
  }, [isAuthenticated, navigate]);

  // Validation functions
  const validateName = (name) => {
    const nameRegex = /^[A-Za-z\s]+$/;
    if (!name.trim()) {
      return "Full name is required";
    }
    if (name.trim().length < 2) {
      return "Name must be at least 2 characters long";
    }
    if (!nameRegex.test(name.trim())) {
      return "Name can only contain letters and spaces";
    }
    return null;
  };

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      return "Email address is required";
    }
    if (!emailRegex.test(email.trim())) {
      return "Please enter a valid email address";
    }
    return null;
  };

  const validatePassword = (password) => {
    if (!password) {
      return "Password is required";
    }
    if (password.length < 8) {
      return "Password must be at least 8 characters long";
    }
    
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    const missingRequirements = [];
    if (!hasUppercase) missingRequirements.push("one uppercase letter");
    if (!hasLowercase) missingRequirements.push("one lowercase letter");
    if (!hasNumber) missingRequirements.push("one number");
    if (!hasSpecialChar) missingRequirements.push("one special character");

    if (missingRequirements.length > 0) {
      return `Password must contain ${missingRequirements.join(", ")}`;
    }

    return null;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Validate all fields
    const nameError = validateName(formData.name);
    const emailError = validateEmail(formData.email);
    const passwordError = validatePassword(formData.password);

    const newErrors = {
      name: nameError,
      email: emailError,
      password: passwordError
    };

    setErrors(newErrors);

    // Check if there are any errors
    const hasErrors = Object.values(newErrors).some(error => error !== null);
    
    if (!hasErrors) {
      // Simulate login delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      login({
        name: formData.name.trim(),
        email: formData.email.trim(),
        contact: formData.email.trim()
      });
      navigate('/home');
    }
    
    setIsSubmitting(false);
  };

  const getPasswordStrength = () => {
    const password = formData.password;
    if (!password) return { strength: 0, label: '', color: 'bg-gray-200' };
    
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;

    const levels = [
      { strength: 0, label: '', color: 'bg-gray-200' },
      { strength: 20, label: 'Very Weak', color: 'bg-red-500' },
      { strength: 40, label: 'Weak', color: 'bg-red-400' },
      { strength: 60, label: 'Fair', color: 'bg-yellow-500' },
      { strength: 80, label: 'Good', color: 'bg-blue-500' },
      { strength: 100, label: 'Strong', color: 'bg-green-500' }
    ];

    return levels[score];
  };

  const passwordStrength = getPasswordStrength();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md sm:max-w-lg">
        <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-4">
            <div 
              className="flex items-center justify-center space-x-2 mb-6 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate('/')}
            >
              <Activity className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Hospot</h1>
            </div>
            <CardTitle className="text-xl sm:text-2xl text-gray-900">Welcome to Hospot</CardTitle>
            <CardDescription className="text-gray-600 px-2">
              Create your account to find and book hospital beds instantly
            </CardDescription>
          </CardHeader>
          
          <CardContent className="px-4 sm:px-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Full Name Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center">
                  <User className="h-4 w-4 mr-2 text-blue-600" />
                  Full Name *
                </label>
                <Input
                  type="text"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={`w-full transition-colors ${
                    errors.name 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-200' 
                      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                  }`}
                  required
                />
                {errors.name && (
                  <p className="text-red-500 text-xs flex items-center">
                    <span className="mr-1">⚠</span>
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center">
                  <span className="text-blue-600 mr-2">@</span>
                  Email Address *
                </label>
                <Input
                  type="email"
                  placeholder="Enter your email address"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className={`w-full transition-colors ${
                    errors.email 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-200' 
                      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                  }`}
                  required
                />
                {errors.email && (
                  <p className="text-red-500 text-xs flex items-center">
                    <span className="mr-1">⚠</span>
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center">
                  <Shield className="h-4 w-4 mr-2 text-blue-600" />
                  Password *
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a secure password"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className={`w-full pr-12 transition-colors ${
                      errors.password 
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-200' 
                        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                    }`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                  >
                    {showPassword ? (
                      <span className="text-sm">👁️</span>
                    ) : (
                      <span className="text-sm">👁️‍🗨️</span>
                    )}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {formData.password && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all duration-300 ${passwordStrength.color}`}
                          style={{ width: `${passwordStrength.strength}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-gray-600 min-w-16">{passwordStrength.label}</span>
                    </div>
                  </div>
                )}

                {/* Password Requirements */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium text-gray-700 mb-2">Password must contain:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                    <div className={`flex items-center ${/[A-Z]/.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>
                      <span className="mr-1">{/[A-Z]/.test(formData.password) ? '✓' : '○'}</span>
                      Uppercase letter
                    </div>
                    <div className={`flex items-center ${/[a-z]/.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>
                      <span className="mr-1">{/[a-z]/.test(formData.password) ? '✓' : '○'}</span>
                      Lowercase letter
                    </div>
                    <div className={`flex items-center ${/\d/.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>
                      <span className="mr-1">{/\d/.test(formData.password) ? '✓' : '○'}</span>
                      Number
                    </div>
                    <div className={`flex items-center ${/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>
                      <span className="mr-1">{/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(formData.password) ? '✓' : '○'}</span>
                      Special character
                    </div>
                  </div>
                </div>

                {errors.password && (
                  <p className="text-red-500 text-xs flex items-center">
                    <span className="mr-1">⚠</span>
                    {errors.password}
                  </p>
                )}
              </div>
              
              {/* Submit Button */}
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating Account...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Create Account & Login
                  </>
                )}
              </Button>
              
              {/* Back Button */}
              <Button 
                type="button"
                variant="outline"
                onClick={() => navigate('/')}
                disabled={isSubmitting}
                className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 py-3 text-base transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </form>

            {/* Additional Info */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center px-4">
                By creating an account, you agree to our Terms of Service and Privacy Policy. 
                Your information is encrypted and secure.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Home Page Component (Protected)
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
      <Header />

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

// Hospital Progress/Detail Page (Updated with Booking Form)
const HospitalProgressPage = () => {
  const { hospitalId } = useParams();
  const navigate = useNavigate();
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bookingFormOpen, setBookingFormOpen] = useState(false);
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
    setBookingFormOpen(true);
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

        {/* Booking Form Modal */}
        <BookingForm
          hospital={hospital}
          bedType={selectedBedType}
          isOpen={bookingFormOpen}
          onClose={() => {
            setBookingFormOpen(false);
            setSelectedBedType(null);
          }}
        />
      </main>
    </div>
  );
};

// Medicine Components
const MedicinesPage = () => {
  const [medicines, setMedicines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [prescriptionRequired, setPrescriptionRequired] = useState('');
  const navigate = useNavigate();

  const fetchMedicines = async (filters = {}) => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (filters.search) queryParams.append('search', filters.search);
      if (filters.category) queryParams.append('category', filters.category);
      if (filters.prescriptionRequired !== '') queryParams.append('prescription_required', filters.prescriptionRequired);

      const url = `${API}/medicines${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      const response = await axios.get(url);
      setMedicines(response.data);
    } catch (error) {
      console.error('Error fetching medicines:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/medicines/categories`);
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  useEffect(() => {
    fetchMedicines();
    fetchCategories();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchMedicines({
      search: searchTerm,
      category: selectedCategory,
      prescriptionRequired: prescriptionRequired
    });
  };

  const handleFilter = () => {
    fetchMedicines({
      search: searchTerm,
      category: selectedCategory,
      prescriptionRequired: prescriptionRequired
    });
  };

  const addToCart = async (medicine) => {
    try {
      const { user } = JSON.parse(localStorage.getItem('hospot_user') || '{}');
      if (!user) return;

      const cartItem = {
        medicineId: medicine.id,
        medicineName: medicine.name,
        price: medicine.price,
        quantity: 1
      };

      await axios.post(`${API}/cart/${user.email}/add`, cartItem);
      alert(`${medicine.name} added to cart!`);
    } catch (error) {
      console.error('Error adding to cart:', error);
      alert('Failed to add to cart. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Medicine Store</h2>
          <p className="text-gray-600 mb-6">Browse and order medicines online with prescription support</p>
          
          {/* Search and Filters */}
          <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
            <form onSubmit={handleSearch} className="grid md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search medicines..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={prescriptionRequired} onValueChange={setPrescriptionRequired}>
                <SelectTrigger>
                  <SelectValue placeholder="All Medicines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Medicines</SelectItem>
                  <SelectItem value="false">Over-the-Counter</SelectItem>
                  <SelectItem value="true">Prescription Required</SelectItem>
                </SelectContent>
              </Select>

              <Button 
                type="submit" 
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Search
              </Button>
            </form>
          </div>
        </div>

        {/* Results */}
        <div className="grid gap-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading medicines...</p>
            </div>
          ) : medicines.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No medicines found. Try adjusting your search criteria.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {medicines.map((medicine) => (
                <Card key={medicine.id} className="hover:shadow-lg transition-all duration-200">
                  <CardContent className="p-4">
                    {medicine.imageUrl && (
                      <div className="aspect-square bg-gray-100 rounded-lg mb-4 overflow-hidden">
                        <img 
                          src={medicine.imageUrl} 
                          alt={medicine.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-semibold text-gray-900 mb-1">{medicine.name}</h3>
                        <p className="text-sm text-gray-600 line-clamp-2">{medicine.description}</p>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-blue-600">${medicine.price}</span>
                        <Badge 
                          variant="outline" 
                          className={medicine.prescriptionRequired ? 'border-red-500 text-red-600' : 'border-green-500 text-green-600'}
                        >
                          {medicine.type}
                        </Badge>
                      </div>

                      <div className="text-xs text-gray-500">
                        <p><strong>Category:</strong> {medicine.category}</p>
                        <p><strong>Manufacturer:</strong> {medicine.manufacturer}</p>
                        <p><strong>Stock:</strong> {medicine.inStock} available</p>
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => navigate(`/medicine/${medicine.id}`)}
                          className="flex-1"
                        >
                          View Details
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => addToCart(medicine)}
                          disabled={medicine.inStock === 0}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <ShoppingCart className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// Medicine Detail Page
const MedicineDetailPage = () => {
  const { medicineId } = useParams();
  const [medicine, setMedicine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMedicine = async () => {
      try {
        const response = await axios.get(`${API}/medicines/${medicineId}`);
        setMedicine(response.data);
      } catch (error) {
        console.error('Error fetching medicine:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMedicine();
  }, [medicineId]);

  const addToCart = async () => {
    try {
      const { user } = JSON.parse(localStorage.getItem('hospot_user') || '{}');
      if (!user) return;

      const cartItem = {
        medicineId: medicine.id,
        medicineName: medicine.name,
        price: medicine.price,
        quantity: quantity
      };

      await axios.post(`${API}/cart/${user.email}/add`, cartItem);
      alert(`${medicine.name} added to cart!`);
      navigate('/cart');
    } catch (error) {
      console.error('Error adding to cart:', error);
      alert('Failed to add to cart. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading medicine details...</p>
        </div>
      </div>
    );
  }

  if (!medicine) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Medicine Not Found</h2>
          <Button onClick={() => navigate('/medicines')}>Back to Medicines</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showHomeButton={true} />

      <main className="container mx-auto px-4 py-8">
        <Button 
          variant="outline" 
          onClick={() => navigate('/medicines')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Medicines
        </Button>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Image Section */}
          <div className="space-y-4">
            {medicine.imageUrl && (
              <div className="aspect-square bg-white rounded-lg p-8 shadow-sm">
                <img 
                  src={medicine.imageUrl} 
                  alt={medicine.name}
                  className="w-full h-full object-contain"
                />
              </div>
            )}
          </div>

          {/* Details Section */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{medicine.name}</h1>
              <p className="text-gray-600 text-lg">{medicine.description}</p>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-blue-600">${medicine.price}</span>
              <Badge 
                variant="outline" 
                className={medicine.prescriptionRequired ? 'border-red-500 text-red-600' : 'border-green-500 text-green-600'}
              >
                {medicine.type}
              </Badge>
            </div>

            {/* Medicine Info */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Medicine Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div><strong>Category:</strong> {medicine.category}</div>
                  <div><strong>Manufacturer:</strong> {medicine.manufacturer}</div>
                  <div><strong>Dosage:</strong> {medicine.dosage}</div>
                  <div><strong>Stock:</strong> {medicine.inStock} available</div>
                  <div><strong>Expiry:</strong> {medicine.expiryDate}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Active Ingredients</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1">
                    {medicine.activeIngredients.map((ingredient, index) => (
                      <li key={index} className="text-sm">{ingredient}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Usage Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Usage Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700">{medicine.usage}</p>
              </CardContent>
            </Card>

            {/* Side Effects */}
            {medicine.sideEffects.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg text-yellow-700">Possible Side Effects</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1">
                    {medicine.sideEffects.map((effect, index) => (
                      <li key={index} className="text-sm text-yellow-700">{effect}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Warnings */}
            {medicine.warnings.length > 0 && (
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="text-lg text-red-700">Warnings</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1">
                    {medicine.warnings.map((warning, index) => (
                      <li key={index} className="text-sm text-red-700">{warning}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Add to Cart */}
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <label className="font-medium">Quantity:</label>
                  <div className="flex items-center space-x-3">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    >
                      -
                    </Button>
                    <span className="w-12 text-center">{quantity}</span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setQuantity(Math.min(medicine.inStock, quantity + 1))}
                    >
                      +
                    </Button>
                  </div>
                </div>
                
                <Button 
                  onClick={addToCart}
                  disabled={medicine.inStock === 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
                >
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  Add to Cart - ${(medicine.price * quantity).toFixed(2)}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

// Main App Component
function App() {
  return (
    <AuthProvider>
      <div className="App">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/home" element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            } />
            <Route path="/hospital/:hospitalId" element={
              <ProtectedRoute>
                <HospitalProgressPage />
              </ProtectedRoute>
            } />
            <Route path="/medicines" element={
              <ProtectedRoute>
                <MedicinesPage />
              </ProtectedRoute>
            } />
            <Route path="/medicine/:medicineId" element={
              <ProtectedRoute>
                <MedicineDetailPage />
              </ProtectedRoute>
            } />
            <Route path="/prescriptions" element={
              <ProtectedRoute>
                <PrescriptionsPage />
              </ProtectedRoute>
            } />
            <Route path="/cart" element={
              <ProtectedRoute>
                <CartPage />
              </ProtectedRoute>
            } />
            <Route path="/orders" element={
              <ProtectedRoute>
                <OrdersPage />
              </ProtectedRoute>
            } />
            <Route path="/medicines" element={
              <ProtectedRoute>
                <MedicinesPage />
              </ProtectedRoute>
            } />
            <Route path="/medicine/:medicineId" element={
              <ProtectedRoute>
                <MedicineDetailPage />
              </ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
      </div>
    </AuthProvider>
  );
}

export default App;