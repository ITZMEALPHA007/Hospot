import React, { useEffect, useState } from "react";
import axios from "axios";
import { API, ensureCsrf } from "../lib/authClient";
import "./email-change.css";

function apiMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg.replace(/^Value error,\s*/i, "");
  return fallback;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "soon" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function PatientEmailManagement({ user, onProfileUpdate }) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendReady, setResendReady] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    let active = true;
    axios.get(`${API}/auth/email-change`).then((response) => {
      if (active) setPending(response.data.pending ? response.data : null);
    }).catch(() => {
      if (active) setFeedback({ type: "error", text: "Pending email-change status could not be loaded. Try refreshing this page." });
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setResendReady(false);
    if (!pending?.resendAvailableAt) return undefined;
    const delay = new Date(pending.resendAvailableAt).getTime() - Date.now();
    if (delay <= 0) { setResendReady(true); return undefined; }
    const timer = window.setTimeout(() => setResendReady(true), delay);
    return () => window.clearTimeout(timer);
  }, [pending?.resendAvailableAt]);

  const refreshPending = async () => {
    const response = await axios.get(`${API}/auth/email-change`);
    setPending(response.data.pending ? response.data : null);
    return response.data;
  };

  const requestChange = async (event) => {
    event.preventDefault();
    const next = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setFeedback({ type: "error", text: "Enter a valid email address." });
      return;
    }
    if (next.toLowerCase() !== confirmation.trim().toLowerCase()) {
      setFeedback({ type: "error", text: "The email addresses do not match." });
      return;
    }
    if (next.toLowerCase() === user?.email?.toLowerCase()) {
      setFeedback({ type: "error", text: "Enter an address different from your current email." });
      return;
    }
    setBusy(true); setFeedback(null);
    try {
      await ensureCsrf();
      await axios.post(`${API}/auth/email-change/request`, { email: next });
      await refreshPending();
      setEditing(false); setEmail(""); setConfirmation("");
      setFeedback({ type: "success", text: "If the address is eligible, verification instructions have been sent. Your current email remains active until verification." });
    } catch (error) {
      await refreshPending().catch(() => {});
      setFeedback({ type: "error", text: apiMessage(error, "The email change request could not be completed. Please try again.") });
    } finally { setBusy(false); }
  };

  const resend = async () => {
    if (busy || resending || !resendReady) return;
    setResending(true); setFeedback(null);
    try {
      await ensureCsrf();
      await axios.post(`${API}/auth/email-change/resend`);
      await refreshPending();
      setFeedback({ type: "success", text: "If a verification is still available, a new link has been sent. Earlier links are invalidated." });
    } catch (error) {
      await refreshPending().catch(() => {});
      setFeedback({ type: "error", text: apiMessage(error, "A new verification email could not be sent. Please try again later.") });
    } finally { setResending(false); }
  };

  return <div className="patient-profile-email-management">
    <div className="patient-profile-email-summary"><span>{user?.email || "Email unavailable"}</span><button type="button" className="patient-profile-phone-edit" onClick={() => { setEditing((value) => !value); setEmail(""); setConfirmation(""); setFeedback(null); }}>{editing ? "Cancel" : "Change email"}</button></div>
    <small>Email stays unchanged until you verify access to the new address.</small>
    {pending && <div className="patient-profile-email-pending" role="status"><strong>Verification pending</strong><span>Check <b>{pending.email}</b> for the Hospot verification link.</span><span>Link expires {formatDate(pending.expiresAt)}. Resend available {formatDate(pending.resendAvailableAt)}.</span><button type="button" className="patient-profile-phone-edit" disabled={!resendReady || resending || busy} onClick={resend}>{resending ? "Sending…" : resendReady ? "Resend verification" : "Resend unavailable yet"}</button></div>}
    {checking && !pending && <small role="status">Checking for a pending email change…</small>}
    {editing && <form className="patient-profile-email-form" onSubmit={requestChange}>
      <label htmlFor="patient-new-email">New email address</label>
      <input id="patient-new-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
      <label htmlFor="patient-confirm-email">Confirm new email address</label>
      <input id="patient-confirm-email" type="email" autoComplete="email" maxLength={254} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} />
      <p>We’ll email a one-time link. Your current address remains active until the new one is verified.</p>
      <div className="patient-profile-form-actions"><button type="button" className="patient-profile-cancel" disabled={busy} onClick={() => { setEditing(false); setFeedback(null); }}>Cancel</button><button type="submit" className="dashboard-primary-button" disabled={busy}>{busy ? "Sending…" : "Send verification link"}</button></div>
    </form>}
    {feedback && <p className={`patient-profile-feedback ${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.text}</p>}
  </div>;
}
