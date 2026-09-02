import { api } from "./api.js";
import { notify } from "./toast.js";

const TOKEN_KEY = "naijacart_token";
const USER_KEY = "naijacart_user";
const dashboard = document.getElementById("dashboard");
const productError = document.getElementById("product-error");
const productSuccess = document.getElementById("product-success");
const productsError = document.getElementById("products-error");
const productList = document.getElementById("product-list");
const ordersError = document.getElementById("orders-error");
const pendingOrdersList = document.getElementById("pending-orders-list");
const deliveredOrdersList = document.getElementById("delivered-orders-list");
const usersList = document.getElementById("users-list");
const productIdField = document.getElementById("product-id");
const productSubmitButton = document.querySelector(
  "#product-form button[type='submit']",
);

function resetProductForm() {
  document.getElementById("product-form").reset();
  productIdField.value = "";
  document.getElementById("product-stock").value = "0";
  productSubmitButton.textContent = "Add product";
}

document.querySelectorAll(".admin-password-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const input = button.parentElement.querySelector("input");
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    button.textContent = visible ? "Hide" : "Show";
    button.setAttribute(
      "aria-label",
      visible ? "Hide password" : "Show password",
    );
    button.setAttribute("aria-pressed", String(visible));
  });
});

function currentUser() {
  const raw = sessionStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

function showDashboard() {
  dashboard.hidden = false;
  setupSectionNavigation();
  loadSummary();
  loadProducts();
  loadOrders();
  loadUsers();
}

function renderSummary(summary) {
  document.getElementById("stat-products").textContent = summary.products ?? 0;
  document.getElementById("stat-pending-orders").textContent =
    summary.pending_orders ?? 0;
  document.getElementById("stat-orders").textContent = summary.orders ?? 0;
  document.getElementById("stat-users").textContent = summary.users ?? 0;
}

function setupSectionNavigation() {
  const buttons = document.querySelectorAll(".admin-nav-button");
  const sections = document.querySelectorAll("[data-section-panel]");

  function showSection(targetId) {
    buttons.forEach((item) =>
      item.classList.toggle("active", item.dataset.section === targetId),
    );
    sections.forEach((section) => {
      const active = section.id === targetId;
      section.hidden = !active;
      section.classList.toggle("active", active);
    });
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      showSection(button.dataset.section);
    });
  });

  document.querySelectorAll("[data-section-target]").forEach((card) => {
    card.addEventListener("click", () => {
      showSection(card.dataset.sectionTarget);
      document.getElementById(card.dataset.sectionTarget)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  });
}

async function loadSummary() {
  try {
    const summary = await api.getAdminSummary();
    renderSummary(summary);
  } catch (error) {
    productsError.textContent = error.message;
    productsError.hidden = false;
  }
}

function renderProducts(products) {
  productList.innerHTML = products.length
    ? products
        .map(
          (product) => `
            <article class="admin-product-row">
              <div>
                <strong>${product.name}</strong>
                <span>${product.category} · ₦${Number(product.price).toLocaleString("en-NG")} · ${product.stock} in stock</span>
              </div>
              <div class="admin-product-actions">
                <button class="btn btn-secondary btn-sm" type="button" data-edit-id="${product.id}">Edit</button>
                <button class="btn btn-danger btn-sm" type="button" data-delete-id="${product.id}">Remove</button>
              </div>
            </article>
          `,
        )
        .join("")
    : `<p class="cart-empty">No products in the catalogue.</p>`;

  productList.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = products.find(
        (item) => item.id === Number(button.dataset.editId),
      );
      if (!product) return;
      productIdField.value = String(product.id);
      document.getElementById("product-name").value = product.name || "";
      document.getElementById("product-category").value =
        product.category || "";
      document.getElementById("product-price").value = product.price ?? 0;
      document.getElementById("product-stock").value = product.stock ?? 0;
      document.getElementById("product-description").value =
        product.description || "";
      productSubmitButton.textContent = "Save changes";
      document.getElementById("product-name").focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  productList.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const product = products.find(
        (item) => item.id === Number(button.dataset.deleteId),
      );
      if (!product || !confirm(`Remove ${product.name} from the catalogue?`))
        return;
      button.disabled = true;
      try {
        await api.deleteProduct(product.id);
        notify(`${product.name} removed from the catalogue.`);
        await loadProducts();
      } catch (error) {
        productsError.textContent = error.message;
        productsError.hidden = false;
        button.disabled = false;
      }
    });
  });
}

async function loadProducts() {
  productsError.hidden = true;
  try {
    renderProducts(await api.getProducts());
  } catch (error) {
    productsError.textContent = error.message;
    productsError.hidden = false;
  }
}

function orderMarkup(orders) {
  return orders.length
    ? orders
        .map(
          (order) => `
            <article class="admin-order-row">
              <div class="admin-order-header">
                <strong>Order #${order.id}</strong>
                <span>${new Date(order.created_at).toLocaleDateString()} · ${order.status}</span>
                <button class="btn btn-danger btn-sm" data-delete-order-id="${order.id}">Delete Order</button>
              </div>
              <div class="admin-order-customer">
                <p><strong>Customer:</strong> ${order.first_name} ${order.last_name}</p>
                <p><strong>Email:</strong> ${order.email}</p>
                <p><strong>Phone:</strong> ${order.user_phone || order.phone}</p>
                <p><strong>Delivery Address:</strong> ${order.delivery_address}</p>
              </div>
              <div class="admin-order-items">
                <strong>Items:</strong>
                ${order.items
                  .map(
                    (item) => `
                  <div class="admin-order-item">
                    ${item.product_name} × ${item.quantity} · ₦${Number(item.unit_price).toLocaleString("en-NG")}
                  </div>
                `,
                  )
                  .join("")}
              </div>
              <div class="admin-order-total">
                <strong>Total: ₦${Number(order.total).toLocaleString("en-NG")}</strong>
              </div>
            </article>
          `,
        )
        .join("")
    : `<p class="cart-empty">No orders in this section.</p>`;
}

function attachOrderActions(list) {
  list.querySelectorAll("[data-delete-order-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const orderId = Number(button.dataset.deleteOrderId);
      if (!confirm("Are you sure you want to delete this order?")) return;
      button.disabled = true;
      try {
        await api.deleteOrder(orderId);
        notify("Order deleted successfully.");
        await loadOrders();
      } catch (error) {
        ordersError.textContent = error.message;
        ordersError.hidden = false;
        button.disabled = false;
      }
    });
  });
}

function renderOrders(orders) {
  const pending = orders.filter((order) => order.status !== "delivered");
  const delivered = orders.filter((order) => order.status === "delivered");
  pendingOrdersList.innerHTML = orderMarkup(pending);
  deliveredOrdersList.innerHTML = orderMarkup(delivered);
  attachOrderActions(pendingOrdersList);
  attachOrderActions(deliveredOrdersList);
}

async function loadOrders() {
  ordersError.hidden = true;
  try {
    renderOrders(await api.getAdminOrders());
  } catch (error) {
    ordersError.textContent = error.message;
    ordersError.hidden = false;
  }
}

function renderUsers(users) {
  usersList.innerHTML = users.length
    ? users
        .map(
          (user) => `
            <article class="admin-user-row">
              <div>
                <strong>${user.full_name || `${user.first_name} ${user.last_name}`}</strong>
                <span>${user.email}</span>
              </div>
              <div class="admin-user-meta">
                <span>${user.is_admin ? "Administrator" : "Customer"}</span>
                <span>${user.phone || "No phone provided"}</span>
              </div>
            </article>
          `,
        )
        .join("")
    : `<p class="cart-empty">No users found.</p>`;
}

async function loadUsers() {
  const usersError = document.getElementById("users-error");
  usersError.hidden = true;
  try {
    renderUsers(await api.getAdminUsers());
  } catch (error) {
    usersError.textContent = error.message;
    usersError.hidden = false;
  }
}

document
  .getElementById("product-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    productError.hidden = true;
    productSuccess.hidden = true;

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const imageFile = document.getElementById("product-image").files[0];
    const editingId = productIdField.value
      ? Number(productIdField.value)
      : null;

    try {
      if (imageFile) {
        const uploaded = await api.uploadProductImage(imageFile);
        data.image_url = uploaded.image_url;
      }
      delete data.image;
      delete data.id;

      if (editingId) {
        await api.updateProduct(editingId, data);
        productSuccess.textContent = "Product updated successfully.";
        notify(`${data.name} updated.`);
      } else {
        await api.createProduct(data);
        productSuccess.textContent = "Product added to the live catalogue.";
        notify(`${data.name} added to the catalogue.`);
      }

      resetProductForm();
      await loadProducts();
      productSuccess.hidden = false;
    } catch (error) {
      productError.textContent = error.message;
      productError.hidden = false;
    }
  });

document
  .getElementById("admin-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const errorMessage = document.getElementById("admin-error");
    const successMessage = document.getElementById("admin-success");
    errorMessage.hidden = true;
    successMessage.hidden = true;
    try {
      await api.createAdmin(Object.fromEntries(new FormData(form)));
      form.reset();
      successMessage.textContent = "Admin account created successfully.";
      successMessage.hidden = false;
      notify("Admin account created successfully.");
    } catch (error) {
      errorMessage.textContent = error.message;
      errorMessage.hidden = false;
    }
  });

document.getElementById("admin-signout").addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  window.location.replace("index.html");
});

if (currentUser()?.is_admin && sessionStorage.getItem(TOKEN_KEY))
  showDashboard();
else window.location.replace("index.html");
