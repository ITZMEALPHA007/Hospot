import React, { useLayoutEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import SiteHeader from "./SiteHeader";
import "./landing-page.css";

function useScrollReveal() {
  const pageRef = useRef(null);

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page || !("IntersectionObserver" in window) || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const targets = Array.from(page.querySelectorAll("[data-reveal]"));
    if (!targets.length) return undefined;

    const exitTimers = new Map();
    let observerFallbackTimer;
    let observer;
    const initializedTargets = new Set();
    const makeVisible = () => targets.forEach((target) => {
      target.classList.remove("landing-reveal-exiting");
      target.classList.add("landing-revealed");
    });
    const clearExitTimer = (target) => {
      const timer = exitTimers.get(target);
      if (timer) window.clearTimeout(timer);
      exitTimers.delete(target);
    };

    try {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const target = entry.target;
          initializedTargets.add(target);
          clearExitTimer(target);
          if (entry.isIntersecting) {
            target.classList.remove("landing-reveal-exiting");
            target.classList.add("landing-revealed");
          } else if (target.classList.contains("landing-revealed")) {
            const timer = window.setTimeout(() => {
              exitTimers.delete(target);
              target.classList.remove("landing-revealed");
              target.classList.add("landing-reveal-exiting");
            }, 140);
            exitTimers.set(target, timer);
          }
        });
        if (initializedTargets.size === targets.length) window.clearTimeout(observerFallbackTimer);
      }, { threshold: 0.01, rootMargin: "0px 0px -48px 0px" });

      targets.forEach((target) => {
        const bounds = target.getBoundingClientRect();
        const initiallyVisible = bounds.bottom > 0 && bounds.top < window.innerHeight
          && bounds.right > 0 && bounds.left < window.innerWidth;
        target.classList.add("landing-reveal-ready");
        if (initiallyVisible) {
          target.classList.add("landing-revealed");
        }
        observer.observe(target);
      });
      observerFallbackTimer = window.setTimeout(() => {
        if (initializedTargets.size === targets.length) return;
        observer?.disconnect();
        makeVisible();
      }, 2000);
    } catch (error) {
      observer?.disconnect();
      window.clearTimeout(observerFallbackTimer);
      makeVisible();
    }

    return () => {
      observer?.disconnect();
      window.clearTimeout(observerFallbackTimer);
      exitTimers.forEach((timer) => window.clearTimeout(timer));
      targets.forEach((target) => target.classList.remove("landing-reveal-ready", "landing-revealed"));
      targets.forEach((target) => target.classList.remove("landing-reveal-exiting"));
    };
  }, []);

  return pageRef;
}

function HeroPhotograph() {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <figure className={`landing-hero-photo ${imageFailed ? "is-failed" : ""}`} data-reveal>
      {!imageFailed && <img src="/images/landing-hero.webp" alt="A physician speaking with a patient during a clinic consultation" onError={() => setImageFailed(true)} />}
    </figure>
  );
}

function SectionMarker({ number, children }) {
  return <div className="landing-section-marker"><span>{number}</span><span>{children}</span></div>;
}

export default function LandingPage({ onGetStarted, onLogin }) {
  const pageRef = useScrollReveal();
  const features = [
    ["Hospital discovery", "Explore hospital information and bed categories in one patient workspace."],
    ["Bed requests", "Send a reservation request and follow its status as the hospital reviews it."],
    ["Medicine services", "Browse the medicine catalogue, manage a cart, and review order status."],
  ];

  return (
    <div className="landing-page" id="top" ref={pageRef}>
      <SiteHeader mode="public" />
      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-inner">
            <div className="landing-hero-copy" data-reveal>
              <h1 id="landing-title">Finding care should feel <em>clearer.</em></h1>
              <p className="landing-hero-description">Hospot brings hospital discovery, bed requests and medicine services into one considered patient experience.</p>
              <div className="landing-hero-actions">
                <button type="button" className="site-button site-button-primary landing-primary-action" onClick={onGetStarted}>Get started <ArrowUpRight size={16} aria-hidden="true" /></button>
                <a className="landing-secondary-action" href="#patients">Explore Hospot <ArrowDownRight size={16} aria-hidden="true" /></a>
              </div>
              <div className="landing-hero-note"><span className="landing-note-rule" />Patient-first access to hospital and medicine services.</div>
            </div>
            <HeroPhotograph />
          </div>
        </section>

        <section className="landing-intro" id="patients" aria-labelledby="patient-section-title">
          <div className="landing-content-width landing-intro-grid" data-reveal>
            <SectionMarker number="01">For patients</SectionMarker>
            <div className="landing-intro-main">
              <h2 id="patient-section-title">A more considered way to find your next step.</h2>
              <p>When care feels urgent, finding the right place matters. Hospot helps patients explore hospitals, review available bed categories, and submit a request for hospital review.</p>
              <a className="landing-text-link" href="/login" onClick={(event) => { event.preventDefault(); onGetStarted(); }}>Explore patient access <ArrowRight size={16} aria-hidden="true" /></a>
            </div>
            <div className="landing-patient-side-note"><span className="landing-side-note-rule" /><p>One patient workspace for hospital discovery, booking requests and medicine services.</p></div>
          </div>
        </section>

        <section className="landing-capabilities" aria-labelledby="capabilities-title">
          <div className="landing-content-width">
            <div className="landing-capabilities-heading">
              <div data-reveal><SectionMarker number="02">What you can do</SectionMarker><h2 id="capabilities-title">Useful tools, built around real needs.</h2></div>
              <p data-reveal>Start with practical ways to find care and manage the next step.</p>
            </div>
            <div className="landing-feature-list">
              {features.map(([title, description], index) => (
                <article className="landing-feature-row" data-reveal key={title} style={{ "--reveal-delay": `${index * 130}ms` }}>
                  <span className="landing-feature-number">0{index + 1}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <Check className="landing-feature-check" size={17} aria-hidden="true" />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-audiences landing-audiences-dark" id="doctors" aria-labelledby="doctor-section-title">
          <div className="landing-content-width landing-audience-grid" data-reveal>
            <SectionMarker number="03">For doctors</SectionMarker>
            <div><p className="landing-audience-overline">A professional home, with room to grow</p><h2 id="doctor-section-title">A connected workspace for the people behind care.</h2><p className="landing-audience-copy">Doctor accounts can maintain a professional profile and view their hospital association. Patient records and clinical workflows are not available in the current product yet.</p></div>
            <div className="landing-audience-aside"><span className="landing-audience-aside-number">01</span><p>Professional profile<br />Hospital association</p></div>
          </div>
        </section>

        <section className="landing-audiences landing-audiences-hospital" id="hospitals" aria-labelledby="hospital-section-title">
          <div className="landing-content-width landing-hospital-grid" data-reveal>
            <SectionMarker number="04">For hospitals</SectionMarker>
            <div className="landing-hospital-main"><p className="landing-audience-overline">Built for clearer operations</p><h2 id="hospital-section-title">Keep essential hospital information in view.</h2><p>Hospot supports hospital details, bed inventory, booking review and doctor management through scoped backend services. The hospital administration screens are still being connected to the dashboard.</p></div>
            <div className="landing-hospital-list" aria-label="Supported hospital operations">
              <div><span>01</span><strong>Hospital information</strong></div>
              <div><span>02</span><strong>Bed availability</strong></div>
              <div><span>03</span><strong>Booking workflows</strong></div>
              <div><span>04</span><strong>Doctor management</strong></div>
              <small>Dashboard integration in progress</small>
            </div>
          </div>
        </section>

        <section className="landing-closing" aria-labelledby="closing-title">
          <div className="landing-content-width landing-closing-inner" data-reveal>
            <div><SectionMarker number="05">Take the next step</SectionMarker><h2 id="closing-title">Find your way to care with Hospot.</h2></div>
            <div className="landing-closing-action"><p>Sign in or create a patient account to explore the services available today.</p><button type="button" className="site-button site-button-light" onClick={onGetStarted}>Continue to Hospot <ArrowUpRight size={16} aria-hidden="true" /></button></div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-content-width landing-footer-main">
          <a className="site-brand landing-footer-brand" href="#top" aria-label="Hospot home"><span className="site-brand-mark"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="M6 5v18M22 5v18M6 14h16" /><circle cx="6" cy="5" r="2" /><circle cx="22" cy="23" r="2" /></svg></span><span>hospot<span className="site-brand-period">.</span></span></a>
          <p>Making care access easier to navigate.</p>
          <nav aria-label="Footer navigation"><a href="#patients">Patients</a><a href="#doctors">Doctors</a><a href="#hospitals">Hospitals</a><a href="/login" onClick={(event) => { event.preventDefault(); onLogin(); }}>Login</a></nav>
          <a className="landing-footer-start" href="/login" onClick={(event) => { event.preventDefault(); onGetStarted(); }}>Get started <ArrowRight size={14} aria-hidden="true" /></a>
        </div>
        <div className="landing-content-width landing-footer-bottom"><span>Hospot healthcare workspace</span><span>© {new Date().getFullYear()} Hospot</span></div>
      </footer>
    </div>
  );
}
