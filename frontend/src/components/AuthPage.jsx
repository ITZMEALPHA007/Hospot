import React, { useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import "./auth-page.css";

const PASSWORD_RULES = [
  ["length", "12 or more characters", (value) => value.length >= 12],
  ["uppercase", "An uppercase letter", (value) => /[A-Z]/.test(value)],
  ["lowercase", "A lowercase letter", (value) => /[a-z]/.test(value)],
  ["number", "A number", (value) => /\d/.test(value)],
  ["special", "A special character", (value) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(value)],
];

const safeDetailMessages = new Map([
  ["Invalid email or password", "Email or password is incorrect."],
  ["An account with this email already exists", "An account already exists for this email. Try signing in."],
  ["Invitation is invalid or expired", "This invitation is invalid or expired. Ask the sender for a new invitation."],
  ["CSRF validation failed", "Your secure session could not be verified. Please try again."],
]);

export function normalizeAuthError(error, isRegistering = false, invitationToken = null) {
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail;

  if (Array.isArray(detail)) {
    const fields = new Set(detail.map((item) => Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null));
    if (fields.has("email")) return "Enter a valid email address.";
    if (fields.has("name")) return "Enter a name with at least 2 characters.";
    if (fields.has("password")) return "Use a password from 12 to 128 characters.";
    return "Please review the information and try again.";
  }

  if (typeof detail === "string" && safeDetailMessages.has(detail)) {
    return safeDetailMessages.get(detail);
  }
  if (status === 401) return "Email or password is incorrect.";
  if (status === 409) return isRegistering
    ? "An account already exists for this email. Try signing in."
    : "We could not complete sign in. Please try again.";
  if (status === 400 && invitationToken) return "This invitation is invalid or expired. Ask the sender for a new invitation.";
  if (status === 422) return "Please check the information and try again.";
  if (!error?.response) return "We couldn't reach Hospot. Check your connection and try again.";
  return "We couldn't complete your request. Please try again.";
}

function validateName(name) {
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Enter your full name (at least 2 characters).";
  if (trimmed.length > 120) return "Your name must be 120 characters or fewer.";
  return null;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : "Enter a valid email address.";
}

function validatePassword(password) {
  if (password.length < 12 || password.length > 128) return "Use a password from 12 to 128 characters.";
  const missing = PASSWORD_RULES.slice(1).filter(([, , isValid]) => !isValid(password)).map(([, label]) => label);
  return missing.length ? `Add ${missing.join(", ").toLowerCase()}.` : null;
}

function passwordScore(password) {
  return PASSWORD_RULES.reduce((score, [, , matches]) => score + Number(matches(password)), 0);
}

export default function AuthPage({
  invitationToken = null,
  invitationEmail = "",
  onAuthenticate,
  onSuccess,
  onReturnHome,
}) {
  const [isRegistering, setIsRegistering] = useState(Boolean(invitationToken));
  const [modeTransition, setModeTransition] = useState("idle");
  const [modeStageHeight, setModeStageHeight] = useState(null);
  const [formData, setFormData] = useState({ email: invitationEmail, name: "", password: "" });
  const [errors, setErrors] = useState({});
  const [authError, setAuthError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modeStageRef = useRef(null);
  const transitionLocked = useRef(false);
  const transitionTimer = useRef(null);
  const stageResetTimer = useRef(null);
  const strength = passwordScore(formData.password);
  const isTransitioning = modeTransition !== "idle";

  useEffect(() => () => {
    window.clearTimeout(transitionTimer.current);
    window.clearTimeout(stageResetTimer.current);
  }, []);

  useEffect(() => {
    if (modeTransition !== "entering") return undefined;
    const nextHeight = modeStageRef.current?.scrollHeight;
    if (nextHeight) setModeStageHeight(nextHeight);
    const frame = window.requestAnimationFrame(() => setModeTransition("idle"));
    stageResetTimer.current = window.setTimeout(() => {
      setModeStageHeight(null);
      transitionLocked.current = false;
    }, 220);
    return () => window.cancelAnimationFrame(frame);
  }, [isRegistering, modeTransition]);

  const previousTransition = useRef(modeTransition);
  useEffect(() => {
    if (previousTransition.current === "entering" && modeTransition === "idle") {
      document.getElementById("auth-heading")?.focus({ preventScroll: true });
    }
    previousTransition.current = modeTransition;
  }, [modeTransition]);

  const changeField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: null }));
    setAuthError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setAuthError("");
    const nextErrors = {
      name: isRegistering ? validateName(formData.name) : null,
      email: validateEmail(formData.email),
      password: isRegistering ? validatePassword(formData.password) : (!formData.password ? "Password is required." : null),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setIsSubmitting(true);
    try {
      await onAuthenticate({
        isRegistering,
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        invitationToken,
      });
      onSuccess?.();
    } catch (error) {
      setAuthError(normalizeAuthError(error, isRegistering, invitationToken));
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    if (transitionLocked.current || isSubmitting || invitationToken) return;
    setErrors({});
    setAuthError("");
    transitionLocked.current = true;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setIsRegistering((current) => !current);
      transitionLocked.current = false;
      return;
    }

    const currentHeight = modeStageRef.current?.getBoundingClientRect().height;
    if (currentHeight) setModeStageHeight(currentHeight);
    document.activeElement?.blur?.();
    setModeTransition("exiting");
    transitionTimer.current = window.setTimeout(() => {
      setIsRegistering((current) => !current);
      setModeTransition("entering");
    }, 150);
  };

  const fieldError = (field) => errors[field] ? <p className="auth-field-error" id={`auth-${field}-error`}>{errors[field]}</p> : null;

  return (
    <main className="auth-page">
      <section className={`auth-story ${isRegistering ? "is-registering" : ""}`} aria-label="Care with clarity">
        <div className="auth-story-overlay" />
        <div className="auth-story-content">
          <button className="auth-brand" type="button" onClick={onReturnHome} aria-label="Hospot home">
            <Activity size={32} aria-hidden="true" /> <span>Hospot</span>
          </button>
          <div className="auth-story-copy">
            <p className="auth-eyebrow"><span /> A more connected care experience</p>
            <h1>Care, with a clearer next step.</h1>
            <p className="auth-story-description">Find the information and services you need, with Hospot alongside you.</p>
          </div>
          <p className="auth-story-footnote"><ShieldCheck size={16} aria-hidden="true" /> Your account is protected by secure session access.</p>
        </div>
      </section>

      <section className="auth-form-panel" aria-labelledby="auth-heading">
        <div className="auth-form-wrap">
          <button className="auth-mobile-brand" type="button" onClick={onReturnHome} aria-label="Hospot home">
            <Activity size={32} aria-hidden="true" /> <span>Hospot</span>
          </button>
          <div
            ref={modeStageRef}
            className={`auth-mode-stage ${modeTransition === "exiting" ? "is-exiting" : ""} ${modeTransition === "entering" ? "is-entering" : ""}`}
            data-mode={isRegistering ? "signup" : "login"}
            style={modeStageHeight ? { height: `${modeStageHeight}px` } : undefined}
            aria-hidden={isTransitioning}
          >
          <div className="auth-form-heading">
            <p className="auth-form-kicker">{invitationToken ? "Your invitation" : "Welcome to Hospot"}</p>
            <h2 id="auth-heading" tabIndex={-1}>{invitationToken ? "Complete your account" : isRegistering ? "Create your account" : "Welcome back"}</h2>
            <p>{invitationToken
              ? "Set a password to activate your invited account."
              : isRegistering
                ? "Create a secure patient account to get started."
                : "Sign in to continue to your Hospot account."}</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
            {isRegistering && <div className="auth-field">
              <label htmlFor="auth-name">Full name</label>
              <Input
                id="auth-name" name="name" type="text" autoComplete="name" autoCapitalize="words"
                placeholder="Your full name" value={formData.name} maxLength={120} required
                aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "auth-name-error" : undefined}
                onChange={(event) => changeField("name", event.target.value)}
              />
              {fieldError("name")}
            </div>}

            <div className="auth-field">
              <label htmlFor="auth-email">Email address</label>
              <Input
                id="auth-email" name="email" type="email" autoComplete="email" inputMode="email"
                placeholder="you@example.com" value={formData.email} readOnly={Boolean(invitationToken)} required
                aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "auth-email-error" : undefined}
                onChange={(event) => changeField("email", event.target.value)}
              />
              {invitationToken && <p className="auth-field-hint">This address is set by your invitation.</p>}
              {fieldError("email")}
            </div>

            <div className="auth-field">
              <div className="auth-label-row"><label htmlFor="auth-password">Password</label>{isRegistering && <span>12–128 characters</span>}</div>
              <div className="auth-password-wrap">
                <Input
                  id="auth-password" name="password" type={showPassword ? "text" : "password"}
                  autoComplete={isRegistering ? "new-password" : "current-password"}
                  placeholder={isRegistering ? "Create a secure password" : "Enter your password"}
                  value={formData.password} minLength={isRegistering ? 12 : undefined} maxLength={128} required
                  aria-invalid={Boolean(errors.password)} aria-describedby={[
                    errors.password ? "auth-password-error" : null,
                    isRegistering ? "auth-password-rules" : null,
                  ].filter(Boolean).join(" ") || undefined}
                  onChange={(event) => changeField("password", event.target.value)}
                />
                <button
                  className="auth-password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
              {fieldError("password")}
              {isRegistering && <div className="auth-password-guidance" id="auth-password-rules">
                <div className="auth-strength-heading"><span>Password strength</span><span>{strength === 5 ? "Strong" : strength >= 3 ? "Getting there" : "Build a strong password"}</span></div>
                <div className="auth-strength-track" role="progressbar" aria-label="Password requirement progress" aria-valuemin={0} aria-valuemax={5} aria-valuenow={strength}>
                  <span className={strength === 5 ? "is-complete" : ""} style={{ width: `${strength * 20}%` }} />
                </div>
                <ul className="auth-rule-list">
                  {PASSWORD_RULES.map(([key, label, matches]) => <li key={key} className={matches(formData.password) ? "is-met" : ""}>
                    <span aria-hidden="true">{matches(formData.password) ? "✓" : "·"}</span>{label}
                  </li>)}
                </ul>
              </div>}
            </div>

            {authError && <div className="auth-api-error" role="alert" aria-live="polite">{authError}</div>}

            <Button className="auth-submit" type="submit" disabled={isSubmitting} aria-live="polite">
              {isSubmitting ? <><span className="auth-spinner" aria-hidden="true" />{isRegistering ? "Creating account…" : "Signing in…"}</> : <>{isRegistering ? "Create account" : "Sign in"}<ArrowRight size={16} aria-hidden="true" /></>}
            </Button>

            {!invitationToken && <p className="auth-mode-switch">
              {isRegistering ? "Already have an account?" : "New to Hospot?"}{" "}
              <button type="button" onClick={toggleMode} disabled={isTransitioning || isSubmitting}>{isRegistering ? "Sign in" : "Create a patient account"}</button>
            </p>}
          </form>
          </div>

          <button className="auth-back-link" type="button" onClick={onReturnHome}>
            <ArrowLeft size={15} aria-hidden="true" /> Back to Hospot
          </button>
          <p className="auth-privacy-note">Your account details are handled securely. Public sign up creates a patient account.</p>
        </div>
      </section>
    </main>
  );
}
