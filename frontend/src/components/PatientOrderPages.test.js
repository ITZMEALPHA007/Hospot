import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import { PatientCartPage, PatientOrdersPage, PatientOrderDetailPage } from "./PatientOrderPages";
import { ensureCsrf } from "../lib/authClient";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("react-router-dom", () => {
  const React = require("react");
  const Context = React.createContext(null);
  return {
    Link: ({ to, children, ...props }) => React.createElement("a", { href: to, ...props }, children),
    useNavigate: () => React.useContext(Context).navigate,
    useParams: () => ({ orderId: React.useContext(Context).pathname.split("/").pop() }),
    useLocation: () => ({ pathname: React.useContext(Context).pathname }),
    MemoryRouter: ({ initialEntries, children }) => {
      const [pathname, navigate] = React.useState(initialEntries?.[0] || "/");
      return React.createElement(Context.Provider, { value: { pathname, navigate } }, children);
    },
  };
}, { virtual: true });

jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
jest.mock("../lib/authClient", () => ({ API: "http://localhost/api", ensureCsrf: jest.fn().mockResolvedValue(undefined) }));

const CART = { id: "cart-1", userId: "patient-1", totalAmount: 72.51, items: [{ medicineId: "med-1", medicineName: "ORS Sachets", price: 24.17, quantity: 3 }] };
const ORDER = { id: "order-12345678", orderDate: "2026-10-29T10:30:00Z", totalAmount: 48, itemSubtotal: 48, deliveryFee: 0, currency: "INR", fulfillmentMethod: "PICKUP", status: "ready_for_pickup", items: [{ medicineId: "med-1", medicineName: "ORS Sachets", price: 24, quantity: 2 }] };

function CurrentPath() { const location = require("react-router-dom").useLocation(); return <output data-testid="current-path">{location.pathname}</output>; }
function render(element, path = "/") {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<MemoryRouter initialEntries={[path]}>{element}<CurrentPath /></MemoryRouter>));
  return { container, root };
}

async function settle() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
function click(element) { act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }
function cleanup(root, container) { act(() => root.unmount()); container.remove(); }

beforeEach(() => {
  axios.get.mockReset(); axios.put.mockReset(); axios.delete.mockReset();
  ensureCsrf.mockReset().mockResolvedValue(undefined);
});

describe("patient cart dashboard page", () => {
  it("loads backend cart data, displays INR totals and provides checkout and shopping links", async () => {
    axios.get.mockResolvedValueOnce({ data: CART });
    const { container, root } = render(<PatientCartPage />);
    await settle();
    expect(axios.get).toHaveBeenCalledWith("http://localhost/api/cart");
    expect(container.textContent).toContain("ORS Sachets");
    expect(container.textContent).toContain("₹72.51");
    expect(container.textContent).toContain("Any delivery fee or pickup details are shown during checkout");
    expect(container.querySelector('a[href="/dashboard/patient/medicines"]')).not.toBeNull();
    expect(container.textContent).toContain("Proceed to checkout");
    expect(container.querySelector(".patient-cart-image img").getAttribute("src")).toBe("/images/medicine-placeholder.svg");
    cleanup(root, container);
  });

  it("updates quantities and removes lines through the authenticated CSRF-aware client", async () => {
    axios.get.mockResolvedValueOnce({ data: CART }).mockResolvedValueOnce({ data: { ...CART, totalAmount: 48.34, items: [{ ...CART.items[0], quantity: 2 }] } }).mockResolvedValueOnce({ data: { ...CART, totalAmount: 0, items: [] } });
    axios.put.mockResolvedValueOnce({ data: { message: "Cart updated" } });
    axios.delete.mockResolvedValueOnce({ data: { message: "Item removed from cart" } });
    const { container, root } = render(<PatientCartPage />);
    await settle();
    click(container.querySelector('button[aria-label="Decrease ORS Sachets quantity"]'));
    await settle();
    expect(ensureCsrf).toHaveBeenCalledTimes(1);
    expect(axios.put).toHaveBeenCalledWith("http://localhost/api/cart/update", null, { params: { medicine_id: "med-1", quantity: 2 } });
    click(container.querySelector(".patient-cart-remove"));
    await settle();
    expect(axios.delete).toHaveBeenCalledWith("http://localhost/api/cart/remove/med-1");
    expect(container.textContent).toContain("Your cart is empty");
    cleanup(root, container);
  });

  it("shows backend errors and a real empty-cart state", async () => {
    axios.get.mockRejectedValueOnce({ response: { data: { detail: "Cart service unavailable" } } });
    const failed = render(<PatientCartPage />); await settle();
    expect(failed.container.querySelector('[role="alert"]').textContent).toContain("Cart service unavailable");
    cleanup(failed.root, failed.container);
    axios.get.mockResolvedValueOnce({ data: { ...CART, items: [], totalAmount: 0 } });
    const empty = render(<PatientCartPage />); await settle();
    expect(empty.container.textContent).toContain("Your cart is empty");
    cleanup(empty.root, empty.container);
  });
});

describe("patient orders dashboard page", () => {
  it("renders actual order fields, INR totals, fulfilment and status with working details navigation", async () => {
    axios.get.mockResolvedValueOnce({ data: [ORDER] });
    const { container, root } = render(<PatientOrdersPage />);
    await settle();
    expect(axios.get).toHaveBeenCalledWith("http://localhost/api/orders");
    expect(container.textContent).toContain("#12345678");
    expect(container.textContent).toContain("ORS Sachets");
    expect(container.textContent).toContain("₹48.00");
    expect(container.textContent).toContain("Pickup");
    expect(container.textContent).toContain("Ready For Pickup");
    click(container.querySelector(".patient-order-card button"));
    expect(container.querySelector('[data-testid="current-path"]').textContent).toBe("/orders/order-12345678");
    cleanup(root, container);
  });

  it("supports empty and recoverable API-error states", async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    const empty = render(<PatientOrdersPage />); await settle();
    expect(empty.container.textContent).toContain("No orders yet"); cleanup(empty.root, empty.container);
    axios.get.mockRejectedValueOnce({ response: { data: { detail: "Orders are unavailable" } } });
    const failed = render(<PatientOrdersPage />); await settle();
    expect(failed.container.querySelector('[role="alert"]').textContent).toContain("Orders are unavailable"); cleanup(failed.root, failed.container);
  });

  it("loads the patient-scoped order detail endpoint", async () => {
    axios.get.mockResolvedValueOnce({ data: ORDER });
    const { container, root } = render(<PatientOrderDetailPage />, "/orders/order-12345678");
    await settle();
    expect(axios.get).toHaveBeenCalledWith("http://localhost/api/orders/order-12345678");
    expect(container.textContent).toContain("No courier tracking or payment status is available");
    cleanup(root, container);
  });
});
