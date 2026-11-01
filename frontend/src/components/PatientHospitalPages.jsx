import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft, ArrowRight, Bed, Building2, CalendarDays, Check, Clock3,
  MapPin, Phone, RefreshCw, Search, ShieldCheck, XCircle,
} from "lucide-react";
import { API, ensureCsrf } from "../lib/authClient";
import "./patient-hospitals.css";

const BED_TYPES = ["ICU", "General", "Special"];
const BED_LABELS = { ICU: "Intensive care", General: "General care", Special: "Special care" };

function errorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(" ") || fallback;
  return fallback;
}

function countAvailable(hospital, type) {
  const count = Number(hospital?.availableBeds?.[type]);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function PageHeading({ eyebrow, title, description, onBack }) {
  return (
    <div className="care-page-heading">
      {onBack && <button type="button" className="care-back-link" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Back</button>}
      <span className="care-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

function LoadingState({ label }) {
  return <div className="care-state" role="status"><span className="care-spinner" aria-hidden="true" />{label}</div>;
}

function ErrorState({ message, onRetry }) {
  return <div className="care-state care-state-error" role="alert"><XCircle size={20} aria-hidden="true" /><div><strong>We couldn’t load this information.</strong><p>{message}</p>{onRetry && <button className="care-secondary-button" type="button" onClick={onRetry}>Try again</button>}</div></div>;
}

function BedAvailability({ hospital, onBook }) {
  return (
    <div className="care-beds" aria-label="Available bed categories">
      {BED_TYPES.map((type) => {
        const supported = (hospital.bedTypes || BED_TYPES).includes(type);
        const available = supported ? countAvailable(hospital, type) : 0;
        const unavailable = !supported || available === 0;
        return (
          <div className={`care-bed-row${unavailable ? " is-unavailable" : ""}`} key={type}>
            <span className="care-bed-icon"><Bed size={17} aria-hidden="true" /></span>
            <span className="care-bed-copy"><strong>{type}</strong><small>{BED_LABELS[type]}</small></span>
            <span className="care-bed-count" aria-label={`${available} ${type} beds available`}>{available}<small> available</small></span>
            {onBook && <button type="button" className="care-inline-action" disabled={unavailable} onClick={() => onBook(type)} aria-label={`Request ${type} bed at ${hospital.name}`}>Choose <ArrowRight size={14} aria-hidden="true" /></button>}
          </div>
        );
      })}
    </div>
  );
}

export function HospitalDiscoveryPage({ bookingMode = false }) {
  const navigate = useNavigate();
  const [hospitals, setHospitals] = useState([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHospitals = useCallback(async (search = "") => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(`${API}/hospitals`, { params: search ? { search } : {} });
      setHospitals(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setError(errorMessage(requestError, "Please check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHospitals(); }, [loadHospitals]);

  const submitSearch = (event) => {
    event.preventDefault();
    setSubmittedQuery(query.trim());
    loadHospitals(query.trim());
  };

  const startBooking = (hospitalId, bedType) => {
    navigate(`/dashboard/patient/bookings/new?hospitalId=${encodeURIComponent(hospitalId)}&bedType=${encodeURIComponent(bedType)}`);
  };

  return (
    <div className="care-page">
      <PageHeading eyebrow={bookingMode ? "Bed booking" : "Care near you"} title={bookingMode ? "Find an available bed" : "Find a hospital"} description={bookingMode ? "Start by choosing a hospital and a bed category with current availability." : "Explore hospitals and review their current bed availability before requesting a reservation."} />
      <form className="care-search" onSubmit={submitSearch} role="search">
        <Search size={19} aria-hidden="true" />
        <label className="care-sr-only" htmlFor="hospital-search">Search hospitals by name, area, or address</label>
        <input id="hospital-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by hospital, area, or address" maxLength={120} />
        {query && <button type="button" className="care-clear-search" aria-label="Clear search" onClick={() => { setQuery(""); setSubmittedQuery(""); loadHospitals(); }}><XCircle size={17} /></button>}
        <button type="submit" className="care-primary-button"><Search size={16} aria-hidden="true" /><span>Search</span></button>
      </form>
      {submittedQuery && <p className="care-results-label">Results for “{submittedQuery}”</p>}
      {loading ? <LoadingState label="Loading hospitals and availability…" /> : error ? <ErrorState message={error} onRetry={() => loadHospitals(submittedQuery)} /> : hospitals.length === 0 ? (
        <div className="care-empty"><span className="care-empty-icon"><Building2 size={22} /></span><h3>{submittedQuery ? "No matching hospitals" : "No hospitals are available yet"}</h3><p>{submittedQuery ? "Try a different hospital name, area, or address." : "Hospitals will appear here when they are available in the directory."}</p></div>
      ) : (
        <div className="care-hospital-list" aria-live="polite">
          {hospitals.map((hospital) => {
            const totalAvailable = BED_TYPES.reduce((sum, type) => sum + countAvailable(hospital, type), 0);
            return (
              <article className="care-hospital-card" key={hospital.id}>
                <div className="care-hospital-main">
                  <div className="care-hospital-title-row"><span className="care-hospital-mark"><Building2 size={21} aria-hidden="true" /></span><div><h3>{hospital.name}</h3><p>{hospital.location}</p></div></div>
                  <div className="care-contact-lines">
                    {hospital.address && <p><MapPin size={15} aria-hidden="true" /><span>{hospital.address}</span></p>}
                    {hospital.phone && <p><Phone size={15} aria-hidden="true" /><a href={`tel:${hospital.phone}`}>{hospital.phone}</a></p>}
                  </div>
                  {hospital.emergency && <span className="care-emergency"><ShieldCheck size={14} aria-hidden="true" /> Emergency services listed</span>}
                </div>
                <div className="care-hospital-availability">
                  <div className="care-availability-heading"><div><span className="care-eyebrow">Current availability</span><strong>{totalAvailable}</strong></div><span className={`care-availability-status${totalAvailable === 0 ? " is-none" : ""}`}>{totalAvailable === 0 ? "Unavailable" : "Beds available"}</span></div>
                  <BedAvailability
                    hospital={hospital}
                    onBook={bookingMode ? (bedType) => startBooking(hospital.id, bedType) : undefined}
                  />
                  <button className="care-secondary-button care-details-button" type="button" onClick={() => navigate(`/dashboard/patient/hospitals/${encodeURIComponent(hospital.id)}`)}>Hospital details <ArrowRight size={15} aria-hidden="true" /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function HospitalDetailPage() {
  const { hospitalId } = useParams();
  const navigate = useNavigate();
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadHospital = useCallback(async () => {
    setLoading(true); setError("");
    try { setHospital((await axios.get(`${API}/hospitals/${encodeURIComponent(hospitalId)}`)).data); }
    catch (requestError) { setError(errorMessage(requestError, "Please try again.")); }
    finally { setLoading(false); }
  }, [hospitalId]);
  useEffect(() => { loadHospital(); }, [loadHospital]);

  const book = (bedType) => navigate(`/dashboard/patient/bookings/new?hospitalId=${encodeURIComponent(hospital.id)}&bedType=${encodeURIComponent(bedType)}`);
  if (loading) return <div className="care-page"><LoadingState label="Loading hospital details…" /></div>;
  if (error) return <div className="care-page"><ErrorState message={error} onRetry={loadHospital} /></div>;
  if (!hospital) return null;

  return (
    <div className="care-page">
      <PageHeading eyebrow="Hospital profile" title={hospital.name} description={hospital.location} onBack={() => navigate("/dashboard/patient/hospitals")} />
      <section className="care-detail-card">
        <div className="care-detail-intro"><span className="care-hospital-mark large"><Building2 size={25} aria-hidden="true" /></span><div><span className="care-eyebrow">Hospital information</span><h3>{hospital.name}</h3><p>{hospital.address}</p></div></div>
        <div className="care-detail-contact">{hospital.phone && <a href={`tel:${hospital.phone}`}><Phone size={16} aria-hidden="true" />{hospital.phone}</a>}{hospital.emergency && <span className="care-emergency"><ShieldCheck size={14} aria-hidden="true" /> Emergency services listed</span>}</div>
      </section>
      <section className="care-detail-section"><div className="care-section-heading"><div><span className="care-eyebrow">Live from hospital directory</span><h3>Bed availability</h3></div><span className="care-updated-label"><Clock3 size={14} aria-hidden="true" /> Current count</span></div><p className="care-section-description">Availability can change. Your request is checked again by the hospital when submitted.</p><BedAvailability hospital={hospital} onBook={book} /></section>
    </div>
  );
}

const INITIAL_BOOKING_FORM = (user) => ({
  fullName: user?.name || "", age: "", gender: "", bloodGroup: "", mobile: "",
  email: user?.email || "", emergencyContactName: "", emergencyContactPhone: "",
  primaryCondition: "", allergies: "", currentMedications: "", previousSurgeries: "",
  insuranceProvider: "", policyNumber: "", specialRequests: "", preferredAdmissionDate: "", admissionTime: "immediate",
});

export function BookingCreatePage({ user }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const hospitalId = params.get("hospitalId") || "";
  const requestedBedType = params.get("bedType") || "";
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(Boolean(hospitalId));
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => INITIAL_BOOKING_FORM(user));
  const [submitting, setSubmitting] = useState(false);
  const [reviewStep, setReviewStep] = useState(false);
  const [successId, setSuccessId] = useState("");

  useEffect(() => { setForm((current) => ({ ...current, fullName: user?.name || current.fullName, email: user?.email || current.email })); }, [user?.name, user?.email]);
  useEffect(() => {
    if (!hospitalId) { setLoading(false); setError("Choose a hospital before starting a bed request."); return; }
    let active = true;
    setLoading(true); setError("");
    axios.get(`${API}/hospitals/${encodeURIComponent(hospitalId)}`).then((response) => { if (active) setHospital(response.data); })
      .catch((requestError) => { if (active) setError(errorMessage(requestError, "Hospital details could not be loaded.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [hospitalId]);

  const setField = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  const selectedBedType = BED_TYPES.includes(requestedBedType) ? requestedBedType : "";
  const canRequest = hospital && selectedBedType && countAvailable(hospital, selectedBedType) > 0;

  const submit = async (event) => {
    event.preventDefault();
    if (submitting || !canRequest) return;
    if (!event.currentTarget.checkValidity()) return;
    if (!reviewStep) { setReviewStep(true); return; }
    setSubmitting(true); setError("");
    try {
      await ensureCsrf();
      const payload = {
        hospitalId, bedType: selectedBedType, fullName: form.fullName.trim(), age: Number(form.age),
        gender: form.gender, bloodGroup: form.bloodGroup, mobile: form.mobile.trim(),
        email: form.email.trim() || null, emergencyContactName: form.emergencyContactName.trim(),
        emergencyContactPhone: form.emergencyContactPhone.trim(), primaryCondition: form.primaryCondition.trim(),
        allergies: form.allergies.trim() || null, currentMedications: form.currentMedications.trim() || null,
        previousSurgeries: form.previousSurgeries.trim() || null, insuranceProvider: form.insuranceProvider.trim() || null,
        policyNumber: form.policyNumber.trim() || null, specialRequests: form.specialRequests.trim() || null,
        preferredAdmissionDate: form.preferredAdmissionDate || null, admissionTime: form.admissionTime,
      };
      const response = await axios.post(`${API}/bookings`, payload);
      setSuccessId(response.data.id);
    } catch (requestError) {
      setError(errorMessage(requestError, "Your request could not be submitted. Please review the details and try again."));
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="care-page"><LoadingState label="Preparing your booking request…" /></div>;
  if (error && !hospital) return <div className="care-page"><PageHeading eyebrow="Bed request" title="Request a bed" onBack={() => navigate("/dashboard/patient/hospitals")} /><ErrorState message={error} onRetry={() => navigate("/dashboard/patient/hospitals")} /></div>;
  if (successId) return <div className="care-page"><div className="care-success-panel"><span><Check size={22} aria-hidden="true" /></span><span className="care-eyebrow">Request submitted</span><h2>Your request is with the hospital</h2><p>Your booking is pending hospital review. You can follow its status in My Bookings.</p><div className="care-success-actions"><button className="care-primary-button" type="button" onClick={() => navigate(`/dashboard/patient/bookings/${encodeURIComponent(successId)}`)}>View booking <ArrowRight size={16} /></button><button className="care-secondary-button" type="button" onClick={() => navigate("/dashboard/patient/bookings")}>My bookings</button></div></div></div>;

  return (
    <div className="care-page">
      <PageHeading eyebrow="Bed request" title="Request a bed" description="Share the information the hospital needs to review your request. Availability is confirmed by the backend when you submit." onBack={() => navigate(`/dashboard/patient/hospitals/${encodeURIComponent(hospitalId)}`)} />
      <div className="care-booking-summary"><Building2 size={18} aria-hidden="true" /><span><strong>{hospital?.name}</strong><small>{BED_LABELS[selectedBedType] || selectedBedType || "Bed category not selected"} · {selectedBedType || "Select a category"}</small></span><span className="care-summary-availability">{selectedBedType ? `${countAvailable(hospital, selectedBedType)} available` : "Choose from details"}</span></div>
      {!canRequest && <div className="care-inline-warning" role="status">{selectedBedType ? "This category currently has no available beds. Choose another category from the hospital details." : "Select an available bed category from hospital details to continue."}<button type="button" onClick={() => navigate(`/dashboard/patient/hospitals/${encodeURIComponent(hospitalId)}`)}>Review availability</button></div>}
      {error && <p className="care-form-error" role="alert">{error}</p>}
      <form className="care-booking-form" onSubmit={submit}>
        {reviewStep ? <section className="care-review-panel" aria-labelledby="care-review-title">
          <div className="care-section-heading"><div><span className="care-eyebrow">Before you submit</span><h3 id="care-review-title">Review your request</h3></div><span className="care-status care-status-pending">Pending hospital review</span></div>
          <p className="care-section-description">Check the details below. The hospital will review your request; it does not confirm admission.</p>
          <div className="care-review-grid">
            <div><span>Hospital</span><strong>{hospital?.name}</strong></div><div><span>Bed category</span><strong>{BED_LABELS[selectedBedType]} ({selectedBedType})</strong></div>
            <div><span>Patient</span><strong>{form.fullName} · {form.age} · {form.gender}</strong></div><div><span>Blood group</span><strong>{form.bloodGroup}</strong></div>
            <div><span>Contact</span><strong>{form.mobile}{form.email ? ` · ${form.email}` : ""}</strong></div><div><span>Emergency contact</span><strong>{form.emergencyContactName} · {form.emergencyContactPhone}</strong></div>
            <div className="care-review-full"><span>Primary condition / reason</span><strong>{form.primaryCondition}</strong></div>
            <div><span>Admission timing</span><strong>{form.admissionTime}</strong></div>
            {form.preferredAdmissionDate && <div><span>Preferred admission date</span><strong>{form.preferredAdmissionDate}</strong></div>}
            {form.allergies && <div><span>Allergies</span><strong>{form.allergies}</strong></div>}
            {form.currentMedications && <div><span>Current medications</span><strong>{form.currentMedications}</strong></div>}
            {form.previousSurgeries && <div><span>Previous surgeries</span><strong>{form.previousSurgeries}</strong></div>}
            {form.specialRequests && <div className="care-review-full"><span>Special requests</span><strong>{form.specialRequests}</strong></div>}
            {(form.insuranceProvider || form.policyNumber) && <div><span>Insurance</span><strong>{[form.insuranceProvider, form.policyNumber].filter(Boolean).join(" · ")}</strong></div>}
          </div>
          <div className="care-booking-notice"><ShieldCheck size={17} aria-hidden="true" /><span>Your identity comes from your signed-in session. Bed availability is checked again by the backend on submission.</span></div>
          {error && <p className="care-form-error" role="alert">{error}</p>}
          <div className="care-form-actions"><button type="button" className="care-secondary-button" onClick={() => setReviewStep(false)}>Edit details</button><button type="submit" className="care-primary-button" disabled={!canRequest || submitting}>{submitting ? "Submitting request…" : "Confirm & submit request"}<ArrowRight size={16} aria-hidden="true" /></button></div>
        </section> : <>
        <fieldset disabled={!canRequest || submitting}>
          <legend>Patient details</legend>
          <div className="care-form-grid">
            <label>Full name<input required minLength="2" maxLength="120" value={form.fullName} onChange={setField("fullName")} autoComplete="name" /></label>
            <label>Age<input required type="number" min="1" max="120" value={form.age} onChange={setField("age")} /></label>
            <label>Gender<select required value={form.gender} onChange={setField("gender")}><option value="">Select gender</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label>
            <label>Blood group<select required value={form.bloodGroup} onChange={setField("bloodGroup")}><option value="">Select blood group</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => <option key={group}>{group}</option>)}</select></label>
            <label>Mobile number<input required type="tel" minLength="3" maxLength="32" value={form.mobile} onChange={setField("mobile")} autoComplete="tel" /></label>
            <label>Email address <span className="care-optional">Optional</span><input type="email" value={form.email} onChange={setField("email")} autoComplete="email" /></label>
          </div>
        </fieldset>
        <fieldset disabled={!canRequest || submitting}>
          <legend>Emergency contact and care needs</legend>
          <div className="care-form-grid">
            <label>Emergency contact name<input required minLength="2" maxLength="120" value={form.emergencyContactName} onChange={setField("emergencyContactName")} /></label>
            <label>Emergency contact phone<input required type="tel" minLength="3" maxLength="32" value={form.emergencyContactPhone} onChange={setField("emergencyContactPhone")} /></label>
            <label className="care-field-full">Primary condition / reason for admission<textarea required minLength="2" maxLength="2000" rows="3" value={form.primaryCondition} onChange={setField("primaryCondition")} /></label>
            <label>Allergies <span className="care-optional">Optional</span><textarea maxLength="2000" rows="2" value={form.allergies} onChange={setField("allergies")} /></label>
            <label>Current medications <span className="care-optional">Optional</span><textarea maxLength="4000" rows="2" value={form.currentMedications} onChange={setField("currentMedications")} /></label>
            <label>Previous surgeries <span className="care-optional">Optional</span><textarea maxLength="4000" rows="2" value={form.previousSurgeries} onChange={setField("previousSurgeries")} /></label>
            <label>Special requests <span className="care-optional">Optional</span><textarea maxLength="4000" rows="2" value={form.specialRequests} onChange={setField("specialRequests")} /></label>
            <label>Preferred admission date <span className="care-optional">Optional</span><input type="date" value={form.preferredAdmissionDate} onChange={setField("preferredAdmissionDate")} /></label>
            <label>Admission timing<select value={form.admissionTime} onChange={setField("admissionTime")}><option value="immediate">Immediate</option><option value="today">Today</option><option value="week">Within a week</option><option value="flexible">Flexible</option></select></label>
            <label>Insurance provider <span className="care-optional">Optional</span><input maxLength="200" value={form.insuranceProvider} onChange={setField("insuranceProvider")} /></label>
            <label>Policy number <span className="care-optional">Optional</span><input maxLength="200" value={form.policyNumber} onChange={setField("policyNumber")} /></label>
          </div>
        </fieldset>
        <div className="care-booking-notice"><ShieldCheck size={17} aria-hidden="true" /><span>Your identity is taken from your signed-in session. The hospital will review this request; submitting does not confirm admission.</span></div>
        <div className="care-form-actions"><button type="button" className="care-secondary-button" onClick={() => navigate(`/dashboard/patient/hospitals/${encodeURIComponent(hospitalId)}`)}>Back to hospital</button><button type="submit" className="care-primary-button" disabled={!canRequest || submitting}>Review request <ArrowRight size={16} aria-hidden="true" /></button></div>
        </>}
      </form>
    </div>
  );
}

function statusClass(status = "") { return `care-status care-status-${String(status).toLowerCase()}`; }
function formatDate(value) { if (!value) return "Not specified"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Not specified" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date); }
function bookingTitle(booking) { return booking?.hospitalName || "Hospital booking"; }

function BookingActions({ booking, onCancel, busy, onOpen }) {
  const eligible = ["pending", "confirmed"].includes(booking.status);
  return <div className="care-record-actions"><button type="button" className="care-secondary-button" onClick={onOpen}>View details <ArrowRight size={15} aria-hidden="true" /></button>{eligible && <button type="button" className="care-cancel-button" disabled={busy} onClick={onCancel}>{busy ? "Cancelling…" : "Cancel request"}</button>}</div>;
}

export function PatientBookingsPage() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await axios.get(`${API}/bookings`); setBookings(Array.isArray(response.data) ? response.data : []); }
    catch (requestError) { setError(errorMessage(requestError, "Your bookings could not be loaded.")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const cancel = async (booking) => {
    setBusyId(booking.id); setError(""); setNotice("");
    try { await ensureCsrf(); await axios.post(`${API}/bookings/${encodeURIComponent(booking.id)}/cancel`); setConfirmId(""); setNotice("Booking cancelled. The hospital’s available capacity has been updated."); await load(); }
    catch (requestError) { setError(errorMessage(requestError, "The booking could not be cancelled. Refresh and try again.")); }
    finally { setBusyId(""); }
  };

  return (
    <div className="care-page">
      <PageHeading eyebrow="Your care requests" title="My bookings" description="Review request status and manage bookings that are still eligible for cancellation." />
      <div className="care-list-toolbar"><span>{bookings.length} {bookings.length === 1 ? "booking" : "bookings"}</span><button type="button" className="care-secondary-button" onClick={load} disabled={loading}><RefreshCw size={15} aria-hidden="true" /> Refresh status</button></div>
      {notice && <p className="care-success-notice" role="status"><Check size={16} aria-hidden="true" />{notice}</p>}{error && <ErrorState message={error} onRetry={load} />}
      {loading ? <LoadingState label="Loading your bookings…" /> : !error && bookings.length === 0 ? <div className="care-empty"><span className="care-empty-icon"><CalendarDays size={22} /></span><h3>No bookings yet</h3><p>When you submit a bed request, it will appear here with its current status.</p><button className="care-primary-button" type="button" onClick={() => navigate("/dashboard/patient/hospitals")}>Find a hospital <ArrowRight size={16} /></button></div> : (
        <div className="care-booking-list">{bookings.map((booking) => <article className="care-booking-card" key={booking.id}>
          <div className="care-booking-card-head"><div><span className="care-eyebrow">Reference {booking.id}</span><h3>{bookingTitle(booking)}</h3></div><span className={statusClass(booking.status)}>{booking.status}</span></div>
          <div className="care-booking-meta"><span><Bed size={15} aria-hidden="true" />{booking.bedType} bed</span><span><CalendarDays size={15} aria-hidden="true" />Requested {formatDate(booking.createdAt)}</span>{booking.preferredAdmissionDate && <span>Preferred {formatDate(booking.preferredAdmissionDate)}</span>}</div>
          {confirmId === booking.id && <div className="care-confirm-cancel" role="alert"><strong>Cancel this booking?</strong><p>This releases the reserved capacity. This action cannot be undone.</p><button type="button" className="care-cancel-button" disabled={busyId === booking.id} onClick={() => cancel(booking)}>Confirm cancellation</button><button type="button" className="care-text-button" onClick={() => setConfirmId("")}>Keep booking</button></div>}
          <BookingActions booking={booking} busy={busyId === booking.id} onOpen={() => navigate(`/dashboard/patient/bookings/${encodeURIComponent(booking.id)}`)} onCancel={() => setConfirmId(booking.id)} />
        </article>)}</div>
      )}
    </div>
  );
}

export function PatientBookingDetailPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await axios.get(`${API}/bookings/${encodeURIComponent(bookingId)}`);
      setBooking(response.data);
      try { setHospital((await axios.get(`${API}/hospitals/${encodeURIComponent(response.data.hospitalId)}`)).data); }
      catch { setHospital(null); }
    }
    catch (requestError) { setError(errorMessage(requestError, "This booking could not be loaded.")); }
    finally { setLoading(false); }
  }, [bookingId]);
  useEffect(() => { load(); }, [load]);
  const cancel = async () => {
    if (!booking || busy || !["pending", "confirmed"].includes(booking.status)) return;
    setBusy(true); setError("");
    try { await ensureCsrf(); const response = await axios.post(`${API}/bookings/${encodeURIComponent(booking.id)}/cancel`); setBooking(response.data); setNotice("Booking cancelled successfully."); setConfirmCancel(false); }
    catch (requestError) { setError(errorMessage(requestError, "The booking could not be cancelled.")); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="care-page"><LoadingState label="Loading booking details…" /></div>;
  if (error && !booking) return <div className="care-page"><PageHeading eyebrow="Booking details" title="Booking unavailable" onBack={() => navigate("/dashboard/patient/bookings")} /><ErrorState message={error} onRetry={load} /></div>;
  if (!booking) return null;
  return (
    <div className="care-page">
      <PageHeading eyebrow="Booking details" title={bookingTitle(booking)} onBack={() => navigate("/dashboard/patient/bookings")} />
      {notice && <p className="care-success-notice" role="status"><Check size={16} aria-hidden="true" />{notice}</p>}{error && <p className="care-form-error" role="alert">{error}</p>}
      <article className="care-detail-section care-booking-detail">
        <div className="care-booking-card-head"><div><span className="care-eyebrow">Booking reference</span><h3>{booking.id}</h3></div><span className={statusClass(booking.status)}>{booking.status}</span></div>
        <div className="care-detail-grid">
          <div><span>Hospital</span><strong>{booking.hospitalName}</strong>{hospital?.address && <small>{hospital.address}</small>}</div><div><span>Bed category</span><strong>{booking.bedType}</strong></div><div><span>Submitted</span><strong>{formatDate(booking.createdAt)}</strong></div><div><span>Last updated</span><strong>{formatDate(booking.updatedAt)}</strong></div><div><span>Patient</span><strong>{booking.fullName}</strong></div><div><span>Preferred admission</span><strong>{booking.preferredAdmissionDate || "Not specified"}</strong></div><div><span>Admission timing</span><strong>{booking.admissionTime}</strong></div><div><span>Primary reason</span><strong>{booking.primaryCondition}</strong></div>{hospital?.phone && <div><span>Hospital contact</span><strong><a href={`tel:${hospital.phone}`}>{hospital.phone}</a></strong></div>}
        </div>
        <div className="care-booking-detail-actions"><button type="button" className="care-secondary-button" onClick={() => navigate(`/dashboard/patient/hospitals/${encodeURIComponent(booking.hospitalId)}`)}>View hospital <ArrowRight size={15} /></button>{["pending", "confirmed"].includes(booking.status) && <button type="button" className="care-cancel-button" onClick={() => setConfirmCancel(true)}>Cancel booking</button>}</div>
      </article>
      {confirmCancel && <div className="care-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmCancel(false); }}><section className="care-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cancel-title"><span className="care-empty-icon"><XCircle size={21} /></span><h3 id="cancel-title">Cancel this booking?</h3><p>The reservation will be cancelled and its bed capacity released. You cannot undo this action.</p><div><button type="button" className="care-secondary-button" onClick={() => setConfirmCancel(false)}>Keep booking</button><button type="button" className="care-cancel-button" disabled={busy} onClick={cancel}>{busy ? "Cancelling…" : "Confirm cancellation"}</button></div></section></div>}
    </div>
  );
}
