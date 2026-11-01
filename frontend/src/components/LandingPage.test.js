import React, { act } from "react";
import { createRoot } from "react-dom/client";
import LandingPage from "./LandingPage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("react-router-dom", () => ({
  Link: ({ to, ...props }) => require("react").createElement("a", { href: to, ...props }),
}), { virtual: true });

function renderLanding() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onGetStarted = jest.fn();
  const onLogin = jest.fn();
  act(() => root.render(<LandingPage onGetStarted={onGetStarted} onLogin={onLogin} />));
  return { container, root, onGetStarted, onLogin };
}

function click(element) {
  act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
}

function cleanup(root, container) {
  act(() => root.unmount());
  container.remove();
}

describe("Hospot public landing page", () => {
  it("presents patient, doctor, and hospital sections with a supported feature set", () => {
    const { container, root } = renderLanding();
    expect(container.textContent).not.toContain("A more connected way to find care");
    expect(container.textContent).not.toContain("Care begins with a conversation.");
    expect(container.textContent).not.toContain("Care access");
    expect(container.querySelector(".landing-hero-index")).toBeNull();
    expect(container.querySelector(".landing-hero-photo figcaption")).toBeNull();
    expect(container.querySelector("#patients")).not.toBeNull();
    expect(container.querySelector("#doctors")).not.toBeNull();
    expect(container.querySelector("#hospitals")).not.toBeNull();
    expect(container.textContent).toContain("bed requests");
    expect(container.textContent).toContain("not available in the current product yet");
    expect(container.textContent).toContain("Dashboard integration in progress");
    cleanup(root, container);
  });

  it("routes Get started and Login actions through the existing login route handlers", () => {
    const { container, root, onGetStarted, onLogin } = renderLanding();
    click(container.querySelector(".landing-primary-action"));
    click(container.querySelector(".landing-footer-main nav a[href='/login']"));
    expect(onGetStarted).toHaveBeenCalledTimes(1);
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".site-header-cta").getAttribute("href")).toBe("/login");
    cleanup(root, container);
  });

  it("opens and closes the accessible mobile navigation when a section is selected", () => {
    const { container, root } = renderLanding();
    const toggle = container.querySelector(".site-menu-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    click(container.querySelector(".site-public-nav a[href='#patients']"));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    cleanup(root, container);
  });

  it("keeps the hero readable when its photograph fails to load", () => {
    const { container, root } = renderLanding();
    const image = container.querySelector(".landing-hero-photo img");
    expect(image.getAttribute("alt")).toContain("physician");
    act(() => image.dispatchEvent(new Event("error")));
    expect(container.querySelector(".landing-hero-photo").classList.contains("is-failed")).toBe(true);
    expect(container.querySelector(".landing-hero-photo img")).toBeNull();
    cleanup(root, container);
  });

  it("reveals, exits, and replays observed groups while preserving accessibility fallbacks", async () => {
    const originalObserver = window.IntersectionObserver;
    const originalMatchMedia = window.matchMedia;
    const originalBounds = HTMLElement.prototype.getBoundingClientRect;
    let observerInstance;
    window.matchMedia = jest.fn(() => ({ matches: false }));
    window.IntersectionObserver = class {
      constructor(callback) { this.callback = callback; observerInstance = this; }
      observe() {}
      disconnect() {}
    };
    HTMLElement.prototype.getBoundingClientRect = function getBounds() {
      if (this.classList?.contains("landing-feature-row")) {
        return { top: 900, bottom: 1000, left: 20, right: 600, width: 580, height: 100 };
      }
      return { top: 40, bottom: 180, left: 20, right: 600, width: 580, height: 140 };
    };
    const first = renderLanding();
    const feature = first.container.querySelector(".landing-feature-row");
    expect(feature.classList.contains("landing-reveal-ready")).toBe(true);
    expect(first.container.querySelectorAll(".landing-feature-row")[1].style.getPropertyValue("--reveal-delay")).toBe("130ms");
    expect(first.container.querySelectorAll(".landing-feature-row")[2].style.getPropertyValue("--reveal-delay")).toBe("260ms");
    const heroCopy = first.container.querySelector(".landing-hero-copy");
    expect(heroCopy.classList.contains("landing-reveal-ready")).toBe(true);
    expect(heroCopy.classList.contains("landing-revealed")).toBe(true);
    act(() => observerInstance.callback([{ target: feature, isIntersecting: true }]));
    expect(feature.classList.contains("landing-revealed")).toBe(true);
    act(() => observerInstance.callback([{ target: feature, isIntersecting: false }]));
    act(() => observerInstance.callback([{ target: feature, isIntersecting: true }]));
    expect(feature.classList.contains("landing-reveal-exiting")).toBe(false);
    act(() => observerInstance.callback([{ target: feature, isIntersecting: false }]));
    expect(feature.classList.contains("landing-revealed")).toBe(true);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 160)));
    expect(feature.classList.contains("landing-revealed")).toBe(false);
    expect(feature.classList.contains("landing-reveal-exiting")).toBe(true);
    act(() => observerInstance.callback([{ target: feature, isIntersecting: true }]));
    expect(feature.classList.contains("landing-revealed")).toBe(true);
    expect(feature.classList.contains("landing-reveal-exiting")).toBe(false);
    cleanup(first.root, first.container);

    window.IntersectionObserver = undefined;
    window.matchMedia = jest.fn(() => ({ matches: true }));
    const reduced = renderLanding();
    expect(reduced.container.querySelector(".landing-feature-row").classList.contains("landing-reveal-ready")).toBe(false);
    cleanup(reduced.root, reduced.container);

    window.matchMedia = jest.fn(() => ({ matches: false }));
    const withoutObserver = renderLanding();
    expect(withoutObserver.container.querySelectorAll(".landing-reveal-ready")).toHaveLength(0);
    expect(withoutObserver.container.querySelectorAll("[data-reveal]").length).toBeGreaterThan(0);
    cleanup(withoutObserver.root, withoutObserver.container);

    window.IntersectionObserver = originalObserver;
    window.matchMedia = originalMatchMedia;
    HTMLElement.prototype.getBoundingClientRect = originalBounds;
  });
});
