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
import { Search, ShoppingCart, ArrowLeft, Upload, FileText, Trash2, Plus, Minus, Package, CreditCard, Truck, Activity, Bed, Pill } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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

        {/* Navigation Menu */}
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
    <div className="min-h-screen bg-gray-50">
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
          <DialogTitle>Upload Prescription</DialogTitle>
          <DialogDescription>
            Add a new prescription to your records
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
              max={new Date().toISOString().split('T')[0]}
              required
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-medium text-gray-700">Prescribed Medicines *</label>
              <Button type="button" variant="outline" size="sm" onClick={addMedicine}>
                <Plus className="h-4 w-4 mr-1" />
                Add Medicine
              </Button>
            </div>
            
            {formData.medicines.map((medicine, index) => (
              <div key={index} className="border rounded-lg p-4 mb-3">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium">Medicine {index + 1}</h4>
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
                
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Medicine Name</label>
                    <Input
                      value={medicine.medicineName}
                      onChange={(e) => handleMedicineChange(index, 'medicineName', e.target.value)}
                      placeholder="Paracetamol 500mg"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Dosage</label>
                    <Input
                      value={medicine.dosage}
                      onChange={(e) => handleMedicineChange(index, 'dosage', e.target.value)}
                      placeholder="1 tablet twice daily"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Duration</label>
                    <Input
                      value={medicine.duration}
                      onChange={(e) => handleMedicineChange(index, 'duration', e.target.value)}
                      placeholder="7 days"
                      required
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Additional Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Any additional instructions or notes..."
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Prescription Image URL (Optional)</label>
            <Input
              value={formData.imageUrl}
              onChange={(e) => handleInputChange('imageUrl', e.target.value)}
              placeholder="https://example.com/prescription-image.jpg"
            />
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
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

// Shopping Cart Page Component
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
    try {
      const savedUser = localStorage.getItem('hospot_user');
      if (!savedUser) return;
      
      const { user } = JSON.parse(savedUser);
      
      if (newQuantity <= 0) {
        await axios.delete(`${API}/cart/${user.email}/remove/${medicineId}`);
      } else {
        await axios.put(`${API}/cart/${user.email}/update?medicine_id=${medicineId}&quantity=${newQuantity}`);
      }
      
      fetchCart();
    } catch (error) {
      console.error('Error updating cart:', error);
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading cart...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading checkout...</p>
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Your cart is empty</h2>
          <Button onClick={() => navigate('/medicines')}>Browse Medicines</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
                      placeholder="Enter your complete delivery address"
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
                        <SelectItem value="cash_on_delivery">Cash on Delivery (COD)</SelectItem>
                        <SelectItem value="card">Credit/Debit Card (Mock)</SelectItem>
                        <SelectItem value="upi">UPI Payment (Mock)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Additional Notes</label>
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
            <Card>
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cart.items.map((item) => (
                  <div key={item.medicineId} className="flex justify-between items-center py-2 border-b">
                    <div>
                      <p className="font-medium">{item.medicineName}</p>
                      <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
                    </div>
                    <span className="font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
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
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total</span>
                    <span>${(cart.totalAmount + 5.99).toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

// Orders Page Component
export const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

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
      case 'preparing': return 'bg-purple-100 text-purple-800';
      case 'out_for_delivery': return 'bg-orange-100 text-orange-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'confirmed': return 'Confirmed';
      case 'preparing': return 'Preparing';
      case 'out_for_delivery': return 'Out for Delivery';
      case 'delivered': return 'Delivered';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">My Orders</h2>
          <p className="text-gray-600">Track your medicine orders</p>
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
          <div className="space-y-6">
            {orders.map((order) => (
              <Card key={order.id}>
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Order #{order.id.slice(-8)}</h3>
                      <p className="text-gray-600 text-sm">
                        Placed on {new Date(order.orderDate).toLocaleDateString()}
                      </p>
                      {order.estimatedDelivery && (
                        <p className="text-gray-600 text-sm">
                          Estimated delivery: {new Date(order.estimatedDelivery).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Badge className={getStatusColor(order.status)}>
                      {getStatusText(order.status)}
                    </Badge>
                  </div>

                  <div className="space-y-3 mb-4">
                    {order.items.map((item, index) => (
                      <div key={index} className="flex justify-between items-center py-2 border-b">
                        <div>
                          <p className="font-medium">{item.medicineName}</p>
                          <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                        </div>
                        <span className="font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t">
                    <div>
                      <p className="text-sm text-gray-600">Payment: {order.paymentMethod.replace('_', ' ')}</p>
                      <p className="text-sm text-gray-600">Delivery: {order.deliveryAddress}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">${order.totalAmount.toFixed(2)}</p>
                      <p className="text-sm text-gray-600">{order.items.length} items</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};