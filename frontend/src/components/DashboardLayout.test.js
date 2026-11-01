import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import DashboardLayout from "./DashboardLayout";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("react-router-dom", () => {
  const React = require("react");
  const RouterContext = React.createContext(null);
  return {
    MemoryRouter: ({ initialEntries, children }) => {
      const [pathname, setPathname] = React.useState(initialEntries[0]);
      const value = React.useMemo(() => ({ pathname, navigate: setPathname }), [pathname]);
      return React.createElement(RouterContext.Provider, { value }, children);
    },
    useLocation: () => ({ pathname: React.useContext(RouterContext).pathname }),
    useNavigate: () => React.useContext(RouterContext).navigate,
  };
}, { virtual: true });

jest.mock("axios", () => ({ __esModule: true, default: { patch: jest.fn() } }));
jest.mock("../lib/authClient", () => ({ API: "http://localhost/api", ensureCsrf: jest.fn() }));

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

function renderDashboard(role, user, initialPath, section = "overview") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initialPath]}>
        <DashboardLayout role={role} section={section} user={user} onLogout={() => {}} onNameChange={() => {}} />
        <CurrentPath />
      </MemoryRouter>,
    );
  });
  return { container, root };
}

function clickButton(container, selector) {
  act(() => container.querySelector(selector).click());
}

function expectPath(container, path) {
  expect(container.querySelector('[data-testid="current-path"]').textContent).toBe(path);
}

describe("dashboard layout rendering", () => {
  it("renders the patient workspace and navigates between its sections", () => {
    const { container, root } = renderDashboard(
      "PATIENT",
      { name: "Demo Patient", email: "patient@example.org", role: "PATIENT" },
      "/dashboard/patient/overview",
    );

    expect(container.querySelector(".dashboard-app")).not.toBeNull();
    expect(container.querySelector(".dashboard-role-label").textContent).toContain("Patient");
    expect(container.textContent).toContain("Good to see you, Demo.");
    expect([...container.querySelectorAll(".dashboard-nav-item")].filter((button) => ["Hospitals", "Bed booking"].includes(button.getAttribute("aria-label"))).map((button) => button.getAttribute("aria-label"))).toEqual(["Hospitals"]);
    expect([...container.querySelectorAll(".dashboard-mobile-nav button")].filter((button) => ["Hospitals", "Bed booking"].includes(button.textContent.trim())).map((button) => button.textContent.trim())).toEqual(["Hospitals"]);
    expect([...container.querySelectorAll(".dashboard-quick-link")].some((button) => button.textContent.includes("Find a bed"))).toBe(false);

    act(() => {
      [...container.querySelectorAll(".dashboard-nav-item")]
        .find((button) => button.textContent.includes("Hospitals"))
        .click();
    });
    expect(container.querySelector('[data-testid="current-path"]').textContent)
      .toBe("/dashboard/patient/hospitals");

    const actionRoutes = [
      ["Find Hospitals", "/dashboard/patient/hospitals"],
      ["My bookings", "/dashboard/patient/bookings"],
      ["Browse medicines", "/dashboard/patient/medicines"],
      ["Open your cart", "/cart"],
      ["View your orders", "/orders"],
    ];
    actionRoutes.forEach(([label, path]) => {
      const action = [...container.querySelectorAll(".dashboard-quick-link")]
        .find((button) => button.textContent.includes(label));
      act(() => action.click());
      expectPath(container, path);
    });

    clickButton(container, '.dashboard-nav-item[aria-label="Prescriptions"]');
    expectPath(container, "/dashboard/patient/prescriptions");

    act(() => root.unmount());
    container.remove();
  });

  it("keeps Hospitals as the only hospital-related patient sidebar destination", () => {
    const user = { name: "Demo Patient", email: "patient@example.org", role: "PATIENT" };
    const hospitals = renderDashboard("PATIENT", user, "/dashboard/patient/hospitals", "hospitals");
    expect(hospitals.container.querySelector('.dashboard-nav-item[aria-label="Hospitals"]').getAttribute("aria-current")).toBe("page");
    expect(hospitals.container.querySelector('.dashboard-nav-item[aria-label="Bed booking"]')).toBeNull();
    act(() => hospitals.root.unmount()); hospitals.container.remove();
  });

  it("uses the authenticated profile picture consistently in sidebar and header avatars", () => {
    const { container, root } = renderDashboard(
      "PATIENT",
      { name: "Anita Rao", email: "patient@example.org", role: "PATIENT", profilePictureUrl: "/auth/me/profile-picture?v=one" },
      "/dashboard/patient/overview",
    );
    const avatars = container.querySelectorAll(".dashboard-user-avatar");
    expect(avatars).toHaveLength(2);
    avatars.forEach((avatar) => {
      expect(avatar.querySelector("img").src).toBe("http://localhost/api/auth/me/profile-picture?v=one");
    });
    act(() => root.unmount());
    container.remove();
  });

  it("renders only the doctor workspace and its explicit access boundary", () => {
    const { container, root } = renderDashboard(
      "DOCTOR",
      { name: "Asha Raman", email: "doctor@example.org", role: "DOCTOR", hospitalId: "hospital-demo" },
      "/dashboard/doctor/overview",
    );

    expect(container.querySelector(".dashboard-app")).not.toBeNull();
    expect(container.querySelector(".dashboard-role-label").textContent).toContain("Doctor");
    expect(container.textContent).toContain("Patient and clinical workflows are not enabled");
    expect(container.textContent).not.toContain("Platform orders");

    act(() => root.unmount());
    container.remove();
  });

  it("provides a labelled desktop collapse control and a closable mobile drawer", () => {
    const { container, root } = renderDashboard(
      "PLATFORM_ADMIN",
      { name: "Demo Admin", email: "admin@example.org", role: "PLATFORM_ADMIN" },
      "/dashboard/platform-admin/overview",
    );

    const sidebar = container.querySelector(".dashboard-sidebar");
    clickButton(container, '.dashboard-collapse-button[aria-label="Collapse sidebar"]');
    expect(sidebar.classList.contains("is-collapsed")).toBe(true);
    expect(container.querySelector('.dashboard-nav-item[aria-label="Hospitals"]').getAttribute("title")).toBe("Hospitals");
    expect(container.querySelector('.dashboard-collapse-button[aria-label="Expand sidebar"]')).not.toBeNull();

    clickButton(container, '.dashboard-menu-button[aria-label="Open navigation menu"]');
    expect(sidebar.classList.contains("is-mobile-open")).toBe(true);
    expect(container.querySelector(".dashboard-mobile-backdrop")).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    clickButton(container, ".dashboard-mobile-backdrop");
    expect(sidebar.classList.contains("is-mobile-open")).toBe(false);
    expect(document.body.style.overflow).toBe("");

    clickButton(container, '.dashboard-menu-button[aria-label="Open navigation menu"]');
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(sidebar.classList.contains("is-mobile-open")).toBe(false);

    clickButton(container, '.dashboard-menu-button[aria-label="Open navigation menu"]');
    clickButton(container, '.dashboard-nav-item[aria-label="Hospitals"]');
    expect(sidebar.classList.contains("is-mobile-open")).toBe(false);
    expectPath(container, "/dashboard/platform-admin/hospitals");

    act(() => root.unmount());
    container.remove();
  });

  it("routes Hospital Admin and Platform Admin quick actions to their role workspaces", () => {
    const hospital = renderDashboard(
      "HOSPITAL_ADMIN",
      { name: "Hospital Manager", email: "manager@example.org", role: "HOSPITAL_ADMIN", hospitalId: "hospital-demo" },
      "/dashboard/hospital-admin/overview",
    );
    const bookingAction = [...hospital.container.querySelectorAll(".dashboard-quick-link")]
      .find((button) => button.textContent.includes("Booking management"));
    act(() => bookingAction.click());
    expectPath(hospital.container, "/dashboard/hospital-admin/bookings");
    act(() => hospital.root.unmount());
    hospital.container.remove();

    const platform = renderDashboard(
      "PLATFORM_ADMIN",
      { name: "Platform Admin", email: "platform@example.org", role: "PLATFORM_ADMIN" },
      "/dashboard/platform-admin/overview",
    );
    const medicineAction = [...platform.container.querySelectorAll(".dashboard-quick-link")]
      .find((button) => button.textContent.includes("Medicine catalogue"));
    act(() => medicineAction.click());
    expectPath(platform.container, "/dashboard/platform-admin/medicines");
    act(() => platform.root.unmount());
    platform.container.remove();
  });
});
