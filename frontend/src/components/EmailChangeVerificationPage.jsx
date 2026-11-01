import React, { useState } from "react";
import axios from "axios";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, CircleAlert, MailCheck } from "lucide-react";
import { API, ensureCsrf } from "../lib/authClient";
import "./email-change.css";

export default function EmailChangeVerificationPage({ onProfileUpdate }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
  const alreadyCompleted = searchParams.get("completed") === "1";
  const alreadyFailed = searchParams.get("failed") === "1";
  const [state, setState] = useState(alreadyCompleted ? "success" : alreadyFailed ? "error" : token ? "ready" : "missing");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState(alreadyFailed ? "This verification link could not be confirmed." : "");

  const verify = async () => {
    if (!token || busy) return;
    setBusy(true); setError("");
    try {
      await ensureCsrf();
      const result = await axios.post(`${API}/auth/email-change/confirm`, { token });
      setEmail(result.data.email);
      setState("success");
      try {
        const profile = await axios.get(`${API}/auth/me`);
        onProfileUpdate(profile.data);
      } catch (_) {
        // Verification is token-authorized; the patient may not have an active session here.
      }
      navigate("/verify-email-change?completed=1", { replace: true });
    } catch (failure) {
      setState("error");
      setError(failure?.response?.data?.detail || "This verification link could not be confirmed.");
      navigate("/verify-email-change?failed=1", { replace: true });
    } finally { setBusy(false); }
  };

  return <main className="email-verification-page">
    <section className="email-verification-card">
      <span className={`email-verification-icon ${state}`} aria-hidden="true">{state === "success" ? <CheckCircle2 /> : state === "error" || state === "missing" ? <CircleAlert /> : <MailCheck />}</span>
      {state === "ready" && <><span className="dashboard-eyebrow">Hospot account security</span><h1>Confirm your email change</h1><p>Confirm only if you requested this change and can access the new mailbox. The current email remains active until you finish.</p><button type="button" className="dashboard-primary-button" disabled={busy} onClick={verify}>{busy ? "Verifying…" : "Verify new email"}</button></>}
      {state === "success" && <><span className="dashboard-eyebrow">Email verified</span><h1>Email address updated</h1><p>{email ? `${email} is now the email address on your Hospot account.` : "Your email change was confirmed. Sign in or return to your profile to see the updated address."}</p><Link className="dashboard-primary-button email-verification-link" to="/dashboard/patient/profile">Return to profile</Link></>}
      {state === "error" && <><span className="dashboard-eyebrow">Verification not completed</span><h1>We couldn’t verify this link</h1><p role="alert">{error}</p><p>The link may be invalid, expired, already used, or replaced by a newer request. Request another verification link from your profile.</p><Link className="dashboard-primary-button email-verification-link" to="/dashboard/patient/profile">Go to profile</Link></>}
      {state === "missing" && <><span className="dashboard-eyebrow">Hospot account security</span><h1>Verification link missing</h1><p>This page needs the complete link from your verification email. Return to your profile to request another one.</p><Link className="dashboard-primary-button email-verification-link" to="/dashboard/patient/profile">Go to profile</Link></>}
    </section>
  </main>;
}
