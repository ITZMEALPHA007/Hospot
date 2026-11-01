import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Activity, Camera, CalendarDays, Check, ClipboardList, PackageCheck, Pencil, RefreshCw, ShoppingBag, Trash2, XCircle } from "lucide-react";
import { API, ensureCsrf } from "../lib/authClient";
import ProfileAvatar from "./ProfileAvatar";
import PatientEmailManagement from "./PatientEmailManagement";
import "./patient-profile.css";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTO_DIMENSION = 4096;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function messageFrom(error) {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" ? detail : "Your profile summary could not be loaded. Please try again.";
}

function profileErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg.replace(/^Value error,\s*/i, "");
  return fallback;
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) || "H").toUpperCase();
}

function memberDate(value) {
  if (!value) return "Member date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Member date unavailable" : `Member since ${new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(date)}`;
}

function formatMoney(amount, currency = "INR") {
  const value = Number(amount);
  return Number.isFinite(value) ? new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : "—";
}

function dateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date) : "Date unavailable";
}

function displayStatus(value = "") {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Unknown";
}

function SummaryLoading() {
  return <div className="patient-profile-state" role="status"><span className="medicine-spinner" aria-hidden="true" />Loading your profile summary…</div>;
}

export default function PatientProfilePage({ user, onProfileUpdate }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [photoFeedback, setPhotoFeedback] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(user?.profilePictureUrl || null);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [savedPhoneNumber, setSavedPhoneNumber] = useState(user?.phoneNumber || null);
  const [phoneDraft, setPhoneDraft] = useState(user?.phoneNumber || "");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneFeedback, setPhoneFeedback] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => setName(user?.name || ""), [user?.name]);
  useEffect(() => setPhotoUrl(user?.profilePictureUrl || null), [user?.profilePictureUrl]);
  useEffect(() => { setSavedPhoneNumber(user?.phoneNumber || null); setPhoneDraft(user?.phoneNumber || ""); }, [user?.phoneNumber]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const clearPendingPhoto = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null); setPendingPhoto(null); setUploadProgress(0);
    if (fileInput.current) fileInput.current.value = "";
  };

  const choosePhoto = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      setPhotoFeedback({ type: "error", text: "Choose a JPEG, PNG, or WebP image." });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoFeedback({ type: "error", text: "Choose an image that is 5 MB or smaller." });
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > MAX_PHOTO_DIMENSION || image.naturalHeight > MAX_PHOTO_DIMENSION || image.naturalWidth * image.naturalHeight > 16_000_000) {
        URL.revokeObjectURL(objectUrl);
        setPhotoFeedback({ type: "error", text: "Image dimensions exceed the supported limit." });
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPendingPhoto(file); setPreviewUrl(objectUrl); setPhotoFeedback(null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setPhotoFeedback({ type: "error", text: "This file could not be previewed as an image." });
    };
    image.src = objectUrl;
  };

  const savePhoto = async () => {
    if (!pendingPhoto || photoSaving) return;
    setPhotoSaving(true); setPhotoFeedback(null); setUploadProgress(0);
    try {
      await ensureCsrf();
      const formData = new FormData(); formData.append("file", pendingPhoto);
      const response = await axios.post(`${API}/auth/me/profile-picture`, formData, {
        onUploadProgress: (event) => {
          if (event.total) setUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        },
      });
      setPhotoUrl(response.data.profilePictureUrl || null);
      onProfileUpdate(response.data);
      clearPendingPhoto();
      setPhotoFeedback({ type: "success", text: "Your profile photo was updated." });
    } catch (error) {
      setPhotoFeedback({ type: "error", text: error?.response?.data?.detail || "Your photo could not be uploaded. Please try again." });
    } finally { setPhotoSaving(false); }
  };

  const removePhoto = async () => {
    if (photoSaving || !photoUrl) return;
    setPhotoSaving(true); setPhotoFeedback(null);
    try {
      await ensureCsrf();
      const response = await axios.delete(`${API}/auth/me/profile-picture`);
      setPhotoUrl(null);
      onProfileUpdate(response.data);
      setPhotoFeedback({ type: "success", text: "Your profile photo was removed." });
    } catch (error) {
      setPhotoFeedback({ type: "error", text: error?.response?.data?.detail || "Your photo could not be removed. Please try again." });
    } finally { setPhotoSaving(false); }
  };

  const loadSummary = useCallback(async () => {
    setLoading(true); setLoadError("");
    try { setSummary((await axios.get(`${API}/patient/profile/summary`)).data); }
    catch (error) { setLoadError(messageFrom(error)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const saveName = async (event) => {
    event.preventDefault();
    const cleaned = name.trim();
    if (cleaned.length < 2) {
      setFeedback({ type: "error", text: "Enter a name with at least two characters." });
      return;
    }
    setSaving(true); setFeedback(null);
    try {
      await ensureCsrf();
      const response = await axios.patch(`${API}/auth/me`, { name: cleaned });
      setName(response.data.name);
      onProfileUpdate(response.data);
      setEditing(false);
      setFeedback({ type: "success", text: "Your profile name was updated." });
    } catch (error) {
      setFeedback({ type: "error", text: error?.response?.data?.detail || "Your profile could not be saved. Try again." });
    } finally { setSaving(false); }
  };

  const savePhone = async (event) => {
    event.preventDefault();
    const compact = phoneDraft.trim().replace(/[\s-]/g, "");
    const national = compact.startsWith("+91") ? compact.slice(3) : compact;
    if (!/^[6-9][0-9]{9}$/.test(national) || (compact.startsWith("+") && !compact.startsWith("+91"))) {
      setPhoneFeedback({ type: "error", text: "Enter a valid 10-digit Indian mobile number, optionally prefixed with +91." });
      return;
    }
    setPhoneSaving(true); setPhoneFeedback(null);
    try {
      await ensureCsrf();
      const response = await axios.patch(`${API}/auth/me`, { phoneNumber: phoneDraft.trim() });
      setSavedPhoneNumber(response.data.phoneNumber || null);
      setPhoneDraft(response.data.phoneNumber || "");
      onProfileUpdate(response.data);
      setPhoneEditing(false);
      setPhoneFeedback({ type: "success", text: "Phone number saved. It has not been verified." });
    } catch (error) {
      setPhoneFeedback({ type: "error", text: profileErrorMessage(error, "Your phone number could not be saved. Please try again.") });
    } finally { setPhoneSaving(false); }
  };

  const removePhone = async () => {
    if (phoneSaving || !savedPhoneNumber) return;
    setPhoneSaving(true); setPhoneFeedback(null);
    try {
      await ensureCsrf();
      const response = await axios.patch(`${API}/auth/me`, { phoneNumber: null });
      setSavedPhoneNumber(null);
      setPhoneDraft("");
      onProfileUpdate(response.data);
      setPhoneFeedback({ type: "success", text: "Account phone number removed." });
    } catch (error) {
      setPhoneFeedback({ type: "error", text: profileErrorMessage(error, "Your phone number could not be removed. Please try again.") });
    } finally { setPhoneSaving(false); }
  };

  const statuses = summary?.bookingStatuses || {};
  const activity = summary?.recentActivity || [];

  return <div className="patient-profile-page">
    <section className="patient-profile-identity" aria-labelledby="patient-profile-heading">
      <ProfileAvatar user={{ ...user, name, profilePictureUrl: photoUrl }} className="patient-profile-avatar" alt="" />
      <div className="patient-profile-identity-copy">
        <span className="dashboard-eyebrow">Patient account</span>
        <h2 id="patient-profile-heading">{name || user?.name || "Patient"}</h2>
        <p>{user?.email || "Email unavailable"}</p>
        <div className="patient-profile-identity-meta"><span><CalendarDays size={14} aria-hidden="true" /> {memberDate(summary?.memberSince)}</span>{summary?.accountStatus && <span className="patient-profile-account-status"><i aria-hidden="true" /> {displayStatus(summary.accountStatus)}</span>}</div>
      </div>
      <div className="patient-profile-identity-actions">
        <input ref={fileInput} className="patient-profile-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a profile photo" onChange={choosePhoto} />
        {!pendingPhoto && <button type="button" className="patient-profile-edit-button" onClick={() => fileInput.current?.click()} disabled={photoSaving}><Camera size={15} aria-hidden="true" /> {photoUrl ? "Change photo" : "Add photo"}</button>}
        {photoUrl && !pendingPhoto && <button type="button" className="patient-profile-remove-photo" onClick={removePhoto} disabled={photoSaving}><Trash2 size={14} aria-hidden="true" /> Remove photo</button>}
        {!editing && <button type="button" className="patient-profile-edit-button" onClick={() => { setEditing(true); setFeedback(null); }}><Pencil size={15} aria-hidden="true" /> Edit profile</button>}
      </div>
    </section>

    {feedback && <p className={`patient-profile-feedback ${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.type === "success" ? <Check size={15} /> : <XCircle size={15} />}{feedback.text}</p>}
    {phoneFeedback && <p className={`patient-profile-feedback ${phoneFeedback.type}`} role={phoneFeedback.type === "error" ? "alert" : "status"}>{phoneFeedback.type === "success" ? <Check size={15} /> : <XCircle size={15} />}{phoneFeedback.text}</p>}
    {photoFeedback && <p className={`patient-profile-feedback ${photoFeedback.type}`} role={photoFeedback.type === "error" ? "alert" : "status"}>{photoFeedback.type === "success" ? <Check size={15} /> : <XCircle size={15} />}{photoFeedback.text}</p>}
    {pendingPhoto && <section className="patient-profile-photo-pending" aria-label="Pending profile photo preview">
      <div className="patient-profile-preview-frame"><img src={previewUrl} alt="Preview of selected profile photo" /></div>
      <div className="patient-profile-preview-copy"><strong>Preview your new photo</strong><span>{pendingPhoto.name}</span>{photoSaving && <div className="patient-profile-progress" role="status"><span style={{ width: `${uploadProgress}%` }} /><small>{uploadProgress ? `Uploading ${uploadProgress}%` : "Uploading…"}</small></div>}</div>
      <div className="patient-profile-preview-actions"><button type="button" className="patient-profile-cancel" disabled={photoSaving} onClick={clearPendingPhoto}>Cancel</button><button type="button" className="dashboard-primary-button" disabled={photoSaving} onClick={savePhoto}>{photoSaving ? "Saving…" : "Save photo"}</button></div>
    </section>}

    <div className="patient-profile-grid">
      <section className="dashboard-panel patient-profile-account" aria-labelledby="patient-account-title">
        <div className="patient-profile-section-heading"><div><span className="dashboard-eyebrow">Account details</span><h3 id="patient-account-title">Your information</h3></div></div>
        {editing ? <form className="patient-profile-form" onSubmit={saveName}>
          <label htmlFor="patient-profile-name">Full name</label><input id="patient-profile-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
          <label htmlFor="patient-profile-email">Email address</label><input id="patient-profile-email" value={user?.email || ""} readOnly aria-describedby="patient-email-help" />
          <p id="patient-email-help" className="patient-profile-hint">Use the separate Change email action below to verify a replacement address.</p>
          <div className="patient-profile-form-actions"><button type="button" className="patient-profile-cancel" disabled={saving} onClick={() => { setEditing(false); setName(user?.name || ""); setFeedback(null); }}>Cancel</button><button type="submit" className="dashboard-primary-button" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
        </form> : <dl className="patient-profile-fields"><div><dt>Full name</dt><dd>{user?.name || "Not provided"}</dd></div><div><dt>Email address</dt><dd><PatientEmailManagement user={user} onProfileUpdate={onProfileUpdate} /></dd></div><div className="patient-profile-phone-field"><dt>Account phone number</dt><dd>{savedPhoneNumber || <span className="patient-profile-unavailable">Not added</span>}{savedPhoneNumber && <small>Unverified · OTP verification is not available yet.</small>}</dd><div className="patient-profile-phone-actions">{phoneEditing ? <form onSubmit={savePhone}><label htmlFor="patient-profile-phone">Indian mobile number</label><input id="patient-profile-phone" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={20} value={phoneDraft} onChange={(event) => setPhoneDraft(event.target.value)} placeholder="98765 43210 or +91 98765 43210" aria-describedby="patient-phone-help" disabled={phoneSaving} /><small id="patient-phone-help">Enter a 10-digit Indian mobile number. This number will be saved as unverified.</small><div className="patient-profile-form-actions"><button type="button" className="patient-profile-cancel" disabled={phoneSaving} onClick={() => { setPhoneDraft(savedPhoneNumber || ""); setPhoneEditing(false); setPhoneFeedback(null); }}>Cancel</button><button type="submit" className="dashboard-primary-button" disabled={phoneSaving}>{phoneSaving ? "Saving…" : "Save number"}</button></div></form> : <><button type="button" className="patient-profile-phone-edit" onClick={() => { setPhoneDraft(savedPhoneNumber || ""); setPhoneEditing(true); setPhoneFeedback(null); }}>{savedPhoneNumber ? "Edit" : "Add phone number"}</button>{savedPhoneNumber && <button type="button" className="patient-profile-phone-remove" disabled={phoneSaving} onClick={removePhone}>{phoneSaving ? "Removing…" : "Remove"}</button>}</>}</div></div><div><dt>Profile photo</dt><dd>{photoUrl ? "Photo added" : <span className="patient-profile-unavailable">No profile photo</span>}</dd></div></dl>}
      </section>

      <section className="patient-profile-analytics" aria-labelledby="patient-analytics-title">
        <div className="patient-profile-section-heading"><div><span className="dashboard-eyebrow">Your care activity</span><h3 id="patient-analytics-title">Account overview</h3></div><Activity size={18} aria-hidden="true" /></div>
        {loading ? <SummaryLoading /> : loadError ? <div className="patient-profile-inline-error" role="alert"><p>{loadError}</p><button type="button" onClick={loadSummary}><RefreshCw size={14} /> Try again</button></div> : <>
          <div className="patient-profile-metrics">
            <Metric icon={ClipboardList} label="Total bookings" value={summary.totalBookings} />
            <Metric icon={ShoppingBag} label="Medicine orders" value={summary.totalMedicineOrders} />
            <Metric icon={PackageCheck} label="Orders picked up or delivered" value={summary.fulfilledMedicineOrders} />
            <Metric icon={Activity} label="Order value (excluding cancelled)" value={formatMoney(summary.nonCancelledOrderValue, summary.currency)} note="Recorded order value; payment settlement is not tracked." />
          </div>
          <div className="patient-profile-booking-breakdown"><h4>Booking status</h4><div>{["pending", "confirmed", "rejected", "cancelled"].map((status) => <div key={status}><span>{displayStatus(status)}</span><strong>{statuses[status] ?? 0}</strong></div>)}</div></div>
        </>}
      </section>
    </div>

    <section className="dashboard-panel patient-profile-recent" aria-labelledby="patient-recent-title">
      <div className="patient-profile-section-heading"><div><span className="dashboard-eyebrow">Bookings and medicine orders</span><h3 id="patient-recent-title">Recent activity</h3><p>This list summarizes recent records; it is not a complete account activity feed.</p></div></div>
      {loading ? <SummaryLoading /> : loadError ? <div className="patient-profile-inline-error" role="alert"><p>{loadError}</p><button type="button" onClick={loadSummary}><RefreshCw size={14} /> Try again</button></div> : activity.length === 0 ? <div className="patient-profile-empty"><span><CalendarDays size={19} /></span><p>No bookings or medicine orders to show yet.</p></div> : <ol className="patient-profile-activity">{activity.map((entry) => <li key={`${entry.type}-${entry.id}`}><span className={`patient-profile-activity-icon ${entry.type}`}>{entry.type === "booking" ? <ClipboardList size={16} /> : <ShoppingBag size={16} />}</span><div className="patient-profile-activity-copy"><strong>{entry.title}</strong><span>{entry.type === "booking" ? "Booking" : "Medicine order"} · {dateTime(entry.occurredAt)}</span></div><span className={`patient-profile-activity-status status-${entry.status}`}>{displayStatus(entry.status)}</span></li>)}</ol>}
    </section>
  </div>;
}

function Metric({ icon: Icon, label, value, note }) {
  return <div className="patient-profile-metric"><span className="patient-profile-metric-icon"><Icon size={16} aria-hidden="true" /></span><span className="patient-profile-metric-label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

export { formatMoney, initials };
