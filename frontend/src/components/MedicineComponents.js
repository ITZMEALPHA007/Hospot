import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Search, ShoppingCart, ArrowLeft, Upload, FileText, Trash2, Plus, Minus, Package, CreditCard, Truck, Activity, Bed, Pill, Home } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Bottom Navigation Component
const BottomNavBar = () => {
  const navigate = useNavigate();
  const location = window.location;
  const currentPath = location.pathname;

  const navItems = [
    { path: '/home', icon: Home, label: 'Hospitals', color: 'text-blue-600' },
    { path: '/medicines', icon: Pill, label: 'Medicines', color: 'text-green-600' },
    { path: '/prescriptions', icon: FileText, label: 'Prescriptions', color: 'text-purple-600' },
    { path: '/cart', icon: ShoppingCart, label: 'Cart', color: 'text-orange-600' },
    { path: '/orders', icon: Package, label: 'Orders', color: 'text-red-600' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-pb">
      <div className="grid grid-cols-5 py-2">
        {navItems.map((item, index) => {
          const IconComponent = item.icon;
          const isActive = currentPath === item.path;
          
          return (
            <button
              key={index}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center py-2 px-1 transition-all duration-200 ${
                isActive 
                  ? `${item.color} bg-gray-50` 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <IconComponent 
                className={`h-5 w-5 mb-1 ${isActive ? 'scale-110' : ''} transition-transform duration-200`} 
              />
              <span className={`text-xs font-medium ${isActive ? 'font-semibold' : ''}`}>
                {item.label}
              </span>
              {isActive && (
                <div className={`absolute top-0 left-1/2 transform -translate-x-1/2 w-8 h-1 ${item.color.replace('text-', 'bg-')} rounded-b-full`}></div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Header Component (simplified version for medicine components)
const Header = () => {
  const navigate = useNavigate();
  
  const handleLogout = () => {
    localStorage.removeItem('hospot_user');
    navigate('/');
  };

  const savedUser = localStorage.getItem('hospot_user');
  const user = savedUser ? JSON.parse(savedUser) : null;

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

        {/* Navigation Menu - Only Hospitals for desktop */}
        <nav className="hidden md:flex items-center space-x-6">
          <Button 
            variant="ghost"
            onClick={() => navigate('/home')}
            className="text-gray-700 hover:text-blue-600"
          >
            <Bed className="h-4 w-4 mr-2" />
            Hospitals
          </Button>
        </nav>
        
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-600 hidden sm:block">Welcome, {user?.name}</span>
          <Button 
            onClick={handleLogout}
            variant="outline"
            className="text-gray-600"
          >
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
};

// Sample Medicine Data
const sampleMedicines = [
  {
    id: 'med-1',
    name: 'Paracetamol 500mg',
    category: 'Pain Relief',
    type: 'Tablet',
    price: 12.99,
    dosage: '500mg',
    description: 'Effective pain relief and fever reducer. Suitable for adults and children over 12 years.',
    prescriptionRequired: false,
    inStock: true,
    manufacturer: 'HealthCorp'
  },
  {
    id: 'med-2',
    name: 'Amoxicillin 250mg',
    category: 'Antibiotics',
    type: 'Capsule',
    price: 24.50,
    dosage: '250mg',
    description: 'Broad-spectrum antibiotic for bacterial infections. Complete the full course as prescribed.',
    prescriptionRequired: true,
    inStock: true,
    manufacturer: 'MediPharm'
  },
  {
    id: 'med-3',
    name: 'Ibuprofen 400mg',
    category: 'Anti-inflammatory',
    type: 'Tablet',
    price: 18.75,
    dosage: '400mg',
    description: 'Non-steroidal anti-inflammatory drug (NSAID) for pain, inflammation, and fever.',
    prescriptionRequired: false,
    inStock: true,
    manufacturer: 'PharmaCare'
  },
  {
    id: 'med-4',
    name: 'Lisinopril 10mg',
    category: 'Blood Pressure',
    type: 'Tablet',
    price: 32.00,
    dosage: '10mg',
    description: 'ACE inhibitor for high blood pressure and heart failure management.',
    prescriptionRequired: true,
    inStock: true,
    manufacturer: 'CardioMed'
  },
  {
    id: 'med-5',
    name: 'Cetirizine 10mg',
    category: 'Allergy',
    type: 'Tablet',
    price: 15.25,
    dosage: '10mg',
    description: '24-hour allergy relief. Non-drowsy antihistamine for seasonal allergies.',
    prescriptionRequired: false,
    inStock: true,
    manufacturer: 'AllergyFree'
  },
  {
    id: 'med-6',
    name: 'Omeprazole 20mg',
    category: 'Gastric',
    type: 'Capsule',
    price: 28.99,
    dosage: '20mg',
    description: 'Proton pump inhibitor for acid reflux and stomach ulcers.',
    prescriptionRequired: true,
    inStock: false,
    manufacturer: 'GastroHealth'
  }
];

// Medicine Cards Component
const MedicineCards = () => {
  const navigate = useNavigate();

  const addToCart = async (medicine) => {
    try {
      const savedUser = localStorage.getItem('hospot_user');
      if (!savedUser) {
        alert('Please login to add items to cart');
        return;
      }

      const { user } = JSON.parse(savedUser);
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
    <div className="min-h-screen bg-gray-50 pb-16">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Popular Medicines</h2>
          <p className="text-gray-600 mb-6">Browse our most popular medicines with competitive prices</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sampleMedicines.map((medicine) => (
            <Card key={medicine.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{medicine.name}</h3>
                    <p className="text-sm text-gray-600 mb-2">{medicine.category}</p>
                    <Badge 
                      variant={medicine.prescriptionRequired ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {medicine.prescriptionRequired ? "Prescription Required" : "Over-the-Counter"}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-blue-600">${medicine.price}</div>
                    <div className="text-xs text-gray-500">{medicine.dosage}</div>
                  </div>
                </div>
                
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{medicine.description}</p>
                
                <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs mb-4 ${
                  medicine.inStock 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {medicine.inStock ? 'In Stock' : 'Out of Stock'}
                </div>
                
                <div className="flex gap-2">
                  <Button
                    onClick={() => navigate(`/medicine/${medicine.id}`)}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    View Details
                  </Button>
                  <Button
                    onClick={() => addToCart(medicine)}
                    disabled={!medicine.inStock}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white px-4"
                  >
                    <ShoppingCart className="h-4 w-4 mr-1" />
                    ${medicine.price}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-8">
          <Button 
            onClick={() => navigate('/medicines')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
          >
            View All Medicines
          </Button>
        </div>
      </main>
      
      <BottomNavBar />
    </div>
  );
};

// Prescriptions Page Component
export const PrescriptionsPage = () => {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const navigate = useNavigate();

  const fetchPrescriptions = async () => {
    setLoading(true);
    try {
      const savedUser = localStorage.getItem('hospot_user');
      if (!savedUser) return;
      
      const { user } = JSON.parse(savedUser);
      const response = await axios.get(`${API}/prescriptions/user/${user.email}`);
      setPrescriptions(response.data);
    } catch (error) {
      console.error('Error fetching prescriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrescriptions();
  }, []);

  const orderFromPrescription = (prescription) => {
    // Navigate to medicines page with prescription context
    navigate('/medicines', { state: { prescriptionId: prescription.id, medicines: prescription.medicines } });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">My Prescriptions</h2>
            <p className="text-gray-600">Store and manage your medical prescriptions</p>
          </div>
          <Button 
            onClick={() => setShowUploadForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Upload className="h-4 w-4 mr-2" />
            Add Prescription
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading prescriptions...</p>
          </div>
        ) : prescriptions.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No prescriptions found.</p>
            <Button 
              onClick={() => setShowUploadForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Add Your First Prescription
            </Button>
          </div>
        ) : (
          <div className="grid gap-6">
            {prescriptions.map((prescription) => (
              <Card key={prescription.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        Dr. {prescription.doctorName}
                      </h3>
                      <p className="text-gray-600">{prescription.hospitalName}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(prescription.prescriptionDate).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={prescription.isUsed ? "secondary" : "outline"}>
                      {prescription.isUsed ? "Used" : "Active"}
                    </Badge>
                  </div>

                  <div className="space-y-3 mb-4">
                    <h4 className="font-medium text-gray-900">Prescribed Medicines:</h4>
                    {prescription.medicines.map((med, index) => (
                      <div key={index} className="bg-gray-50 p-3 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{med.medicineName}</p>
                            <p className="text-sm text-gray-600">Dosage: {med.dosage}</p>
                            <p className="text-sm text-gray-600">Duration: {med.duration}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {prescription.notes && (
                    <div className="mb-4">
                      <h4 className="font-medium text-gray-900 mb-2">Notes:</h4>
                      <p className="text-gray-700 text-sm bg-yellow-50 p-3 rounded-lg">
                        {prescription.notes}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button 
                      onClick={() => orderFromPrescription(prescription)}
                      disabled={prescription.isUsed}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Order Medicines
                    </Button>
                    {prescription.imageUrl && (
                      <Button 
                        variant="outline"
                        onClick={() => window.open(prescription.imageUrl, '_blank')}
                      >
                        View Image
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Upload Form Modal */}
        <PrescriptionUploadForm 
          isOpen={showUploadForm}
          onClose={() => setShowUploadForm(false)}
          onSuccess={fetchPrescriptions}
        />
      </div>
      
      <BottomNavBar />
    </div>
  );
};

// Prescription Upload Form Component
const PrescriptionUploadForm = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    doctorName: '',
    hospitalName: '',
    prescriptionDate: '',
    medicines: [{ medicineName: '', dosage: '', duration: '' }],
    notes: '',
    imageUrl: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleMedicineChange = (index, field, value) => {
    const newMedicines = [...formData.medicines];
    newMedicines[index][field] = value;
    setFormData(prev => ({ ...prev, medicines: newMedicines }));
  };

  const addMedicine = () => {
    setFormData(prev => ({
      ...prev,
      medicines: [...prev.medicines, { medicineName: '', dosage: '', duration: '' }]
    }));
  };

  const removeMedicine = (index) => {
    if (formData.medicines.length > 1) {
      const newMedicines = formData.medicines.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, medicines: newMedicines }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const savedUser = localStorage.getItem('hospot_user');
      if (!savedUser) return;
      
      const { user } = JSON.parse(savedUser);
      
      const prescriptionData = {
        ...formData,
        userId: user.email,
        prescriptionDate: new Date(formData.prescriptionDate),
        medicines: formData.medicines.map(med => ({
          ...med,
          medicineId: '', // This would be populated if linking to medicine catalog
        }))
      };

      await axios.post(`${API}/prescriptions`, prescriptionData);
      alert('Prescription uploaded successfully!');
      onSuccess();
      onClose();
      
      // Reset form
      setFormData({
        doctorName: '',
        hospitalName: '',
        prescriptionDate: '',
        medicines: [{ medicineName: '', dosage: '', duration: '' }],
        notes: '',
        imageUrl: ''
      });
    } catch (error) {
      console.error('Error uploading prescription:', error);
      alert('Failed to upload prescription. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Prescription</DialogTitle>
          <DialogDescription>
            Upload your prescription details to order medicines easily
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Doctor Name *</label>
              <Input
                value={formData.doctorName}
                onChange={(e) => handleInputChange('doctorName', e.target.value)}
                placeholder="Dr. John Smith"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Hospital Name *</label>
              <Input
                value={formData.hospitalName}
                onChange={(e) => handleInputChange('hospitalName', e.target.value)}
                placeholder="City General Hospital"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Prescription Date *</label>
            <Input
              type="date"
              value={formData.prescriptionDate}
              onChange={(e) => handleInputChange('prescriptionDate', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-3 block">Medicines *</label>
            <div className="space-y-4">
              {formData.medicines.map((medicine, index) => (
                <div key={index} className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid md:grid-cols-3 gap-3">
                    <Input
                      placeholder="Medicine Name"
                      value={medicine.medicineName}
                      onChange={(e) => handleMedicineChange(index, 'medicineName', e.target.value)}
                      required
                    />
                    <Input
                      placeholder="Dosage (e.g., 500mg)"
                      value={medicine.dosage}
                      onChange={(e) => handleMedicineChange(index, 'dosage', e.target.value)}
                      required
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Duration (e.g., 7 days)"
                        value={medicine.duration}
                        onChange={(e) => handleMedicineChange(index, 'duration', e.target.value)}
                        required
                      />
                      {formData.medicines.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeMedicine(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addMedicine}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Another Medicine
              </Button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Any additional instructions or notes..."
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Prescription Image URL</label>
            <Input
              type="url"
              value={formData.imageUrl}
              onChange={(e) => handleInputChange('imageUrl', e.target.value)}
              placeholder="https://example.com/prescription.jpg"
            />
          </div>

          <div className="flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? 'Uploading...' : 'Upload Prescription'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Cart Page Component
export const CartPage = () => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchCart = async () => {
    setLoading(true);
    try {
      const savedUser = localStorage.getItem('hospot_user');
      if (!savedUser) return;
      
      const { user } = JSON.parse(savedUser);
      const response = await axios.get(`${API}/cart/${user.email}`);
      setCart(response.data);
    } catch (error) {
      console.error('Error fetching cart:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const updateQuantity = async (medicineId, newQuantity) => {
    if (newQuantity < 1) {
      removeItem(medicineId);
      return;
    }

    try {
      const savedUser = localStorage.getItem('hospot_user');
      if (!savedUser) return;
      
      const { user } = JSON.parse(savedUser);
      await axios.put(`${API}/cart/${user.email}/update`, {
        medicineId,
        quantity: newQuantity
      });
      fetchCart();
    } catch (error) {
      console.error('Error updating quantity:', error);
    }
  };

  const removeItem = async (medicineId) => {
    try {
      const savedUser = localStorage.getItem('hospot_user');
      if (!savedUser) return;
      
      const { user } = JSON.parse(savedUser);
      await axios.delete(`${API}/cart/${user.email}/remove/${medicineId}`);
      fetchCart();
    } catch (error) {
      console.error('Error removing item:', error);
    }
  };

  const clearCart = async () => {
    try {
      const savedUser = localStorage.getItem('hospot_user');
      if (!savedUser) return;
      
      const { user } = JSON.parse(savedUser);
      await axios.delete(`${API}/cart/${user.email}/clear`);
      fetchCart();
    } catch (error) {
      console.error('Error clearing cart:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pb-16 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading cart...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Shopping Cart</h2>
            <p className="text-gray-600">Review your medicines before checkout</p>
          </div>
          {cart && cart.items.length > 0 && (
            <Button 
              variant="outline"
              onClick={clearCart}
              className="text-red-600 border-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Cart
            </Button>
          )}
        </div>

        {!cart || cart.items.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">Your cart is empty</p>
            <Button 
              onClick={() => navigate('/medicines')}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Browse Medicines
            </Button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {cart.items.map((item) => (
                <Card key={item.medicineId}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {item.medicineName}
                        </h3>
                        <p className="text-blue-600 font-semibold text-lg">
                          ${item.price.toFixed(2)} each
                        </p>
                        {item.prescriptionId && (
                          <Badge className="mt-2 bg-green-100 text-green-800">
                            Prescription Item
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => updateQuantity(item.medicineId, item.quantity - 1)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-12 text-center font-medium">{item.quantity}</span>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => updateQuantity(item.medicineId, item.quantity + 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        <div className="text-right">
                          <p className="font-semibold text-lg">
                            ${(item.price * item.quantity).toFixed(2)}
                          </p>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => removeItem(item.medicineId)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Cart Summary */}
            <div>
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Subtotal ({cart.items.length} items)</span>
                    <span className="font-semibold">${cart.totalAmount.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span>Delivery Fee</span>
                    <span className="font-semibold">$5.99</span>
                  </div>
                  
                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center text-lg font-bold">
                      <span>Total</span>
                      <span>${(cart.totalAmount + 5.99).toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={() => navigate('/checkout')}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
                  >
                    <CreditCard className="h-5 w-5 mr-2" />
                    Proceed to Checkout
                  </Button>
                  
                  <Button 
                    variant="outline"
                    onClick={() => navigate('/medicines')}
                    className="w-full"
                  >
                    Continue Shopping
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
      
      <BottomNavBar />
    </div>
  );
};

// Checkout Page Component
export const CheckoutPage = () => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(false);
  const [orderData, setOrderData] = useState({
    deliveryAddress: '',
    contactNumber: '',
    paymentMethod: 'cash_on_delivery',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const fetchCart = async () => {
    setLoading(true);
    try {
      const savedUser = localStorage.getItem('hospot_user');
      if (!savedUser) return;
      
      const { user } = JSON.parse(savedUser);
      const response = await axios.get(`${API}/cart/${user.email}`);
      setCart(response.data);
    } catch (error) {
      console.error('Error fetching cart:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const handleInputChange = (field, value) => {
    setOrderData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const savedUser = localStorage.getItem('hospot_user');
      if (!savedUser) return;
      
      const { user } = JSON.parse(savedUser);
      
      const order = {
        userId: user.email,
        items: cart.items.map(item => ({
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          price: item.price,
          quantity: item.quantity,
          prescriptionId: item.prescriptionId || null
        })),
        totalAmount: cart.totalAmount + 5.99, // Including delivery fee
        deliveryAddress: orderData.deliveryAddress,
        contactNumber: orderData.contactNumber,
        paymentMethod: orderData.paymentMethod,
        notes: orderData.notes,
        prescriptionIds: cart.items
          .filter(item => item.prescriptionId)
          .map(item => item.prescriptionId)
      };

      const response = await axios.post(`${API}/orders`, order);
      
      alert('Order placed successfully! You will receive a confirmation call shortly.');
      navigate('/orders');
      
    } catch (error) {
      console.error('Error placing order:', error);
      alert('Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pb-16 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading checkout...</p>
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 pb-16 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Your cart is empty</h2>
          <Button onClick={() => navigate('/medicines')}>Browse Medicines</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Checkout</h2>
          <p className="text-gray-600">Complete your medicine order</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Order Form */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Delivery Information</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Delivery Address *</label>
                    <Textarea
                      value={orderData.deliveryAddress}
                      onChange={(e) => handleInputChange('deliveryAddress', e.target.value)}
                      placeholder="Enter your complete delivery address..."
                      rows={3}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Contact Number *</label>
                    <Input
                      type="tel"
                      value={orderData.contactNumber}
                      onChange={(e) => handleInputChange('contactNumber', e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Payment Method *</label>
                    <Select value={orderData.paymentMethod} onValueChange={(value) => handleInputChange('paymentMethod', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash_on_delivery">Cash on Delivery</SelectItem>
                        <SelectItem value="credit_card">Credit Card</SelectItem>
                        <SelectItem value="digital_wallet">Digital Wallet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Special Instructions</label>
                    <Textarea
                      value={orderData.notes}
                      onChange={(e) => handleInputChange('notes', e.target.value)}
                      placeholder="Any special delivery instructions..."
                      rows={2}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
                  >
                    {isSubmitting ? 'Placing Order...' : 'Place Order'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Order Summary */}
          <div>
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {cart.items.map((item) => (
                    <div key={item.medicineId} className="flex justify-between items-center py-2 border-b">
                      <div>
                        <p className="font-medium">{item.medicineName}</p>
                        <p className="text-sm text-gray-600">Qty: {item.quantity} × ${item.price.toFixed(2)}</p>
                      </div>
                      <p className="font-semibold">${(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  ))}
                  
                  <div className="space-y-2 pt-4">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>${cart.totalAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Delivery Fee</span>
                      <span>$5.99</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg border-t pt-2">
                      <span>Total</span>
                      <span>${(cart.totalAmount + 5.99).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      <BottomNavBar />
    </div>
  );
};

// Orders Page Component
export const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const savedUser = localStorage.getItem('hospot_user');
      if (!savedUser) return;
      
      const { user } = JSON.parse(savedUser);
      const response = await axios.get(`${API}/orders/user/${user.email}`);
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'preparing': return 'bg-orange-100 text-orange-800';
      case 'shipped': return 'bg-purple-100 text-purple-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">My Orders</h2>
          <p className="text-gray-600">Track and manage your medicine orders</p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No orders found.</p>
            <Button 
              onClick={() => navigate('/medicines')}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Start Shopping
            </Button>
          </div>
        ) : (
          <div className="grid gap-6">
            {orders.map((order) => (
              <Card key={order.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        Order #{order.id.slice(-8)}
                      </h3>
                      <p className="text-gray-600">
                        {new Date(order.orderDate).toLocaleDateString()} • {order.items.length} items
                      </p>
                    </div>
                    <Badge className={getStatusColor(order.status)}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Badge>
                  </div>

                  <div className="space-y-3 mb-4">
                    <h4 className="font-medium text-gray-900">Items:</h4>
                    {order.items.map((item, index) => (
                      <div key={index} className="bg-gray-50 p-3 rounded-lg flex justify-between items-center">
                        <div>
                          <p className="font-medium">{item.medicineName}</p>
                          <p className="text-sm text-gray-600">Qty: {item.quantity} × ${item.price.toFixed(2)}</p>
                        </div>
                        <p className="font-semibold">${(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t">
                    <div>
                      <p className="text-sm text-gray-600">Total Amount</p>
                      <p className="text-lg font-bold text-blue-600">${order.totalAmount.toFixed(2)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline"
                        onClick={() => navigate(`/order/${order.id}`)}
                      >
                        View Details
                      </Button>
                      {order.status === 'delivered' && (
                        <Button 
                          onClick={() => navigate('/medicines')}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          Reorder
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      
      <BottomNavBar />
    </div>
  );
};

// Export the MedicineCards component
export { MedicineCards };