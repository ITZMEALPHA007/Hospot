import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Menu, X } from "lucide-react";

function BrandMark() {
  return (
    <span className="site-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 28 28" focusable="false">
        <path d="M6 5v18M22 5v18M6 14h16" />
        <circle cx="6" cy="5" r="2" />
        <circle cx="22" cy="23" r="2" />
      </svg>
    </span>
  );
}

export default function SiteHeader({
  mode = "public",
  isAuthenticated = false,
  user,
  showHomeButton = false,
  onHome,
  onLogout,
  onLogin,
  onBrand,
  onGetStarted,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const publicLinks = [
    ["Home", "#top"],
    ["For patients", "#patients"],
    ["For doctors", "#doctors"],
    ["For hospitals", "#hospitals"],
  ];

  return (
    <header className={`site-header ${mode === "app" ? "site-header-app" : ""}`}>
      <div className="site-header-inner">
        {mode === "public" ? (
          <a className="site-brand" href="#top" aria-label="Hospot home" onClick={closeMenu}>
            <BrandMark /><span>hospot<span className="site-brand-period">.</span></span>
          </a>
        ) : (
          <button className="site-brand" type="button" onClick={onBrand} aria-label="Hospot home">
            <span className="site-brand-mark site-brand-mark-legacy"><Activity size={32} aria-hidden="true" /></span>
            <span>Hospot</span>
          </button>
        )}

        {mode === "public" ? (
          <>
            <nav className={`site-public-nav ${menuOpen ? "is-open" : ""}`} id="public-navigation" aria-label="Main navigation">
              {publicLinks.map(([label, href]) => <a key={href} href={href} onClick={closeMenu}>{label}</a>)}
              <div className="site-mobile-actions">
                <Link className="site-mobile-login" to="/login" onClick={closeMenu}>Login</Link>
                <Link className="site-button site-button-primary" to="/login" onClick={closeMenu}>Get started</Link>
              </div>
            </nav>
            <div className="site-header-actions">
              <Link className="site-login-link" to="/login">Login</Link>
              <Link className="site-button site-button-primary site-header-cta" to="/login">Get started</Link>
            </div>
            <button
              type="button"
              className="site-menu-toggle"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={menuOpen}
              aria-controls="public-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </>
        ) : (
          <div className="site-app-actions">
            {isAuthenticated ? <>
              {showHomeButton && <button type="button" className="site-app-home" onClick={onHome}>Home</button>}
              <span className="site-app-welcome">Welcome, {user?.name}</span>
              <button type="button" className="site-app-logout" onClick={onLogout}>Logout</button>
            </> : <button type="button" className="site-app-login" onClick={onLogin}>Login</button>}
          </div>
        )}
      </div>
    </header>
  );
}
