import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { DashboardAccess, DashboardRedirect } from "./DashboardAccess";
import { dashboardPathForRole } from "./dashboardRoutes";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("react-router-dom", () => ({
  Navigate: ({ to }) => {
    const React = require("react");
    return React.createElement("div", { "data-redirect": to });
  },
}), { virtual: true });

function render(element) {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

describe("role dashboard routing", () => {
  const roles = ["PATIENT", "DOCTOR", "HOSPITAL_ADMIN", "PLATFORM_ADMIN"];

  test.each(roles)("redirects %s to its backend-assigned dashboard", (role) => {
    const { container, root } = render(<DashboardRedirect user={{ role }} />);
    expect(container.firstChild.getAttribute("data-redirect")).toBe(dashboardPathForRole(role));
    act(() => root.unmount());
  });

  test.each(roles)("allows a %s into only its own dashboard", (role) => {
    const { container, root } = render(<DashboardAccess user={{ role }} requestedRole={role}><p>private dashboard</p></DashboardAccess>);
    expect(container.textContent).toBe("private dashboard");
    act(() => root.unmount());
  });

  test.each(roles)("redirects another role away from the %s dashboard", (requestedRole) => {
    const actualRole = roles.find((role) => role !== requestedRole);
    const { container, root } = render(<DashboardAccess user={{ role: actualRole }} requestedRole={requestedRole}><p>private dashboard</p></DashboardAccess>);
    expect(container.firstChild.getAttribute("data-redirect")).toBe(dashboardPathForRole(actualRole));
    act(() => root.unmount());
  });

  it("redirects missing identity to the shared login page", () => {
    const { container, root } = render(<DashboardAccess user={null} requestedRole="PATIENT"><p>private dashboard</p></DashboardAccess>);
    expect(container.firstChild.getAttribute("data-redirect")).toBe("/login");
    act(() => root.unmount());
  });
});
