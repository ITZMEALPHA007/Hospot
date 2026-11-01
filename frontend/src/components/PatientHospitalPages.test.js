import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import axios from "axios";
import { BookingCreatePage, HospitalDetailPage, HospitalDiscoveryPage, PatientBookingDetailPage, PatientBookingsPage } from "./PatientHospitalPages";

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
    useNavigate: () => React.useContext(RouterContext).navigate,
    useLocation: () => ({ pathname: React.useContext(RouterContext).pathname }),
    useParams: () => {
      const { pathname } = React.useContext(RouterContext);
      return {
        hospitalId: pathname.match(/\/hospitals\/([^/?]+)/)?.[1],
        bookingId: pathname.match(/\/bookings\/([^/?]+)/)?.[1],
      };
    },
    useSearchParams: () => [new URLSearchParams(React.useContext(RouterContext).pathname.split("?")[1] || "")],
  };
}, { virtual: true });

jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../lib/authClient", () => ({ API: "http://localhost/api", ensureCsrf: jest.fn().mockResolvedValue(undefined) }));

const HOSPITAL = {
  id: "hospital-1", name: "Northside Hospital", location: "Pune", address: "12 Care Road",
  phone: "+91 20 5550 0100", bedTypes: ["ICU", "General", "Special"],
  availableBeds: { ICU: 2, General: 4, Special: 0 }, emergency: true,
};

function render(element, initialPath = "/dashboard/patient/hospitals") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<MemoryRouter initialEntries={[initialPath]}>{element}<CurrentPath /></MemoryRouter>));
  return { container, root };
}

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

function changeValue(element, value) {
  const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
    : element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function fillRequiredBookingFields(container) {
  const values = {
    "Full name": "Patient Example", Age: "38", Gender: "female", "Blood group": "O+",
    "Mobile number": "+919900001111", "Emergency contact name": "Contact Example",
    "Emergency contact phone": "+919900001112", "Primary condition / reason for admission": "Needs hospital care",
  };
  Object.entries(values).forEach(([labelText, value]) => {
    const label = [...container.querySelectorAll("label")].find((node) => node.textContent.includes(labelText));
    changeValue(label.querySelector("input,select,textarea"), value);
  });
}

afterEach(() => jest.clearAllMocks());

describe("patient hospital discovery and bookings", () => {
  it("loads only backend hospital information and displays current bed counts", async () => {
    axios.get.mockResolvedValueOnce({ data: [HOSPITAL] });
    const { container, root } = render(<HospitalDiscoveryPage />);
    await act(async () => {});

    expect(axios.get).toHaveBeenCalledWith("http://localhost/api/hospitals", { params: {} });
    expect(container.textContent).toContain("Northside Hospital");
    expect(container.textContent).toContain("12 Care Road");
    expect(container.textContent).toContain("2 available");
    expect(container.textContent).toContain("4 available");
    expect(container.textContent).toContain("0 available");
    expect(container.textContent).not.toContain("4.5");
    expect(container.textContent).toContain("Find a hospital");
    expect(container.querySelector('button[aria-label="Request ICU bed at Northside Hospital"]')).toBeNull();
    await act(async () => container.querySelector(".care-details-button").click());
    expect(container.querySelector('[data-testid="current-path"]').textContent)
      .toBe("/dashboard/patient/hospitals/hospital-1");
    act(() => root.unmount()); container.remove();
  });

  it("provides a distinct bed-finding entry point and starts a booking from the chosen category", async () => {
    axios.get.mockResolvedValueOnce({ data: [HOSPITAL] });
    const { container, root } = render(<HospitalDiscoveryPage bookingMode />, "/dashboard/patient/bed-booking");
    await act(async () => {});

    expect(container.textContent).toContain("Find an available bed");
    expect(container.textContent).toContain("Start by choosing a hospital and a bed category");
    const chooseIcu = container.querySelector('button[aria-label="Request ICU bed at Northside Hospital"]');
    expect(chooseIcu).not.toBeNull();
    expect(chooseIcu.disabled).toBe(false);
    await act(async () => chooseIcu.click());
    expect(container.querySelector('[data-testid="current-path"]').textContent)
      .toBe("/dashboard/patient/bookings/new?hospitalId=hospital-1&bedType=ICU");
    act(() => root.unmount()); container.remove();
  });

  it("submits search text through the supported hospital search parameter", async () => {
    axios.get.mockResolvedValue({ data: [] });
    const { container, root } = render(<HospitalDiscoveryPage />);
    await act(async () => {});
    changeValue(container.querySelector("#hospital-search"), "Central Pune");
    await act(async () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(axios.get).toHaveBeenLastCalledWith("http://localhost/api/hospitals", { params: { search: "Central Pune" } });
    expect(container.textContent).toContain("No matching hospitals");
    act(() => root.unmount()); container.remove();
  });

  it("shows unavailable bed categories on the backend-backed hospital detail page", async () => {
    axios.get.mockResolvedValueOnce({ data: HOSPITAL });
    const { container, root } = render(<HospitalDetailPage />, "/dashboard/patient/hospitals/hospital-1");
    await act(async () => {});
    expect(axios.get).toHaveBeenCalledWith("http://localhost/api/hospitals/hospital-1");
    expect(container.textContent).toContain("12 Care Road");
    expect(container.textContent).toContain("Bed availability");
    const specialButton = container.querySelector('button[aria-label="Request Special bed at Northside Hospital"]');
    expect(specialButton.disabled).toBe(true);
    act(() => root.unmount()); container.remove();
  });

  it("lets a patient start a booking from hospital details after choosing an available category", async () => {
    axios.get.mockResolvedValueOnce({ data: HOSPITAL });
    const { container, root } = render(<HospitalDetailPage />, "/dashboard/patient/hospitals/hospital-1");
    await act(async () => {});

    const chooseIcu = container.querySelector('button[aria-label="Request ICU bed at Northside Hospital"]');
    expect(chooseIcu).not.toBeNull();
    expect(chooseIcu.disabled).toBe(false);
    await act(async () => chooseIcu.click());
    expect(container.querySelector('[data-testid="current-path"]').textContent)
      .toBe("/dashboard/patient/bookings/new?hospitalId=hospital-1&bedType=ICU");
    act(() => root.unmount()); container.remove();
  });

  it("shows an API error instead of fabricating hospital results", async () => {
    axios.get.mockRejectedValueOnce({ response: { data: { detail: "Hospital service unavailable" } } });
    const { container, root } = render(<HospitalDiscoveryPage />);
    await act(async () => {});
    expect(container.textContent).toContain("Hospital service unavailable");
    expect(container.textContent).not.toContain("Northside Hospital");
    act(() => root.unmount()); container.remove();
  });

  it("prevents an empty booking submission and submits validated fields with session identity", async () => {
    axios.get.mockResolvedValueOnce({ data: HOSPITAL });
    axios.post.mockResolvedValueOnce({ data: { id: "booking-1", status: "pending" } });
    const user = { id: "must-not-be-sent", name: "Patient Example", email: "patient@example.org" };
    const { container, root } = render(<BookingCreatePage user={user} />, "/dashboard/patient/bookings/new?hospitalId=hospital-1&bedType=ICU");
    await act(async () => {});

    const submitButton = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Review request"));
    expect(submitButton.disabled).toBe(false);
    await act(async () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(axios.post).not.toHaveBeenCalled();

    fillRequiredBookingFields(container);
    await act(async () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    expect(container.textContent).toContain("Review your request");
    expect(container.textContent).toContain("Patient Example · 38 · female");
    expect(axios.post).not.toHaveBeenCalled();
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Confirm & submit request")).click());

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith("http://localhost/api/bookings", expect.objectContaining({
      hospitalId: "hospital-1", bedType: "ICU", fullName: "Patient Example", age: 38,
      email: "patient@example.org", primaryCondition: "Needs hospital care",
    }));
    expect(axios.post.mock.calls[0][1]).not.toHaveProperty("patientId");
    expect(container.textContent).toContain("Your request is with the hospital");
    act(() => root.unmount()); container.remove();
  });

  it("blocks duplicate booking submission while the first request is pending", async () => {
    axios.get.mockResolvedValueOnce({ data: HOSPITAL });
    let finishRequest;
    axios.post.mockReturnValueOnce(new Promise((resolve) => { finishRequest = resolve; }));
    const { container, root } = render(<BookingCreatePage user={{ name: "Patient Example", email: "patient@example.org" }} />, "/dashboard/patient/bookings/new?hospitalId=hospital-1&bedType=ICU");
    await act(async () => {});
    fillRequiredBookingFields(container);

    await act(async () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain("Review your request");
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Confirm & submit request")).click());
    const submit = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Submitting request"));
    expect(submit.disabled).toBe(true);
    await act(async () => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(axios.post).toHaveBeenCalledTimes(1);

    await act(async () => finishRequest({ data: { id: "booking-3", status: "pending" } }));
    expect(container.textContent).toContain("Your request is with the hospital");
    act(() => root.unmount()); container.remove();
  });

  it("loads patient bookings and requires confirmation before cancellation", async () => {
    axios.get.mockResolvedValueOnce({ data: [{ id: "booking-1", hospitalId: "hospital-1", hospitalName: "Northside Hospital", bedType: "General", status: "pending", createdAt: "2026-10-01T10:00:00Z" }] });
    axios.post.mockResolvedValueOnce({ data: { id: "booking-1", status: "cancelled" } });
    const { container, root } = render(<PatientBookingsPage />, "/dashboard/patient/bookings");
    await act(async () => {});
    expect(axios.get).toHaveBeenCalledWith("http://localhost/api/bookings");
    expect(container.textContent).toContain("Northside Hospital");
    expect(container.textContent).toContain("pending");

    const cancelButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel request");
    act(() => cancelButton.click());
    expect(container.textContent).toContain("Cancel this booking?");
    expect(axios.post).not.toHaveBeenCalled();

    axios.get.mockResolvedValueOnce({ data: [{ id: "booking-1", hospitalId: "hospital-1", hospitalName: "Northside Hospital", bedType: "General", status: "cancelled", createdAt: "2026-10-01T10:00:00Z" }] });
    const confirm = [...container.querySelectorAll("button")].find((button) => button.textContent === "Confirm cancellation");
    await act(async () => confirm.click());
    expect(axios.post).toHaveBeenCalledWith("http://localhost/api/bookings/booking-1/cancel");
    act(() => root.unmount()); container.remove();
  });

  it("loads an owned booking detail and does not show cancellation for terminal status", async () => {
    axios.get.mockResolvedValueOnce({ data: {
      id: "booking-2", hospitalId: "hospital-1", hospitalName: "Northside Hospital", bedType: "ICU",
      status: "cancelled", fullName: "Patient Example", primaryCondition: "Recovery care",
      admissionTime: "flexible", createdAt: "2026-10-02T10:00:00Z", updatedAt: "2026-10-03T10:00:00Z",
    } }).mockResolvedValueOnce({ data: HOSPITAL });
    const { container, root } = render(<PatientBookingDetailPage />, "/dashboard/patient/bookings/booking-2");
    await act(async () => {});
    expect(axios.get).toHaveBeenNthCalledWith(1, "http://localhost/api/bookings/booking-2");
    expect(axios.get).toHaveBeenNthCalledWith(2, "http://localhost/api/hospitals/hospital-1");
    expect(container.textContent).toContain("Recovery care");
    expect(container.textContent).toContain("12 Care Road");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent.includes("Cancel booking"))).toBe(false);
    act(() => root.unmount()); container.remove();
  });
});
