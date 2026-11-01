import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { RoleProtectedRoute, SessionProtectedRoute } from "./ProtectedRoute";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("react-router-dom", () => ({
  Navigate: ({ to }) => {
    const React = require("react");
    return React.createElement("div", { "data-redirect": to });
  },
}), { virtual: true });

function render(routeElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(routeElement));
  return { container, root };
}

describe("protected routes", () => {
  it("redirects unauthenticated sessions to login", () => {
    const { container, root } = render(<SessionProtectedRoute loading={false} authenticated={false}><p>private</p></SessionProtectedRoute>);
    expect(container.firstChild.getAttribute("data-redirect")).toBe("/login");
    act(() => root.unmount());
  });

  it("keeps the session restoration state visible while loading", () => {
    const { container, root } = render(<SessionProtectedRoute loading authenticated={false}><p>private</p></SessionProtectedRoute>);
    expect(container.textContent).toContain("Restoring your secure session");
    act(() => root.unmount());
  });

  it("redirects non-patients away from patient workflows", () => {
    const { container, root } = render(<RoleProtectedRoute user={{ role: "DOCTOR" }} role="PATIENT"><p>private</p></RoleProtectedRoute>);
    expect(container.firstChild.getAttribute("data-redirect")).toBe("/home");
    act(() => root.unmount());
  });

  it("allows a patient into patient workflows", () => {
    const { container, root } = render(<RoleProtectedRoute user={{ role: "PATIENT" }} role="PATIENT"><p>private</p></RoleProtectedRoute>);
    expect(container.textContent).toBe("private");
    act(() => root.unmount());
  });
});
