import React, { act } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import PatientProfilePage from "./PatientProfilePage";
import ProfileAvatar from "./ProfileAvatar";
import { ensureCsrf } from "../lib/authClient";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn(), post: jest.fn(), delete: jest.fn() } }));
jest.mock("../lib/authClient", () => ({ API: "http://localhost/api", ensureCsrf: jest.fn().mockResolvedValue(undefined) }));

const USER = { id: "patient-1", name: "Anita Rao", email: "anita@example.org", role: "PATIENT" };
const SUMMARY = {
  memberSince: "2024-07-12T12:00:00Z", accountStatus: "active", totalBookings: 4,
  bookingStatuses: { pending: 1, confirmed: 1, rejected: 1, cancelled: 1 },
  totalMedicineOrders: 3, fulfilledMedicineOrders: 2, nonCancelledOrderValue: 418.5,
  currency: "INR", recentActivity: [
    { id: "booking-1", type: "booking", title: "ICU bed booking at City Hospital", status: "confirmed", occurredAt: "2026-10-20T11:00:00Z" },
    { id: "order-1", type: "order", title: "ORS and Vitamin C", status: "delivered", occurredAt: "2026-10-19T11:00:00Z" },
  ],
};

function render(onProfileUpdate = jest.fn(), user = USER) {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<PatientProfilePage user={user} onProfileUpdate={onProfileUpdate} />));
  return { container, root, onProfileUpdate };
}
async function settle() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
function click(node) { act(() => node.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }
function setInput(node, value) { const setter = Object.getOwnPropertyDescriptor(node.constructor.prototype, "value").set; act(() => { setter.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true })); }); }
function mockObjectUrls() {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn().mockReturnValue("blob:profile-preview");
  URL.revokeObjectURL = jest.fn();
  return () => { if (originalCreate) URL.createObjectURL = originalCreate; else delete URL.createObjectURL; if (originalRevoke) URL.revokeObjectURL = originalRevoke; else delete URL.revokeObjectURL; };
}
function cleanup(root, container) { act(() => root.unmount()); container.remove(); }

beforeEach(() => { axios.get.mockReset().mockResolvedValue({ data: { pending: false } }); axios.patch.mockReset(); axios.post.mockReset(); axios.delete.mockReset(); ensureCsrf.mockReset().mockResolvedValue(undefined); });

describe("patient profile experience", () => {
  it("shows real account and scoped analytics without calling fulfilled orders completed bookings", async () => {
    axios.get.mockResolvedValueOnce({ data: { pending: false } }).mockResolvedValueOnce({ data: SUMMARY });
    const { container, root } = render(); await settle();
    expect(axios.get).toHaveBeenCalledWith("http://localhost/api/patient/profile/summary");
    expect(container.querySelector(".patient-profile-avatar").textContent).toBe("AR");
    expect(container.textContent).toContain("Member since July 2024");
    expect(container.textContent).toContain("Total bookings4");
    expect(container.textContent).toContain("Pending1");
    expect(container.textContent).toContain("Confirmed1");
    expect(container.textContent).toContain("Rejected1");
    expect(container.textContent).toContain("Cancelled1");
    expect(container.textContent).toContain("Orders picked up or delivered2");
    expect(container.textContent).toContain("Order value (excluding cancelled)");
    expect(container.textContent).not.toContain("Completed bookings");
    expect(container.textContent).toContain("payment settlement is not tracked");
    expect(container.textContent).toContain("ICU bed booking at City Hospital");
    expect(container.textContent).toContain("Delivered");
    expect(container.textContent).toContain("not a complete account activity feed");
    cleanup(root, container);
  });

  it("edits only the name through the existing authenticated profile endpoint", async () => {
    axios.get.mockResolvedValueOnce({ data: { pending: false } }).mockResolvedValueOnce({ data: SUMMARY });
    axios.patch.mockResolvedValueOnce({ data: { ...USER, name: "Anita Sharma" } });
    const { container, root, onProfileUpdate } = render(); await settle();
    click([...container.querySelectorAll(".patient-profile-edit-button")].find((button) => button.textContent.includes("Edit profile")));
    const nameInput = container.querySelector("#patient-profile-name");
    const setter = Object.getOwnPropertyDescriptor(nameInput.constructor.prototype, "value").set;
    act(() => { setter.call(nameInput, "Anita Sharma"); nameInput.dispatchEvent(new Event("input", { bubbles: true })); nameInput.dispatchEvent(new Event("change", { bubbles: true })); });
    const form = container.querySelector(".patient-profile-form");
    act(() => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await settle();
    expect(ensureCsrf).toHaveBeenCalledTimes(1);
    expect(axios.patch).toHaveBeenCalledWith("http://localhost/api/auth/me", { name: "Anita Sharma" });
    expect(onProfileUpdate).toHaveBeenCalledWith({ ...USER, name: "Anita Sharma" });
    expect(container.querySelector("#patient-profile-heading").textContent).toBe("Anita Sharma");
    expect(container.querySelector("#patient-profile-email")).toBeNull();
    expect(container.textContent).toContain("Your profile name was updated");
    cleanup(root, container);
  });

  it("saves an unverified phone number and updates authenticated profile state", async () => {
    axios.get.mockResolvedValueOnce({ data: { pending: false } }).mockResolvedValueOnce({ data: SUMMARY });
    const updatedUser = { ...USER, phoneNumber: "+919876543210" };
    let finishUpdate;
    axios.patch.mockReturnValueOnce(new Promise((resolve) => { finishUpdate = resolve; }));
    const { container, root, onProfileUpdate } = render(); await settle();
    expect(container.textContent).toContain("Not added");
    click(container.querySelector(".patient-profile-phone-actions .patient-profile-phone-edit"));
    const input = container.querySelector("#patient-profile-phone");
    const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value").set;
    act(() => { setter.call(input, "+91 98765 43210"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
    click([...container.querySelectorAll("button")].find((button) => button.textContent.includes("Save number")));
    await settle();
    expect(ensureCsrf).toHaveBeenCalledTimes(1);
    expect(axios.patch).toHaveBeenCalledWith("http://localhost/api/auth/me", { phoneNumber: "+91 98765 43210" });
    expect([...container.querySelectorAll("button")].some((button) => button.textContent.includes("Saving"))).toBe(true);
    await act(async () => { finishUpdate({ data: updatedUser }); await Promise.resolve(); });
    await settle();
    expect(onProfileUpdate).toHaveBeenCalledWith(updatedUser);
    expect(container.textContent).toContain("+919876543210");
    expect(container.textContent).toContain("Unverified · OTP verification is not available yet.");
    expect(container.textContent).toContain("Phone number saved. It has not been verified.");
    cleanup(root, container);
  });

  it("cancels phone editing without saving and removes an existing account number", async () => {
    axios.get.mockResolvedValueOnce({ data: { pending: false } }).mockResolvedValueOnce({ data: SUMMARY });
    const existingUser = { ...USER, phoneNumber: "+919876543210" };
    const removedUser = { ...USER, phoneNumber: null };
    axios.patch.mockResolvedValueOnce({ data: removedUser });
    const { container, root, onProfileUpdate } = render(jest.fn(), existingUser); await settle();
    expect(container.textContent).toContain("+919876543210");
    click(container.querySelector(".patient-profile-phone-actions .patient-profile-phone-edit"));
    const input = container.querySelector("#patient-profile-phone");
    const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value").set;
    act(() => { setter.call(input, "8123456789"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
    click([...container.querySelectorAll("button")].find((button) => button.textContent.includes("Cancel")));
    expect(axios.patch).not.toHaveBeenCalled();
    click(container.querySelector(".patient-profile-phone-remove"));
    await settle();
    expect(ensureCsrf).toHaveBeenCalledTimes(1);
    expect(axios.patch).toHaveBeenCalledWith("http://localhost/api/auth/me", { phoneNumber: null });
    expect(onProfileUpdate).toHaveBeenCalledWith(removedUser);
    expect(container.textContent).toContain("Not added");
    expect(container.textContent).toContain("Account phone number removed.");
    cleanup(root, container);
  });

  it("shows phone validation and server errors without changing the saved value", async () => {
    axios.get.mockResolvedValueOnce({ data: { pending: false } }).mockResolvedValueOnce({ data: SUMMARY });
    const existingUser = { ...USER, phoneNumber: "+919876543210" };
    const { container, root } = render(jest.fn(), existingUser); await settle();
    click(container.querySelector(".patient-profile-phone-actions .patient-profile-phone-edit"));
    const input = container.querySelector("#patient-profile-phone");
    const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value").set;
    act(() => { setter.call(input, "+1 2025550123"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
    click([...container.querySelectorAll("button")].find((button) => button.textContent.includes("Save number")));
    expect(container.querySelector('[role="alert"]').textContent).toContain("valid 10-digit Indian mobile number");
    expect(axios.patch).not.toHaveBeenCalled();

    act(() => { setter.call(input, "9876543210"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
    axios.patch.mockRejectedValueOnce({ response: { data: { detail: "Phone update unavailable" } } });
    click([...container.querySelectorAll("button")].find((button) => button.textContent.includes("Save number")));
    await settle();
    expect(container.querySelector('[role="alert"]').textContent).toContain("Phone update unavailable");
    expect(container.textContent).toContain("+919876543210");
    cleanup(root, container);
  });

  it("requests a verified email change, keeps the current address, and shows pending destination", async () => {
    axios.get.mockResolvedValueOnce({ data: { pending: false } })
      .mockResolvedValueOnce({ data: SUMMARY })
      .mockResolvedValueOnce({ data: { pending: true, email: "new@example.net", expiresAt: "2026-11-01T12:15:00Z", resendAvailableAt: new Date(Date.now() + 60_000).toISOString() } });
    axios.post.mockResolvedValueOnce({ data: { message: "If this address can be used, verification instructions will be sent." } });
    const { container, root } = render(); await settle();
    expect(container.textContent).toContain(USER.email);
    click(container.querySelector(".patient-profile-email-summary button"));
    setInput(container.querySelector("#patient-new-email"), "new@example.net");
    setInput(container.querySelector("#patient-confirm-email"), "new@example.net");
    click([...container.querySelectorAll("button")].find((button) => button.textContent.includes("Send verification link")));
    await settle();
    expect(ensureCsrf).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith("http://localhost/api/auth/email-change/request", { email: "new@example.net" });
    expect(container.textContent).toContain("Verification pending");
    expect(container.textContent).toContain("Check new@example.net");
    expect(container.textContent).toContain("Your current email remains active until verification.");
    expect(container.textContent).toContain(USER.email);
    cleanup(root, container);
  });

  it("validates matching email input, supports cancel, and reports provider failures", async () => {
    axios.get.mockResolvedValueOnce({ data: { pending: false } }).mockResolvedValueOnce({ data: SUMMARY });
    const { container, root } = render(); await settle();
    click(container.querySelector(".patient-profile-email-summary button"));
    setInput(container.querySelector("#patient-new-email"), "new@example.net");
    setInput(container.querySelector("#patient-confirm-email"), "different@example.net");
    click([...container.querySelectorAll("button")].find((button) => button.textContent.includes("Send verification link")));
    expect(container.querySelector('[role="alert"]').textContent).toContain("do not match");
    expect(axios.post).not.toHaveBeenCalled();
    click([...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel"));
    expect(container.querySelector("#patient-new-email")).toBeNull();

    click(container.querySelector(".patient-profile-email-summary button"));
    setInput(container.querySelector("#patient-new-email"), "new@example.net");
    setInput(container.querySelector("#patient-confirm-email"), "new@example.net");
    axios.post.mockRejectedValueOnce({ response: { status: 503, data: { detail: "Email verification delivery is not configured" } } });
    click([...container.querySelectorAll("button")].find((button) => button.textContent.includes("Send verification link")));
    await settle();
    expect(container.querySelector('[role="alert"]').textContent).toContain("delivery is not configured");
    expect(container.textContent).toContain(USER.email);
    cleanup(root, container);
  });

  it("resends only after the backend cooldown and handles resend errors", async () => {
    const pending = { pending: true, email: "new@example.net", expiresAt: "2026-11-01T12:15:00Z", resendAvailableAt: "2020-01-01T00:00:00Z" };
    axios.get.mockResolvedValueOnce({ data: pending }).mockResolvedValueOnce({ data: SUMMARY }).mockResolvedValueOnce({ data: pending });
    axios.post.mockRejectedValueOnce({ response: { status: 429, data: { detail: "Please wait before requesting another email." } } });
    const { container, root } = render(); await settle();
    const resend = container.querySelector(".patient-profile-email-pending button");
    expect(resend.disabled).toBe(false);
    click(resend);
    await settle();
    expect(axios.post).toHaveBeenCalledWith("http://localhost/api/auth/email-change/resend");
    expect(container.querySelector('[role="alert"]').textContent).toContain("Please wait");
    cleanup(root, container);
  });

  it("shows empty analytics and a recoverable error without fabricated counts", async () => {
    axios.get.mockResolvedValueOnce({ data: { pending: false } }).mockResolvedValueOnce({ data: { ...SUMMARY, totalBookings: 0, bookingStatuses: { pending: 0, confirmed: 0, rejected: 0, cancelled: 0 }, totalMedicineOrders: 0, fulfilledMedicineOrders: 0, nonCancelledOrderValue: 0, recentActivity: [] } });
    const empty = render(); await settle();
    expect(empty.container.textContent).toContain("No bookings or medicine orders to show yet");
    expect(empty.container.textContent).toContain("Total bookings0");
    cleanup(empty.root, empty.container);

    axios.get.mockResolvedValueOnce({ data: { pending: false } }).mockRejectedValueOnce({ response: { data: { detail: "Summary unavailable" } } });
    const failed = render(); await settle();
    expect(failed.container.querySelector('[role="alert"]').textContent).toContain("Summary unavailable");
    expect(failed.container.textContent).not.toContain("Total bookings0");
    cleanup(failed.root, failed.container);
  });

  it("previews a valid image, saves it with CSRF, and propagates the refreshed profile", async () => {
    const restoreObjectUrls = mockObjectUrls();
    const OriginalImage = global.Image;
    global.Image = class { set src(value) { this.naturalWidth = 200; this.naturalHeight = 200; queueMicrotask(() => this.onload()); } };
    axios.get.mockResolvedValueOnce({ data: { pending: false } }).mockResolvedValueOnce({ data: SUMMARY });
    const refreshed = { ...USER, profilePictureUrl: "/auth/me/profile-picture?v=one" };
    axios.post.mockResolvedValueOnce({ data: refreshed });
    const { container, root, onProfileUpdate } = render(); await settle();
    const input = container.querySelector('input[type="file"]');
    const file = new File([new Uint8Array([1, 2, 3])], "portrait.png", { type: "image/png" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    await settle();
    expect(container.querySelector('img[alt="Preview of selected profile photo"]')).not.toBeNull();
    click(container.querySelector(".patient-profile-photo-pending .dashboard-primary-button"));
    await settle();
    expect(ensureCsrf).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith("http://localhost/api/auth/me/profile-picture", expect.any(FormData), expect.objectContaining({ onUploadProgress: expect.any(Function) }));
    expect(onProfileUpdate).toHaveBeenCalledWith(refreshed);
    expect(container.textContent).toContain("Your profile photo was updated.");
    expect(container.querySelector(".patient-profile-avatar img").src).toContain("/auth/me/profile-picture?v=one");
    cleanup(root, container); global.Image = OriginalImage; restoreObjectUrls();
  });

  it("cancels a pending image without uploading and removes a saved image", async () => {
    const restoreObjectUrls = mockObjectUrls();
    const OriginalImage = global.Image;
    global.Image = class { set src(value) { this.naturalWidth = 200; this.naturalHeight = 200; queueMicrotask(() => this.onload()); } };
    const savedUser = { ...USER, profilePictureUrl: "/auth/me/profile-picture?v=one" };
    axios.get.mockResolvedValueOnce({ data: { pending: false } }).mockResolvedValueOnce({ data: SUMMARY });
    axios.delete.mockResolvedValueOnce({ data: USER });
    const { container, root, onProfileUpdate } = render(jest.fn(), savedUser); await settle();
    const input = container.querySelector('input[type="file"]');
    const file = new File([new Uint8Array([1, 2, 3])], "portrait.png", { type: "image/png" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    await settle();
    click(container.querySelector(".patient-profile-photo-pending .patient-profile-cancel"));
    expect(axios.post).not.toHaveBeenCalled();
    click(container.querySelector(".patient-profile-remove-photo"));
    await settle();
    expect(ensureCsrf).toHaveBeenCalledTimes(1);
    expect(axios.delete).toHaveBeenCalledWith("http://localhost/api/auth/me/profile-picture");
    expect(onProfileUpdate).toHaveBeenCalledWith(USER);
    expect(container.querySelector(".patient-profile-avatar img")).toBeNull();
    expect(container.querySelector(".patient-profile-avatar").textContent).toBe("AR");
    cleanup(root, container); global.Image = OriginalImage; restoreObjectUrls();
  });

  it("falls back to initials when a saved profile image cannot be loaded", () => {
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<ProfileAvatar user={{ ...USER, profilePictureUrl: "/auth/me/profile-picture?v=missing" }} className="avatar" />));
    expect(container.querySelector("img")).not.toBeNull();
    act(() => container.querySelector("img").dispatchEvent(new Event("error")));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".avatar").textContent).toBe("AR");
    act(() => root.unmount()); container.remove();
  });
});
