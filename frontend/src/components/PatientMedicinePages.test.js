import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import axios from "axios";
import { MedicineCataloguePage, MedicineDetailPage } from "./PatientMedicinePages";
import { ensureCsrf } from "../lib/authClient";

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
    useParams: () => ({ medicineId: React.useContext(RouterContext).pathname.split("/").pop() }),
    useLocation: () => ({ pathname: React.useContext(RouterContext).pathname }),
  };
}, { virtual: true });

jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../lib/authClient", () => ({ API: "http://localhost/api", ensureCsrf: jest.fn().mockResolvedValue(undefined) }));

const MEDICINE = {
  id: "med-1", name: "Saline Oral Rehydration", category: "Hydration", type: "OTC",
  description: "Oral hydration product.", price: 24.5, dosage: "Powder sachet",
  manufacturer: "Example Health", expiryDate: "2028-06-30", inStock: 8,
  imageUrl: null, imageSource: null, imageAlt: null, prescriptionRequired: false,
  activeIngredients: ["Glucose", "Electrolytes"], warnings: [], isDemo: true,
};
const CATEGORIES = [
  { value: "Hydration", label: "Hydration" },
  { value: "Vitamins", label: "Vitamins" },
];
const PRESCRIPTION_MEDICINE = { ...MEDICINE, id: "med-2", name: "Prescription Example", prescriptionRequired: true };

function render(element, initialPath = "/dashboard/patient/medicines") {
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

async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function click(element) {
  act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function changeInput(element, value) {
  const prototype = element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function cleanup(root, container) {
  act(() => root.unmount());
  container.remove();
}

beforeEach(() => {
  axios.get.mockReset();
  axios.post.mockReset();
  ensureCsrf.mockReset().mockResolvedValue(undefined);
});

describe("patient medicine catalogue", () => {
  it("loads backend results, searches through the backend, and opens a medicine detail route", async () => {
    axios.get.mockResolvedValueOnce({ data: [MEDICINE, PRESCRIPTION_MEDICINE] })
      .mockResolvedValueOnce({ data: CATEGORIES })
      .mockResolvedValueOnce({ data: [MEDICINE] });
    const { container, root } = render(<MedicineCataloguePage />);
    await settle();

    expect(axios.get).toHaveBeenCalledWith("http://localhost/api/medicines", { params: {} });
    expect(container.textContent).toContain("₹24.50");
    expect(container.textContent).toContain("8 available");
    expect(container.textContent).toContain("Demo listing");
    expect(container.textContent).toContain("Prescription required");
    expect(container.querySelector('img[alt="Product image unavailable for Saline Oral Rehydration"]').getAttribute("src")).toBe("/images/medicine-placeholder.svg");
    expect(container.textContent).not.toContain("Add to Cart");
    expect(container.querySelector('button[aria-label="Add Saline Oral Rehydration to cart"]')).toBeNull();

    changeInput(container.querySelector("#medicine-search-input"), "saline");
    click(container.querySelector('.medicine-search button[type="submit"]'));
    expect(axios.get).toHaveBeenLastCalledWith("http://localhost/api/medicines", { params: { search: "saline" } });
    await settle();

    click(container.querySelector('button[aria-label="View details for Saline Oral Rehydration"]'));
    expect(container.querySelector('[data-testid="current-path"]').textContent).toBe("/dashboard/patient/medicines/med-1");
    cleanup(root, container);
  });

  it("filters by a backend-supported category and clears category and text search", async () => {
    axios.get.mockResolvedValueOnce({ data: [MEDICINE] })
      .mockResolvedValueOnce({ data: CATEGORIES })
      .mockResolvedValueOnce({ data: [MEDICINE] })
      .mockResolvedValueOnce({ data: [MEDICINE] })
      .mockResolvedValueOnce({ data: [MEDICINE] });
    const { container, root } = render(<MedicineCataloguePage />);
    await settle();

    const category = container.querySelector("#medicine-category-filter");
    expect(category).not.toBeNull();
    changeInput(category, "Hydration");
    expect(axios.get).toHaveBeenLastCalledWith("http://localhost/api/medicines", { params: { category: "Hydration" } });
    await settle();

    changeInput(container.querySelector("#medicine-search-input"), "saline");
    click(container.querySelector('.medicine-search button[type="submit"]'));
    expect(axios.get).toHaveBeenLastCalledWith("http://localhost/api/medicines", { params: { search: "saline", category: "Hydration" } });
    await settle();

    click(container.querySelector('button[aria-label="Clear medicine search and filters"]'));
    expect(container.querySelector("#medicine-search-input").value).toBe("");
    expect(container.querySelector("#medicine-category-filter").value).toBe("");
    expect(axios.get).toHaveBeenLastCalledWith("http://localhost/api/medicines", { params: {} });
    cleanup(root, container);
  });

  it("shows explicit empty and recoverable error states", async () => {
    axios.get.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: CATEGORIES });
    const empty = render(<MedicineCataloguePage />);
    await settle();
    expect(empty.container.textContent).toContain("No medicines found");
    cleanup(empty.root, empty.container);

    axios.get.mockRejectedValueOnce({ response: { data: { detail: "Catalogue unavailable" } } }).mockResolvedValueOnce({ data: CATEGORIES });
    const failed = render(<MedicineCataloguePage />);
    await settle();
    expect(failed.container.querySelector('[role="alert"]').textContent).toContain("Catalogue unavailable");
    cleanup(failed.root, failed.container);
  });

  it("renders backend detail information, image fallback, and the prescription-required notice", async () => {
    axios.get.mockResolvedValueOnce({ data: { ...MEDICINE, prescriptionRequired: true, imageUrl: null } });
    const { container, root } = render(<MedicineDetailPage />, "/dashboard/patient/medicines/med-1");
    await settle();

    expect(axios.get).toHaveBeenCalledWith("http://localhost/api/medicines/med-1");
    expect(container.querySelector('img[alt="Product image unavailable for Saline Oral Rehydration"]')).not.toBeNull();
    expect(container.querySelector(".medicine-detail-layout img").getAttribute("src")).toBe("/images/medicine-placeholder.svg");
    expect(container.textContent).toContain("Prescription required");
    expect(container.textContent).toContain("Prescription verification is not available");
    expect(container.textContent).toContain("Expiry date");
    cleanup(root, container);
  });

  it("shows a specific not-found state for medicines the backend no longer serves", async () => {
    axios.get.mockRejectedValueOnce({ response: { status: 404, data: { detail: "Medicine not found" } } });
    const { container, root } = render(<MedicineDetailPage />, "/dashboard/patient/medicines/missing-id");
    await settle();

    expect(container.querySelector('[role="alert"]').textContent).toContain("not found or is no longer available");
    expect(container.textContent).toContain("Back to catalogue");
    cleanup(root, container);
  });

  it("validates quantity and posts only the medicine ID and quantity, preventing duplicate submissions", async () => {
    axios.get.mockResolvedValueOnce({ data: MEDICINE });
    let finishRequest;
    axios.post.mockReturnValueOnce(new Promise((resolve) => { finishRequest = resolve; }));
    const { container, root } = render(<MedicineDetailPage />, "/dashboard/patient/medicines/med-1");
    await settle();

    const quantity = container.querySelector("#medicine-quantity");
    changeInput(quantity, "0");
    expect(quantity.value).toBe("1");
    changeInput(quantity, "3");
    const submit = container.querySelector('.medicine-add-form button[type="submit"]');
    click(submit);
    click(submit);
    await settle();
    expect(ensureCsrf).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith("http://localhost/api/cart/add", { medicineId: "med-1", quantity: 3 });
    await act(async () => { finishRequest({ data: { message: "Item added to cart" } }); });
    expect(container.querySelector('[role="status"]').textContent).toContain("was added to your cart");
    cleanup(root, container);
  });

  it("respects backend stock in quantity controls and reports an add-to-cart stock conflict", async () => {
    axios.get.mockResolvedValueOnce({ data: MEDICINE });
    axios.post.mockRejectedValueOnce({ response: { status: 409, data: { detail: "Requested quantity is not currently available" } } });
    const { container, root } = render(<MedicineDetailPage />, "/dashboard/patient/medicines/med-1");
    await settle();
    changeInput(container.querySelector("#medicine-quantity"), "99");
    expect(container.querySelector("#medicine-quantity").value).toBe("8");
    click(container.querySelector('.medicine-add-form button[type="submit"]'));
    await settle();
    expect(container.querySelector('[role="alert"]').textContent).toContain("Requested quantity is not currently available");
    cleanup(root, container);
  });

  it("shows backend errors for unavailable or expired medicines during add-to-cart", async () => {
    axios.get.mockResolvedValueOnce({ data: MEDICINE });
    axios.post.mockRejectedValueOnce({ response: { status: 409, data: { detail: "Expired medicine is unavailable" } } });
    const { container, root } = render(<MedicineDetailPage />, "/dashboard/patient/medicines/med-1");
    await settle();
    click(container.querySelector('.medicine-add-form button[type="submit"]'));
    await settle();

    expect(container.querySelector('[role="alert"]').textContent).toContain("Expired medicine is unavailable");
    cleanup(root, container);
  });

  it("does not allow adding a backend-reported unavailable medicine", async () => {
    axios.get.mockResolvedValueOnce({ data: { ...MEDICINE, inStock: 0 } });
    const { container, root } = render(<MedicineDetailPage />, "/dashboard/patient/medicines/med-1");
    await settle();
    expect(container.querySelector('.medicine-add-form button[type="submit"]').disabled).toBe(true);
    expect(container.textContent).toContain("Currently unavailable");
    expect(axios.post).not.toHaveBeenCalled();
    cleanup(root, container);
  });
});
