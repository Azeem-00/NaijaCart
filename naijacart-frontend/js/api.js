// js/api.js -- the one place that talks to the NaijaCart backend.
const API_HOST = window.location.hostname || "127.0.0.1";
const isLocal = ["localhost", "127.0.0.1"].includes(API_HOST);
const BASE = isLocal
  ? `http://${API_HOST}:5000/api`
  : `${window.location.origin}/api`;
const PAYSTACK_PUBLIC_KEY = "pk_test_9adeaa255868f67d25dc1ec46c9f97d14971d42b";

function authHeaders() {
  const token = sessionStorage.getItem("naijacart_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(
  path,
  { method = "GET", body, isFormData = false } = {},
) {
  const res = await fetch(BASE + path, {
    method,
    headers: isFormData
      ? authHeaders()
      : { "Content-Type": "application/json", ...authHeaders() },
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    const isAuthAttempt = path === "/auth/login" || path === "/auth/register";

    if (isAuthAttempt) {
      throw new Error(data.error || "Authentication failed.");
    }

    sessionStorage.removeItem("naijacart_token");
    sessionStorage.removeItem("naijacart_user");
    throw new Error("Your sign-in session has expired. Please sign in again.");
  }

  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  getProducts: (params = {}) => {
    const clean = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== "" && v != null),
    );
    return request(`/products?${new URLSearchParams(clean)}`);
  },
  getProduct: (id) => request(`/products/${id}`),

  register: (body) => request("/auth/register", { method: "POST", body }),
  login: (body) => request("/auth/login", { method: "POST", body }),
  updateProfile: (body) => request("/auth/profile", { method: "PUT", body }),
  createAdmin: (body) => request("/admins", { method: "POST", body }),
  uploadProductImage: (file) => {
    const formData = new FormData();
    formData.append("image", file);
    return request("/uploads", {
      method: "POST",
      body: formData,
      isFormData: true,
    });
  },

  createOrder: (body) => request("/orders", { method: "POST", body }),
  verifyPayment: (reference) =>
    request("/verify-payment", {
      method: "POST",
      body: { reference },
    }),
  initializePayment: (body) =>
    request("/initialize-payment", { method: "POST", body }),
  getOrders: () => request("/orders"),
  getAdminOrders: () => request("/admin/orders"),
  getAdminSummary: () => request("/admin/summary"),
  getAdminUsers: () => request("/admin/users"),
  deleteOrder: (id) => request(`/admin/orders/${id}`, { method: "DELETE" }),

  createProduct: (body) => request("/products", { method: "POST", body }),
  updateProduct: (id, body) =>
    request(`/products/${id}`, { method: "PUT", body }),
  deleteProduct: (id) => request(`/products/${id}`, { method: "DELETE" }),
};

export { PAYSTACK_PUBLIC_KEY };
