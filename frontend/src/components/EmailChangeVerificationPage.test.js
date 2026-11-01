import React, { act } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import EmailChangeVerificationPage from "./EmailChangeVerificationPage";
import { ensureCsrf } from "../lib/authClient";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../lib/authClient", () => ({ API: "http://localhost/api", ensureCsrf: jest.fn().mockResolvedValue(undefined) }));
jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams(globalThis.window.location.search)],
}), { virtual: true });

function render(path, onProfileUpdate = jest.fn()) {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  window.history.replaceState({}, "", path);
  act(() => root.render(<EmailChangeVerificationPage onProfileUpdate={onProfileUpdate} />));
  return { container, root, onProfileUpdate };
}
async function settle() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
function click(node) { act(() => node.click()); }
function cleanup(root, container) { act(() => root.unmount()); container.remove(); }

beforeEach(() => { axios.get.mockReset(); axios.post.mockReset(); ensureCsrf.mockReset().mockResolvedValue(undefined); });

describe("email change verification page", () => {
  it("confirms by token, refreshes an available session profile, and shows success", async () => {
    const updated = { id: "patient-1", email: "new@example.net", name: "Patient" };
    axios.post.mockResolvedValueOnce({ data: { email: updated.email } });
    axios.get.mockResolvedValueOnce({ data: updated });
    const onProfileUpdate = jest.fn();
    const { container, root } = render("/verify-email-change#token=private-token-value", onProfileUpdate);
    expect(container.textContent).toContain("Confirm your email change");
    click(container.querySelector("button")); await settle();
    expect(ensureCsrf).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith("http://localhost/api/auth/email-change/confirm", { token: "private-token-value" });
    expect(axios.get).toHaveBeenCalledWith("http://localhost/api/auth/me");
    expect(onProfileUpdate).toHaveBeenCalledWith(updated);
    expect(container.textContent).toContain("Email address updated");
    expect(container.textContent).toContain(updated.email);
    cleanup(root, container);
  });

  it("shows an expired or invalid link response without refreshing profile", async () => {
    axios.post.mockRejectedValueOnce({ response: { status: 410, data: { detail: "This verification link has expired. Request a new one." } } });
    const { container, root } = render("/verify-email-change#token=expired-token-value");
    click(container.querySelector("button")); await settle();
    expect(container.textContent).toContain("We couldn’t verify this link");
    expect(container.textContent).toContain("link has expired");
    expect(axios.get).not.toHaveBeenCalled();
    cleanup(root, container);
  });

  it("explains a missing token without calling the API", () => {
    const { container, root } = render("/verify-email-change");
    expect(container.textContent).toContain("Verification link missing");
    expect(axios.post).not.toHaveBeenCalled();
    cleanup(root, container);
  });
});
