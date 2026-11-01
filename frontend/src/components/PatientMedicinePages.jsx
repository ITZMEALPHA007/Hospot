import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, ArrowRight, Check, PackageCheck, Pill, Search, ShoppingBag, ShoppingCart, ShieldCheck, XCircle } from "lucide-react";
import { API, ensureCsrf } from "../lib/authClient";
import MedicineProductImage from "./MedicineProductImage";
import "./patient-medicines.css";

function requestMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(" ") || fallback;
  return fallback;
}

function priceInr(price) {
  const value = Number(price);
  return Number.isFinite(value)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value)
    : "Price unavailable";
}

function stockLabel(medicine) {
  if (!Number.isFinite(medicine?.inStock)) return null;
  return medicine.inStock > 0 ? `${medicine.inStock} available` : "Currently unavailable";
}

function PageState({ kind, message, onRetry }) {
  if (kind === "loading") return <div className="medicine-state" role="status"><span className="medicine-spinner" aria-hidden="true" />{message}</div>;
  if (kind === "error") return <div className="medicine-state medicine-state-error" role="alert"><XCircle size={21} aria-hidden="true" /><div><strong>We couldn’t load this medicine information.</strong><p>{message}</p>{onRetry && <button type="button" className="medicine-secondary-button" onClick={onRetry}>Try again</button>}</div></div>;
  return <div className="medicine-state medicine-state-empty"><span className="medicine-state-icon"><Pill size={22} aria-hidden="true" /></span><h3>No medicines found</h3><p>{message}</p></div>;
}

function AddToCartFeedback({ feedback, onOpenCart }) {
  if (!feedback) return null;
  return (
    <div className={`medicine-feedback ${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>
      {feedback.type === "success" ? <Check size={17} aria-hidden="true" /> : <XCircle size={17} aria-hidden="true" />}
      <span>{feedback.message}</span>
      {feedback.type === "success" && <button type="button" onClick={onOpenCart}>View cart <ArrowRight size={14} aria-hidden="true" /></button>}
    </div>
  );
}

function MedicineCard({ medicine, onDetails }) {
  const availability = stockLabel(medicine);
  const outOfStock = Number.isFinite(medicine.inStock) && medicine.inStock <= 0;
  return (
    <article className="medicine-card">
      <button type="button" className="medicine-card-image" onClick={onDetails} aria-label={`View details for ${medicine.name}`}>
        <MedicineProductImage medicine={medicine} />
        {medicine.isDemo && <span className="medicine-demo-tag">Demo listing</span>}
      </button>
      <div className="medicine-card-body">
        <div className="medicine-card-meta"><span>{medicine.category}</span>{medicine.prescriptionRequired && <span className="medicine-rx-tag">Prescription required</span>}</div>
        <h3>{medicine.name}</h3>
        {medicine.manufacturer && <p className="medicine-manufacturer">{medicine.manufacturer}</p>}
        {medicine.description && <p className="medicine-description">{medicine.description}</p>}
        <div className="medicine-card-stock-row">
          {availability && <span className={`medicine-stock${outOfStock ? " unavailable" : ""}`}>{availability}</span>}
          {medicine.dosage && <span className="medicine-formulation">{medicine.dosage}</span>}
        </div>
        <div className="medicine-card-footer">
          <strong>{priceInr(medicine.price)}</strong>
          <button type="button" className="medicine-details-button" onClick={onDetails}>View Details</button>
        </div>
      </div>
    </article>
  );
}

export function MedicineCataloguePage() {
  const navigate = useNavigate();
  const [medicines, setMedicines] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoryError, setCategoryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMedicines = useCallback(async (search = "", selectedCategory = "") => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (search) params.search = search;
      if (selectedCategory) params.category = selectedCategory;
      const response = await axios.get(`${API}/medicines`, { params });
      setMedicines(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setError(requestMessage(requestError, "Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMedicines(); }, [loadMedicines]);

  useEffect(() => {
    let active = true;
    const loadCategories = async () => {
      try {
        const response = await axios.get(`${API}/medicines/categories`);
        if (active) setCategories(Array.isArray(response.data) ? response.data : []);
      } catch (requestError) {
        if (active) setCategoryError("Category filtering is temporarily unavailable. Search is still available.");
      }
    };
    loadCategories();
    return () => { active = false; };
  }, []);

  const submitSearch = (event) => {
    event.preventDefault();
    loadMedicines(query.trim(), category);
  };

  const changeCategory = (event) => {
    const selectedCategory = event.target.value;
    setCategory(selectedCategory);
    loadMedicines(query.trim(), selectedCategory);
  };

  const clearFilters = () => {
    setQuery("");
    setCategory("");
    loadMedicines();
  };

  return (
    <div className="medicine-page">
      <section className="medicine-intro">
        <span className="medicine-eyebrow"><Pill size={15} aria-hidden="true" /> Patient catalogue</span>
        <h2>Find the right essentials for your care</h2>
        <p>Search the active medicine catalogue. Product information, pricing and stock are supplied by Hospot.</p>
        <div className="medicine-intro-note"><ShieldCheck size={16} aria-hidden="true" /><span>Medicine details are for catalogue reference. Follow advice from your healthcare professional.</span></div>
      </section>

      <div className="medicine-catalogue-toolbar">
        <form className="medicine-search" onSubmit={submitSearch} role="search">
          <Search size={19} aria-hidden="true" />
          <label className="medicine-visually-hidden" htmlFor="medicine-search-input">Search medicines</label>
          <input id="medicine-search-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search medicines, descriptions or ingredients" maxLength={120} />
          {categories.length > 0 && <div className="medicine-category-filter"><label className="medicine-visually-hidden" htmlFor="medicine-category-filter">Filter by category</label><select id="medicine-category-filter" value={category} onChange={changeCategory}><option value="">All categories</option>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>}
          {(query || category) && <button type="button" className="medicine-clear-search" onClick={clearFilters} aria-label="Clear medicine search and filters">Clear</button>}
          <button type="submit" disabled={loading}>Search</button>
        </form>
        {categoryError ? <div className="medicine-catalogue-caption" role="status"><PackageCheck size={16} aria-hidden="true" /><span>{categoryError}</span></div> : <div className="medicine-catalogue-caption"><PackageCheck size={16} aria-hidden="true" /><span>Prices and availability reflect the current catalogue.</span></div>}
      </div>

      {loading ? <PageState kind="loading" message="Loading the medicine catalogue…" />
        : error ? <PageState kind="error" message={error} onRetry={() => loadMedicines(query.trim(), category)} />
          : medicines.length === 0 ? <PageState kind="empty" message={query.trim() || category ? "No medicines match the current search and category. Clear filters or try another search." : "There are no active medicines to display right now."} />
            : <section className="medicine-results" aria-label="Medicine catalogue results">
              <div className="medicine-results-heading"><div><span className="medicine-eyebrow">Catalogue</span><h3>{query.trim() ? "Search results" : "Browse medicines"}</h3></div><span>{medicines.length} {medicines.length === 1 ? "item" : "items"}</span></div>
              <div className="medicine-grid">
                {medicines.map((medicine) => <MedicineCard key={medicine.id} medicine={medicine} onDetails={() => navigate(`/dashboard/patient/medicines/${encodeURIComponent(medicine.id)}`)} />)}
              </div>
            </section>}
    </div>
  );
}

export function MedicineDetailPage() {
  const { medicineId } = useParams();
  const navigate = useNavigate();
  const [medicine, setMedicine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const submittingRef = useRef(false);

  const loadMedicine = useCallback(async () => {
    setLoading(true);
    setError("");
    setMedicine(null);
    try {
      const response = await axios.get(`${API}/medicines/${encodeURIComponent(medicineId)}`);
      setMedicine(response.data);
      setQuantity(1);
    } catch (requestError) {
      setError(requestError?.response?.status === 404
        ? "This medicine was not found or is no longer available."
        : requestMessage(requestError, "Medicine details could not be loaded. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [medicineId]);

  useEffect(() => { loadMedicine(); }, [loadMedicine]);

  const stockKnown = Number.isFinite(medicine?.inStock);
  const outOfStock = stockKnown && medicine.inStock <= 0;
  const setValidQuantity = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    const upperBound = stockKnown ? Math.max(0, medicine.inStock) : 1000;
    setQuantity(Math.min(upperBound, Math.max(1, parsed)));
    setFeedback(null);
  };

  const addToCart = async (event) => {
    event.preventDefault();
    if (submittingRef.current || !medicine || !Number.isInteger(quantity) || quantity < 1 || (stockKnown && quantity > medicine.inStock)) return;
    submittingRef.current = true;
    setSubmitting(true);
    setFeedback(null);
    try {
      await ensureCsrf();
      await axios.post(`${API}/cart/add`, { medicineId: medicine.id, quantity });
      setFeedback({ type: "success", message: `${medicine.name} was added to your cart.` });
    } catch (requestError) {
      setFeedback({ type: "error", message: requestMessage(requestError, "This medicine could not be added. Check current availability and try again.") });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) return <div className="medicine-page"><PageState kind="loading" message="Loading medicine details…" /></div>;
  if (error || !medicine) return <div className="medicine-page"><button type="button" className="medicine-back-link" onClick={() => navigate("/dashboard/patient/medicines")}><ArrowLeft size={16} aria-hidden="true" /> Back to catalogue</button><PageState kind="error" message={error || "Medicine not found."} onRetry={loadMedicine} /></div>;

  const availability = stockLabel(medicine);
  return (
    <div className="medicine-page">
      <button type="button" className="medicine-back-link" onClick={() => navigate("/dashboard/patient/medicines")}><ArrowLeft size={16} aria-hidden="true" /> Back to catalogue</button>
      <div className="medicine-detail-layout">
        <section className="medicine-detail-visual" aria-label={`${medicine.name} product image`}>
          <MedicineProductImage medicine={medicine} />
          {medicine.isDemo && <span className="medicine-detail-demo">Demo catalogue item — not live commercial inventory</span>}
        </section>
        <div className="medicine-detail-content">
          <div className="medicine-detail-tags"><span className="medicine-category-tag">{medicine.category}</span>{medicine.prescriptionRequired && <span className="medicine-rx-tag">Prescription required</span>}</div>
          <span className="medicine-eyebrow">Medicine details</span>
          <h2>{medicine.name}</h2>
          {medicine.manufacturer && <p className="medicine-detail-manufacturer">{medicine.manufacturer}</p>}
          {medicine.description && <p className="medicine-detail-description">{medicine.description}</p>}
          <div className="medicine-detail-price">{priceInr(medicine.price)}</div>
          <div className="medicine-detail-availability"><span className={`medicine-stock${outOfStock ? " unavailable" : ""}`}>{availability || "Availability checked at cart"}</span><small>Stock is global catalogue inventory and is not assigned to a specific pharmacy.</small></div>

          <dl className="medicine-facts">
            {medicine.type && <div><dt>Product type</dt><dd>{medicine.type}</dd></div>}
            {medicine.dosage && <div><dt>Form / strength</dt><dd>{medicine.dosage}</dd></div>}
            {medicine.expiryDate && <div><dt>Expiry date</dt><dd>{medicine.expiryDate}</dd></div>}
            {medicine.activeIngredients?.length > 0 && <div className="medicine-fact-wide"><dt>Active ingredients</dt><dd>{medicine.activeIngredients.join(", ")}</dd></div>}
          </dl>

          {medicine.warnings?.length > 0 && <section className="medicine-warning" aria-labelledby="medicine-warnings-title"><h3 id="medicine-warnings-title">Catalogue warnings</h3><ul>{medicine.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></section>}

          <form className="medicine-add-form" onSubmit={addToCart}>
            <div className="medicine-quantity-field"><label htmlFor="medicine-quantity">Quantity</label><input id="medicine-quantity" aria-label="Quantity" type="number" min="1" max={stockKnown ? medicine.inStock : 1000} step="1" value={quantity} disabled={outOfStock || submitting} onChange={(event) => setValidQuantity(event.target.value)} /></div>
            <button className="medicine-add-button" type="submit" disabled={submitting || outOfStock}>
              {submitting ? <><span className="medicine-button-spinner" aria-hidden="true" /> Adding…</> : <><ShoppingBag size={17} aria-hidden="true" /> Add {priceInr(Number(medicine.price) * quantity)} to cart</>}
            </button>
            {medicine.prescriptionRequired && <p className="medicine-prescription-note"><ShieldCheck size={15} aria-hidden="true" /> This item requires a prescription. Prescription verification is not available in Hospot yet.</p>}
          </form>
          <AddToCartFeedback feedback={feedback} onOpenCart={() => navigate("/cart")} />
        </div>
      </div>
    </div>
  );
}
