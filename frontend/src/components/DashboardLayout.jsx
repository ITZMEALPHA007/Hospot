import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Activity, ArrowRight, Bed, Building2, CheckCircle2, ChevronRight,
  ClipboardList, FileText, LogOut, Menu, Package, PanelLeftClose,
  PanelLeftOpen, Pill, Settings2, Shield, ShoppingBag, Stethoscope,
  UserRound, Users, X,
} from "lucide-react";
import { API, ensureCsrf } from "../lib/authClient";
import { BookingCreatePage, HospitalDiscoveryPage, PatientBookingsPage } from "./PatientHospitalPages";
import { MedicineCataloguePage } from "./PatientMedicinePages";
import PatientProfilePage from "./PatientProfilePage";
import ProfileAvatar from "./ProfileAvatar";
import "./dashboard.css";

const ROLE_CONFIG = {
  PATIENT: {
    slug: "patient", label: "Patient", workspace: "Care dashboard", theme: "patient",
    icon: HeartIcon,
    navigation: [
      ["overview", "Overview", Activity], ["hospitals", "Hospitals", Building2],
      ["bookings", "My bookings", ClipboardList], ["medicines", "Medicines", Pill],
      ["cart", "Cart", ShoppingBag, "/cart"], ["orders", "My orders", Package, "/orders"],
      ["tracking", "Order tracking", ClipboardList], ["prescriptions", "Prescriptions", FileText],
      ["profile", "Profile", UserRound],
    ],
  },
  DOCTOR: {
    slug: "doctor", label: "Doctor", workspace: "Clinical workspace", theme: "doctor",
    icon: Stethoscope,
    navigation: [
      ["overview", "Overview", Activity], ["profile", "Profile", UserRound],
      ["hospital", "Hospital association", Building2], ["patients", "Patient workflows", Users],
      ["prescriptions", "Prescriptions", FileText],
    ],
  },
  HOSPITAL_ADMIN: {
    slug: "hospital-admin", label: "Hospital Admin", workspace: "Hospital operations", theme: "hospital",
    icon: Building2,
    navigation: [
      ["overview", "Overview", Activity], ["hospital", "Hospital information", Building2],
      ["beds", "Bed availability", Bed], ["bookings", "Bookings", ClipboardList],
      ["doctors", "Doctors", Stethoscope], ["orders", "Medicine orders", Package],
    ],
  },
  PLATFORM_ADMIN: {
    slug: "platform-admin", label: "Platform Admin", workspace: "Platform control", theme: "platform",
    icon: Shield,
    navigation: [
      ["overview", "Overview", Activity], ["hospitals", "Hospitals", Building2],
      ["doctors", "Doctors", Stethoscope], ["accounts", "Accounts & invitations", Users],
      ["medicines", "Medicine catalogue", Pill], ["inventory", "Inventory", Settings2],
      ["orders", "Platform orders", Package],
    ],
  },
};

function HeartIcon(props) {
  return <Activity {...props} />;
}

function displayName(name = "") {
  return name.trim().split(/\s+/)[0] || "there";
}

function PlaceholderWorkspace({ title, description, availability = "Not connected yet" }) {
  return (
    <section className="dashboard-panel dashboard-placeholder" aria-labelledby="workspace-title">
      <div className="dashboard-placeholder-mark"><Settings2 size={19} aria-hidden="true" /></div>
      <div>
        <span className="dashboard-eyebrow">{availability}</span>
        <h2 id="workspace-title">{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}

function ProfileWorkspace({ user, onNameChange }) {
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => setName(user?.name || ""), [user?.name]);

  const saveProfile = async (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setFeedback({ type: "error", text: "Enter a name with at least two characters." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await ensureCsrf();
      const response = await axios.patch(`${API}/auth/me`, { name: trimmedName });
      setName(response.data.name);
      onNameChange(response.data.name);
      setFeedback({ type: "success", text: "Your profile was updated." });
    } catch (error) {
      setFeedback({ type: "error", text: error.response?.data?.detail || "Profile could not be saved. Try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="dashboard-panel dashboard-profile" aria-labelledby="profile-title">
      <div className="dashboard-section-heading">
        <span className="dashboard-eyebrow">Account settings</span>
        <h2 id="profile-title">Your profile</h2>
        <p>Update the basic account details associated with your secure Hospot session.</p>
      </div>
      <form onSubmit={saveProfile} className="dashboard-profile-form">
        <label htmlFor="dashboard-name">Full name</label>
        <input id="dashboard-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
        <label htmlFor="dashboard-email">Email address</label>
        <input id="dashboard-email" value={user?.email || ""} readOnly aria-describedby="email-help" />
        <p id="email-help" className="dashboard-field-hint">Email is managed by your account and cannot be changed here.</p>
        <div className="dashboard-profile-footer">
          <span role={feedback?.type === "error" ? "alert" : "status"} className={`dashboard-feedback ${feedback?.type || ""}`}>
            {feedback?.text || "Only your name can be edited from this screen."}
          </span>
          <button className="dashboard-primary-button" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}

function QuickLink({ icon: Icon, title, description, onClick, label = "Open" }) {
  return (
    <button type="button" className="dashboard-quick-link" onClick={onClick}>
      <span className="dashboard-quick-icon"><Icon size={19} aria-hidden="true" /></span>
      <span className="dashboard-quick-copy"><strong>{title}</strong><span>{description}</span></span>
      <span className="dashboard-quick-action">{label}<ArrowRight size={15} aria-hidden="true" /></span>
    </button>
  );
}

function QuickActionsPanel({ title, actions, onNavigate }) {
  return (
    <section className="dashboard-panel dashboard-action-panel">
      <div className="dashboard-section-heading"><span className="dashboard-eyebrow">Quick actions</span><h2>{title}</h2></div>
      <div className="dashboard-quick-list">
        {actions.map(([key, label, description, Icon]) => (
          <QuickLink key={key} icon={Icon} title={label} description={description} onClick={() => onNavigate(key)} />
        ))}
      </div>
    </section>
  );
}

function Overview({ role, user, onNavigate }) {
  const name = displayName(user?.name);
  if (role === "PATIENT") {
    return (
      <>
        <section className="dashboard-welcome dashboard-welcome-patient">
          <div>
            <span className="dashboard-eyebrow">Your care, in one place</span>
            <h2>Good to see you, {name}.</h2>
            <p>Find a hospital, browse medicines, or pick up where you left off with your orders.</p>
          </div>
          <div className="dashboard-welcome-symbol"><Activity size={31} aria-hidden="true" /></div>
        </section>
        <div className="dashboard-content-grid">
          <section className="dashboard-panel dashboard-action-panel">
            <div className="dashboard-section-heading"><span className="dashboard-eyebrow">Get started</span><h2>What do you need today?</h2></div>
            <div className="dashboard-quick-list">
              <QuickLink icon={Building2} title="Find Hospitals" description="Search hospitals, compare bed categories, and view hospital details." onClick={() => onNavigate("hospitals")} />
              <QuickLink icon={ClipboardList} title="My bookings" description="Review booking status or cancel an eligible request." onClick={() => onNavigate("bookings")} />
              <QuickLink icon={Pill} title="Browse medicines" description="Search the active medicine catalogue." onClick={() => onNavigate("medicines")} />
              <QuickLink icon={ShoppingBag} title="Open your cart" description="Review items before checkout." onClick={() => onNavigate("cart")} />
              <QuickLink icon={Package} title="View your orders" description="Review order status and pickup details." onClick={() => onNavigate("orders")} />
            </div>
          </section>
          <aside className="dashboard-panel dashboard-note-panel">
            <span className="dashboard-note-icon"><CheckCircle2 size={18} aria-hidden="true" /></span>
            <span className="dashboard-eyebrow">Secure access</span>
            <h2>Your account is connected</h2>
            <p>Hospot uses your authenticated session to show your own cart, bookings, and orders.</p>
          </aside>
        </div>
      </>
    );
  }

  if (role === "DOCTOR") {
    return (
      <>
        <section className="dashboard-welcome dashboard-welcome-doctor">
          <div><span className="dashboard-eyebrow">Clinical workspace</span><h2>Welcome, Dr. {name}.</h2><p>Your account is associated with the hospital shown below.</p></div>
          <div className="dashboard-welcome-symbol"><Stethoscope size={31} aria-hidden="true" /></div>
        </section>
        <section className="dashboard-panel dashboard-association-panel">
          <div className="dashboard-association-icon"><Building2 size={20} aria-hidden="true" /></div>
          <div><span className="dashboard-eyebrow">Hospital association</span><h2>{user?.hospitalId ? "Assigned hospital" : "No hospital assigned"}</h2><p>{user?.hospitalId || "Ask a platform administrator to send an invitation linked to a hospital."}</p></div>
        </section>
        <QuickActionsPanel title="Your workspace" onNavigate={onNavigate} actions={[
          ["profile", "Review your profile", "Update your basic account details.", UserRound],
          ["hospital", "Hospital association", "View the hospital linked to your account.", Building2],
          ["prescriptions", "Prescriptions", "See the upcoming prescription workspace.", FileText],
        ]} />
        <PlaceholderWorkspace title="Patient and clinical workflows are not enabled" description="The current backend does not provide doctor-authorized patient records or booking access. No patient information or prescription workflow is shown here." availability="Access boundary" />
      </>
    );
  }

  if (role === "HOSPITAL_ADMIN") {
    return (
      <>
        <section className="dashboard-welcome dashboard-welcome-hospital">
          <div><span className="dashboard-eyebrow">Hospital operations</span><h2>Welcome, {name}.</h2><p>Manage the operational workspace for your assigned hospital.</p></div>
          <div className="dashboard-welcome-symbol"><Building2 size={31} aria-hidden="true" /></div>
        </section>
        <section className="dashboard-panel dashboard-association-panel">
          <div className="dashboard-association-icon"><Shield size={20} aria-hidden="true" /></div>
          <div><span className="dashboard-eyebrow">Scoped access</span><h2>{user?.hospitalId ? "Assigned hospital" : "Hospital assignment needed"}</h2><p>{user?.hospitalId || "This account has no hospital assignment."}</p></div>
          <span className="dashboard-scope-badge">Hospital only</span>
        </section>
        <QuickActionsPanel title="Hospital operations" onNavigate={onNavigate} actions={[
          ["hospital", "Hospital information", "Open your hospital workspace.", Building2],
          ["beds", "Bed availability", "Open bed inventory controls.", Bed],
          ["bookings", "Booking management", "Open hospital booking status views.", ClipboardList],
          ["doctors", "Doctor management", "Open the hospital doctor workspace.", Stethoscope],
        ]} />
        <PlaceholderWorkspace title="Operational data is ready for integration" description="The backend supports hospital details, bed availability, bookings, and doctor management. These dashboard views do not show fabricated counts; the management screens will be connected in a later integration milestone." availability="Dashboard connection pending" />
      </>
    );
  }

  return (
    <>
      <section className="dashboard-welcome dashboard-welcome-platform">
        <div><span className="dashboard-eyebrow">Platform control</span><h2>Welcome, {name}.</h2><p>Use the role-specific workspace to oversee Hospot configuration and operations.</p></div>
        <div className="dashboard-welcome-symbol"><Shield size={31} aria-hidden="true" /></div>
      </section>
      <QuickActionsPanel title="Platform workspaces" onNavigate={onNavigate} actions={[
        ["hospitals", "Hospitals", "Open platform hospital management.", Building2],
        ["doctors", "Doctors", "Open doctor management.", Stethoscope],
        ["accounts", "Accounts and invitations", "Open invitation management.", Users],
        ["medicines", "Medicine catalogue", "Open the catalogue administration workspace.", Pill],
        ["inventory", "Medicine inventory", "Open global inventory management.", Settings2],
        ["orders", "Platform orders", "Open platform order management.", Package],
      ]} />
      <PlaceholderWorkspace title="Platform workspaces are not connected yet" description="Hospital, doctor, invitation, medicine, inventory, and order APIs exist. This milestone provides their navigation and access boundaries; it does not display invented platform metrics or modify records." availability="Dashboard connection pending" />
    </>
  );
}

function SectionContent({ role, section, user, onNameChange, onProfileUpdate, onNavigate }) {
  if (section === "overview") return <Overview role={role} user={user} onNavigate={onNavigate} />;
  if (section === "profile") return role === "PATIENT"
    ? <PatientProfilePage user={user} onProfileUpdate={onProfileUpdate} />
    : <ProfileWorkspace user={user} onNameChange={onNameChange} />;
  if (["PATIENT", "DOCTOR"].includes(role) && section === "prescriptions") {
    return <PlaceholderWorkspace title="Prescription management is coming soon" description="Prescription viewing and management are not available yet. This page does not upload, verify, approve, or create prescription records." availability="Coming soon" />;
  }

  if (role === "PATIENT" && section === "hospitals") {
    return <HospitalDiscoveryPage />;
  }
  if (role === "PATIENT" && section === "bed-booking") {
    return <HospitalDiscoveryPage bookingMode />;
  }
  if (role === "PATIENT" && section === "bookings") {
    return <PatientBookingsPage />;
  }
  if (role === "PATIENT" && section === "medicines") {
    return <MedicineCataloguePage />;
  }
  if (role === "PATIENT" && section === "tracking") {
    return <section className="dashboard-panel dashboard-section-panel"><span className="dashboard-eyebrow">Order status</span><h2>Follow your order</h2><p>Your orders page displays the backend status. Third-party courier tracking is not available, and Hospot does not currently provide live shipment updates.</p><button className="dashboard-primary-button" onClick={() => onNavigate("/orders")}>View my orders <ArrowRight size={16} /></button></section>;
  }

  const sections = {
    DOCTOR: {
      hospital: ["Hospital association", user?.hospitalId ? `Your account is associated with hospital ${user.hospitalId}.` : "No hospital is assigned to this account.", "Session profile"],
      patients: ["Patient workflows are unavailable", "The backend does not currently expose doctor-authorized patient or booking records. Clinical data is intentionally not displayed.", "Not available"],
    },
    HOSPITAL_ADMIN: {
      hospital: ["Hospital information", "Hospital details can be managed through the backend API. The dashboard editor is not connected in this milestone.", "UI connection pending"],
      beds: ["Bed availability", "The backend supports bed availability updates for your assigned hospital. No live counts are shown until this screen is connected.", "UI connection pending"],
      bookings: ["Booking management", "The backend returns bookings for your assigned hospital. This view does not yet load or change bookings.", "UI connection pending"],
      doctors: ["Doctor management", "The backend supports hospital-scoped doctor listing and deactivation. This view does not yet load or change doctor accounts.", "UI connection pending"],
      orders: ["Medicine orders", "Hospital-specific medicine inventory and fulfilment are not available. Global medicine stock is not assigned to this hospital.", "Not supported by current inventory model"],
    },
    PLATFORM_ADMIN: {
      hospitals: ["Hospital management", "The backend supports platform-wide hospital listing, creation, updates, and deactivation. The management interface is not connected yet.", "UI connection pending"],
      doctors: ["Doctor management", "The backend supports global doctor listing and account deactivation. The management interface is not connected yet.", "UI connection pending"],
      accounts: ["Accounts and invitations", "Invitation creation and redemption are available in the backend. Invite delivery is manual; no account management table is connected here.", "UI connection pending"],
      medicines: ["Medicine catalogue", "The backend supports platform-admin catalogue operations. The management interface is not connected yet.", "UI connection pending"],
      inventory: ["Global medicine inventory", "Current stock is global rather than assigned to hospitals. Stock management is not connected to this dashboard.", "Global stock model"],
      orders: ["Platform orders", "The backend supports platform-wide order viewing and status transitions. The management interface is not connected yet.", "UI connection pending"],
    },
  };
  const content = sections[role]?.[section];
  if (!content) return <PlaceholderWorkspace title="This workspace is not available" description="Choose an item from your role navigation to continue." availability="No page for this section" />;
  return <PlaceholderWorkspace title={content[0]} description={content[1]} availability={content[2]} />;
}

export default function DashboardLayout({ role, section = "overview", user, onLogout, onNameChange, onProfileUpdate, children }) {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => Boolean(window.matchMedia && window.matchMedia("(max-width: 760px)").matches));
  const menuButtonRef = useRef(null);
  const closeButtonRef = useRef(null);
  const mobileSidebarWasOpen = useRef(false);
  const config = ROLE_CONFIG[role];
  const Icon = config.icon;
  const activeItem = config.navigation.find(([key]) => key === section);
  const title = activeItem?.[1] || "Overview";

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const updateViewportMode = (event) => setIsMobileViewport(event.matches);
    setIsMobileViewport(mediaQuery.matches);
    if (mediaQuery.addEventListener) mediaQuery.addEventListener("change", updateViewportMode);
    else mediaQuery.addListener(updateViewportMode);
    return () => {
      if (mediaQuery.removeEventListener) mediaQuery.removeEventListener("change", updateViewportMode);
      else mediaQuery.removeListener(updateViewportMode);
    };
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) {
      if (mobileSidebarWasOpen.current) menuButtonRef.current?.focus();
      mobileSidebarWasOpen.current = false;
      return undefined;
    }

    mobileSidebarWasOpen.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileSidebarOpen]);

  const goToItem = (item) => {
    const [, , , href] = item;
    navigate(href || `/dashboard/${config.slug}/${item[0]}`);
    setMobileSidebarOpen(false);
  };

  const goToDestination = (destination) => {
    if (destination.startsWith("/")) {
      navigate(destination);
      setMobileSidebarOpen(false);
      return;
    }
    const item = config.navigation.find(([key]) => key === destination);
    if (item) goToItem(item);
  };

  return (
    <div className={`dashboard-app dashboard-theme-${config.theme}`}>
      {mobileSidebarOpen && <button type="button" className="dashboard-mobile-backdrop" aria-label="Close navigation menu" onClick={() => setMobileSidebarOpen(false)} />}
      <aside id="dashboard-sidebar" className={`dashboard-sidebar${sidebarCollapsed ? " is-collapsed" : ""}${mobileSidebarOpen ? " is-mobile-open" : ""}`} aria-label={`${config.label} navigation`} aria-hidden={isMobileViewport && !mobileSidebarOpen ? "true" : undefined} inert={isMobileViewport && !mobileSidebarOpen}>
        <div className="dashboard-sidebar-header">
          <button type="button" className="dashboard-brand" onClick={() => goToItem(["overview"])} aria-label="Hospot dashboard home">
            <span className="dashboard-brand-mark"><Activity size={20} aria-hidden="true" /></span>
            <span className="dashboard-brand-copy">hospot<span className="dashboard-brand-dot">.</span><small>{config.workspace}</small></span>
          </button>
          <button type="button" className="dashboard-collapse-button" aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed} aria-controls="dashboard-navigation" title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}>
            {sidebarCollapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
          </button>
          <button ref={closeButtonRef} type="button" className="dashboard-mobile-close" aria-label="Close navigation menu" onClick={() => setMobileSidebarOpen(false)}><X size={19} aria-hidden="true" /></button>
        </div>
        <div className="dashboard-role-label" data-tooltip={config.label} title={sidebarCollapsed ? config.label : undefined}><Icon size={14} aria-hidden="true" /><span>{config.label}</span></div>
        <nav id="dashboard-navigation" className="dashboard-nav">
          <span className="dashboard-nav-heading">WORKSPACE</span>
          {config.navigation.map(([key, label, ItemIcon, href]) => {
            const active = section === key;
            return (
              <button key={key} type="button" className={`dashboard-nav-item ${active ? "is-active" : ""}`} aria-label={label} title={sidebarCollapsed ? label : undefined} data-tooltip={label} aria-current={active ? "page" : undefined} onClick={() => goToItem([key, label, ItemIcon, href])}>
                <ItemIcon size={18} aria-hidden="true" /><span>{label}</span>{active && <ChevronRight className="dashboard-nav-chevron" size={15} aria-hidden="true" />}
              </button>
            );
          })}
        </nav>
        <div className="dashboard-sidebar-footer">
          <ProfileAvatar user={user} className="dashboard-user-avatar" />
          <div className="dashboard-user-copy"><strong>{user?.name}</strong><span>{user?.email}</span></div>
          <button type="button" className="dashboard-logout-icon" onClick={onLogout} aria-label="Log out" title="Log out"><LogOut size={17} /></button>
        </div>
      </aside>

      <div className="dashboard-main-column">
        <header className="dashboard-topbar">
          <div className="dashboard-topbar-title"><button ref={menuButtonRef} type="button" className="dashboard-menu-button" aria-label="Open navigation menu" aria-expanded={mobileSidebarOpen} aria-controls="dashboard-sidebar" onClick={() => setMobileSidebarOpen(true)}><Menu size={19} aria-hidden="true" /></button><div><span className="dashboard-topbar-kicker">{config.workspace}</span><h1>{title}</h1></div></div>
          <div className="dashboard-topbar-actions">
            <div className="dashboard-topbar-user"><span className="dashboard-online-dot" aria-hidden="true" /><span>{config.label} account</span><ProfileAvatar user={user} className="dashboard-user-avatar dashboard-user-avatar-small" /></div>
            <button type="button" className="dashboard-topbar-logout" onClick={onLogout}>Sign out</button>
          </div>
        </header>
        <main className="dashboard-main" key={`${role}-${section}`}>
          {children || <SectionContent role={role} section={section} user={user} onNameChange={onNameChange} onProfileUpdate={onProfileUpdate} onNavigate={goToDestination} />}
        </main>
        <footer className="dashboard-footer"><span>Hospot healthcare workspace</span><span>Secure, role-based access</span></footer>
      </div>

      <nav className="dashboard-mobile-nav" aria-label="Mobile workspace navigation">
        {config.navigation.map(([key, label, ItemIcon, href]) => {
          const active = section === key;
          return <button key={key} type="button" aria-current={active ? "page" : undefined} onClick={() => goToItem([key, label, ItemIcon, href])}><ItemIcon size={18} aria-hidden="true" /><span>{label}</span></button>;
        })}
      </nav>
    </div>
  );
}
