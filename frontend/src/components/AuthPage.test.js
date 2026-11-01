import React, { act } from "react";
import { createRoot } from "react-dom/client";
import AuthPage from "./AuthPage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<AuthPage onAuthenticate={jest.fn().mockResolvedValue(undefined)} onReturnHome={jest.fn()} {...props} />));
  return { container, root };
}

function cleanup(root, container) {
  act(() => root.unmount());
  container.remove();
}

function setInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value").set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submit(form) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

function switchToSignupImmediately(container) {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = jest.fn(() => ({ matches: true }));
  act(() => container.querySelector(".auth-mode-switch button").click());
  window.matchMedia = originalMatchMedia;
}

describe("Hospot login and signup page", () => {
  it("renders accessible login fields and submits only the existing credentials contract", async () => {
    const onAuthenticate = jest.fn().mockResolvedValue(undefined);
    const onSuccess = jest.fn();
    const { container, root } = render({ onAuthenticate, onSuccess });
    expect(container.querySelector('label[for="auth-email"]')).not.toBeNull();
    expect(container.querySelector("#auth-email").autocomplete).toBe("email");
    expect(container.querySelector("#auth-password").autocomplete).toBe("current-password");

    setInput(container.querySelector("#auth-email"), "patient@example.com");
    setInput(container.querySelector("#auth-password"), "Correct Horse Battery 7!");
    await submit(container.querySelector("form"));

    expect(onAuthenticate).toHaveBeenCalledWith({
      isRegistering: false, name: "", email: "patient@example.com",
      password: "Correct Horse Battery 7!", invitationToken: null,
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    cleanup(root, container);
  });

  it("submits public signup without allowing the client to choose a role", async () => {
    const onAuthenticate = jest.fn().mockResolvedValue(undefined);
    const { container, root } = render({ onAuthenticate });
    switchToSignupImmediately(container);
    setInput(container.querySelector("#auth-name"), "Anita Sharma");
    setInput(container.querySelector("#auth-email"), "anita@example.com");
    setInput(container.querySelector("#auth-password"), "Correct Horse Battery 7!");
    await submit(container.querySelector("form"));

    expect(onAuthenticate).toHaveBeenCalledWith({
      isRegistering: true, name: "Anita Sharma", email: "anita@example.com",
      password: "Correct Horse Battery 7!", invitationToken: null,
    });
    expect(onAuthenticate.mock.calls[0][0]).not.toHaveProperty("role");
    cleanup(root, container);
  });

  it("prefills and locks the invitation email and submits the invitation token", async () => {
    const onAuthenticate = jest.fn().mockResolvedValue(undefined);
    const { container, root } = render({
      invitationToken: "test-invitation-token", invitationEmail: "doctor@example.com", onAuthenticate,
    });
    expect(container.querySelector("#auth-name")).not.toBeNull();
    expect(container.querySelector("#auth-email").value).toBe("doctor@example.com");
    expect(container.querySelector("#auth-email").readOnly).toBe(true);
    expect(container.querySelector(".auth-mode-switch")).toBeNull();
    setInput(container.querySelector("#auth-name"), "Dr. Example");
    setInput(container.querySelector("#auth-password"), "Correct Horse Battery 7!");
    await submit(container.querySelector("form"));

    expect(onAuthenticate.mock.calls[0][0]).toMatchObject({
      isRegistering: true, email: "doctor@example.com", invitationToken: "test-invitation-token",
    });
    cleanup(root, container);
  });

  it("transitions in both directions, ignores rapid mode clicks, and preserves entered values", () => {
    const originalMatchMedia = window.matchMedia;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    window.matchMedia = jest.fn(() => ({ matches: false }));
    window.requestAnimationFrame = (callback) => window.setTimeout(callback, 16);
    window.cancelAnimationFrame = (timer) => window.clearTimeout(timer);
    jest.useFakeTimers();

    const { container, root } = render();
    setInput(container.querySelector("#auth-email"), "remember@example.com");
    const switchButton = container.querySelector(".auth-mode-switch button");
    act(() => switchButton.click());
    expect(container.querySelector(".auth-mode-stage").classList.contains("is-exiting")).toBe(true);
    expect(container.querySelector("#auth-heading").textContent).toBe("Welcome back");
    act(() => switchButton.click());
    expect(container.querySelector(".auth-mode-stage").classList.contains("is-exiting")).toBe(true);

    act(() => jest.advanceTimersByTime(150));
    expect(container.querySelector("#auth-heading").textContent).toBe("Create your account");
    expect(container.querySelector(".auth-mode-stage").classList.contains("is-entering")).toBe(true);
    expect(container.querySelector(".auth-story").classList.contains("is-registering")).toBe(true);
    expect(container.querySelector("#auth-email").value).toBe("remember@example.com");
    act(() => jest.advanceTimersByTime(250));
    expect(container.querySelector(".auth-mode-stage").classList.contains("is-entering")).toBe(false);
    expect(document.activeElement).toBe(container.querySelector("#auth-heading"));

    act(() => container.querySelector(".auth-mode-switch button").click());
    expect(container.querySelector(".auth-mode-stage").classList.contains("is-exiting")).toBe(true);
    act(() => jest.advanceTimersByTime(150));
    expect(container.querySelector("#auth-heading").textContent).toBe("Welcome back");
    expect(container.querySelector(".auth-story").classList.contains("is-registering")).toBe(false);
    act(() => jest.advanceTimersByTime(250));
    expect(container.querySelector("#auth-email").value).toBe("remember@example.com");

    cleanup(root, container);
    jest.useRealTimers();
    window.matchMedia = originalMatchMedia;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it("switches immediately when reduced motion is requested", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn(() => ({ matches: true }));
    const { container, root } = render();
    act(() => container.querySelector(".auth-mode-switch button").click());
    expect(container.querySelector("#auth-heading").textContent).toBe("Create your account");
    expect(container.querySelector(".auth-mode-stage").classList.contains("is-exiting")).toBe(false);
    expect(container.querySelector(".auth-mode-stage").classList.contains("is-entering")).toBe(false);
    expect(container.querySelector(".auth-story").classList.contains("is-registering")).toBe(true);
    cleanup(root, container);
    window.matchMedia = originalMatchMedia;
  });

  it("toggles password visibility with a descriptive accessible control", () => {
    const { container, root } = render();
    const password = container.querySelector("#auth-password");
    const toggle = container.querySelector(".auth-password-toggle");
    expect(toggle.getAttribute("aria-label")).toBe("Show password");
    act(() => toggle.click());
    expect(password.type).toBe("text");
    expect(toggle.getAttribute("aria-label")).toBe("Hide password");
    cleanup(root, container);
  });

  it("validates all existing signup password requirements before submitting", async () => {
    const onAuthenticate = jest.fn();
    const { container, root } = render({ onAuthenticate });
    switchToSignupImmediately(container);
    setInput(container.querySelector("#auth-name"), "Anita Sharma");
    setInput(container.querySelector("#auth-email"), "anita@example.com");
    setInput(container.querySelector("#auth-password"), "short");
    await submit(container.querySelector("form"));
    expect(container.querySelector("#auth-password-error").textContent).toContain("12 to 128 characters");
    expect(container.querySelector(".auth-rule-list").textContent).toContain("12 or more characters");
    expect(onAuthenticate).not.toHaveBeenCalled();
    cleanup(root, container);
  });

  it("normalizes structured FastAPI errors without rendering raw objects or submitted values", async () => {
    const onAuthenticate = jest.fn().mockRejectedValue({ response: {
      status: 422,
      data: { detail: [{ loc: ["body", "email"], msg: "value is invalid", input: "sensitive-submitted-value" }] },
    } });
    const { container, root } = render({ onAuthenticate });
    setInput(container.querySelector("#auth-email"), "patient@example.com");
    setInput(container.querySelector("#auth-password"), "any-password");
    await submit(container.querySelector("form"));
    expect(container.querySelector('[role="alert"]').textContent).toBe("Enter a valid email address.");
    expect(container.textContent).not.toContain("sensitive-submitted-value");
    cleanup(root, container);
  });

  it("shows safe API failure feedback and resets it when the user edits a field", async () => {
    const onAuthenticate = jest.fn().mockRejectedValue({ response: { status: 401, data: { detail: "Invalid email or password" } } });
    const { container, root } = render({ onAuthenticate });
    setInput(container.querySelector("#auth-email"), "patient@example.com");
    setInput(container.querySelector("#auth-password"), "wrong-password");
    await submit(container.querySelector("form"));
    expect(container.querySelector('[role="alert"]').textContent).toBe("Email or password is incorrect.");
    setInput(container.querySelector("#auth-email"), "new@example.com");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    cleanup(root, container);
  });

  it("disables submission while authentication is in progress", async () => {
    let resolveRequest;
    const onAuthenticate = jest.fn(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const { container, root } = render({ onAuthenticate });
    setInput(container.querySelector("#auth-email"), "patient@example.com");
    setInput(container.querySelector("#auth-password"), "any-password");
    await submit(container.querySelector("form"));
    const submitButton = container.querySelector(".auth-submit");
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.textContent).toContain("Signing in");
    await act(async () => { resolveRequest(); await Promise.resolve(); });
    expect(submitButton.disabled).toBe(false);
    cleanup(root, container);
  });
});
