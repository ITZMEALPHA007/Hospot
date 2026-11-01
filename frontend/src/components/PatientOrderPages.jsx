import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, ArrowRight, Minus, Package, Plus, RefreshCw, ShoppingBag, Trash2, XCircle } from "lucide-react";
import { API, ensureCsrf } from "../lib/authClient";
import MedicineProductImage from "./MedicineProductImage";
import "./patient-orders.css";

function formatInr(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Price unavailable";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function errorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((entry) => entry?.msg).filter(Boolean).join(" ") || fallback;
  return fallback;
}

function PageHeader({ eyebrow, title, description, children }) {
  return <header className="patient-orders-intro"><div><span className="dashboard-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>{children}</header>;
}

function LoadingState({ children = "Loading…" }) {
  return <div className="patient-orders-state" role="status"><span className="medicine-spinner" aria-hidden="true" />{children}</div>;
}

function ErrorState({ message, onRetry }) {
  return <div className="patient-orders-state patient-orders-error" role="alert"><XCircle size={21} aria-hidden="true" /><div><strong>We couldn’t load this information.</strong><p>{message}</p><button className="patient-orders-secondary" type="button" onClick={onRetry}><RefreshCw size={14} /> Try again</button></div></div>;
}

export function PatientCartPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [busyMedicine, setBusyMedicine] = useState(null);

  const loadCart = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(`${API}/cart`);
      setCart(response.data);
    } catch (requestError) {
      setError(errorMessage(requestError, "Your cart is temporarily unavailable."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCart(); }, [loadCart]);

  const mutateItem = async (item, action, quantity) => {
    if (busyMedicine) return;
    setBusyMedicine(item.medicineId);
    setFeedback(null);
    try {
      await ensureCsrf();
      if (action === "remove") {
        await axios.delete(`${API}/cart/remove/${encodeURIComponent(item.medicineId)}`);
      } else {
        await axios.put(`${API}/cart/update`, null, { params: { medicine_id: item.medicineId, quantity } });
      }
      await loadCart();
      setFeedback({ type: "success", text: action === "remove" ? `${item.medicineName} was removed from your cart.` : "Cart quantity updated." });
    } catch (requestError) {
      setFeedback({ type: "error", text: errorMessage(requestError, "Your cart could not be updated. Please try again.") });
    } finally {
      setBusyMedicine(null);
    }
  };

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const subtotal = Number.isFinite(Number(cart?.totalAmount)) ? Number(cart.totalAmount) : items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);

  return (
    <div className="patient-orders-page">
      <PageHeader eyebrow="Your selection" title="Your cart" description="Review your medicines and quantities before continuing to checkout.">
        <Link className="patient-orders-secondary" to="/dashboard/patient/medicines"><ArrowLeft size={15} /> Continue shopping</Link>
      </PageHeader>
      {feedback && <p className={`patient-orders-feedback ${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.text}</p>}
      {loading ? <LoadingState>Loading your cart…</LoadingState> : error ? <ErrorState message={error} onRetry={loadCart} /> : items.length === 0 ? (
        <section className="patient-orders-empty"><span><ShoppingBag size={23} /></span><h3>Your cart is empty</h3><p>Medicines you add from the catalogue will appear here.</p><Link className="patient-orders-primary" to="/dashboard/patient/medicines">Browse medicines <ArrowRight size={15} /></Link></section>
      ) : (
        <div className="patient-cart-layout">
          <section className="patient-cart-items" aria-label="Cart items">
            {items.map((item) => {
              const pending = busyMedicine === item.medicineId;
              const lineTotal = Number(item.price) * Number(item.quantity);
              return <article className="patient-cart-item" key={item.medicineId}>
                <div className="patient-cart-image"><MedicineProductImage medicine={{ name: item.medicineName, imageUrl: null }} /></div>
                <div className="patient-cart-item-info">
                  <h3>{item.medicineName}</h3><p>{formatInr(item.price)} <span>per item</span></p>
                  {item.prescriptionId && <span className="patient-cart-rx">Prescription reference attached</span>}
                  <div className="patient-cart-controls" aria-label={`Quantity controls for ${item.medicineName}`}>
                    <button type="button" aria-label={`Decrease ${item.medicineName} quantity`} disabled={pending || Number(item.quantity) <= 1} onClick={() => mutateItem(item, "update", Number(item.quantity) - 1)}><Minus size={14} /></button>
                    <span aria-live="polite">{item.quantity}</span>
                    <button type="button" aria-label={`Increase ${item.medicineName} quantity`} disabled={pending || Number(item.quantity) >= 1000} onClick={() => mutateItem(item, "update", Number(item.quantity) + 1)}><Plus size={14} /></button>
                    {pending && <span className="patient-cart-saving">Saving…</span>}
                  </div>
                </div>
                <div className="patient-cart-line-total"><strong>{formatInr(lineTotal)}</strong><button type="button" className="patient-cart-remove" disabled={pending} onClick={() => mutateItem(item, "remove")}><Trash2 size={14} /> Remove</button></div>
              </article>;
            })}
          </section>
          <aside className="patient-cart-summary">
            <span className="dashboard-eyebrow">Order summary</span><h3>Subtotal</h3>
            <div className="patient-cart-summary-line"><span>Items subtotal</span><strong>{formatInr(subtotal)}</strong></div>
            <p className="patient-cart-fee-note">Any delivery fee or pickup details are shown during checkout when you choose fulfilment.</p>
            <div className="patient-cart-summary-total"><span>Subtotal</span><strong>{formatInr(subtotal)}</strong></div>
            <button className="patient-orders-primary patient-checkout-button" type="button" onClick={() => navigate("/checkout")} disabled={Boolean(busyMedicine)}>Proceed to checkout <ArrowRight size={15} /></button>
            <p className="patient-cart-summary-note">Prices and availability are checked again by the server at checkout.</p>
          </aside>
        </div>
      )}
    </div>
  );
}

function statusLabel(status = "") {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Status unavailable";
}

function orderDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(parsed) : "Date unavailable";
}

function OrderCard({ order, onOpen }) {
  const items = Array.isArray(order.items) ? order.items : [];
  const method = order.fulfillmentMethod === "PICKUP" ? "Pickup" : order.fulfillmentMethod === "HOME_DELIVERY" ? "Home delivery" : "Fulfilment method unavailable";
  return <article className="patient-order-card">
    <div className="patient-order-heading"><div><span className="dashboard-eyebrow">Order reference</span><h3>#{String(order.id || "").slice(-8).toUpperCase() || "Unavailable"}</h3><p>{orderDate(order.orderDate)}</p></div><span className={`patient-order-status status-${String(order.status || "unknown").toLowerCase()}`}>{statusLabel(order.status)}</span></div>
    <div className="patient-order-items">{items.map((item, index) => <div className="patient-order-line" key={`${item.medicineId}-${index}`}><span>{item.medicineName} <small>× {item.quantity}</small></span><strong>{formatInr(Number(item.price) * Number(item.quantity))}</strong></div>)}</div>
    <div className="patient-order-footer"><div className="patient-order-meta"><span><Package size={14} /> {method}</span><strong>{formatInr(order.totalAmount)}</strong></div>{onOpen && <button className="patient-orders-secondary" type="button" onClick={() => onOpen(order.id)}>Order details <ArrowRight size={14} /></button>}</div>
  </article>;
}

export function PatientOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadOrders = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await axios.get(`${API}/orders`);
      setOrders(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setError(errorMessage(requestError, "Your orders are temporarily unavailable."));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadOrders(); }, [loadOrders]);

  return <div className="patient-orders-page">
    <PageHeader eyebrow="Your purchases" title="My orders" description="Review your order items, fulfilment method and current status." />
    {loading ? <LoadingState>Loading your orders…</LoadingState> : error ? <ErrorState message={error} onRetry={loadOrders} /> : orders.length === 0 ? (
      <section className="patient-orders-empty"><span><Package size={23} /></span><h3>No orders yet</h3><p>Orders you place will appear here with their current status.</p><Link className="patient-orders-primary" to="/dashboard/patient/medicines">Explore medicines <ArrowRight size={15} /></Link></section>
    ) : <div className="patient-order-list">{orders.map((order) => <OrderCard key={order.id} order={order} onOpen={(id) => navigate(`/orders/${encodeURIComponent(id)}`)} />)}</div>}
  </div>;
}

export function PatientOrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadOrder = useCallback(async () => {
    setLoading(true); setError("");
    try { setOrder((await axios.get(`${API}/orders/${encodeURIComponent(orderId)}`)).data); }
    catch (requestError) { setError(errorMessage(requestError, "This order could not be loaded.")); }
    finally { setLoading(false); }
  }, [orderId]);
  useEffect(() => { loadOrder(); }, [loadOrder]);
  return <div className="patient-orders-page">
    <button type="button" className="patient-orders-back" onClick={() => navigate("/orders")}><ArrowLeft size={15} /> Back to my orders</button>
    {loading ? <LoadingState>Loading order details…</LoadingState> : error ? <ErrorState message={error} onRetry={loadOrder} /> : order && <><PageHeader eyebrow="Order details" title={`Order #${String(order.id).slice(-8).toUpperCase()}`} description={`${orderDate(order.orderDate)} · ${statusLabel(order.status)}`} /><OrderCard order={order} /><div className="patient-order-detail-note">Order information is shown as recorded by Hospot. No courier tracking or payment status is available here.</div></>}
  </div>;
}

export { formatInr };
