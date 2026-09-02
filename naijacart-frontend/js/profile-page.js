import { api } from "./api.js";
import { auth } from "./auth.js";
import { naira } from "./cart.js";

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>\"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function initials(user) {
  return `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`.toUpperCase();
}

function formatDate(value) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

function showError(message) {
  const error = document.getElementById("profile-page-error");
  error.textContent = message;
  error.hidden = false;
}

function renderOrders(orders) {
  const target = document.getElementById("profile-page-orders");
  if (!orders.length) {
    target.innerHTML =
      '<div class="profile-empty"><strong>No orders yet</strong><span>Your completed checkouts will appear here.</span></div>';
    return;
  }
  target.innerHTML = orders
    .map(
      (order) => `
    <article id="order-${order.id}" class="profile-order">
      <div class="profile-order-head">
        <div><strong>Order #${order.id}</strong><span>${formatDate(order.created_at)}</span></div>
        <span class="order-status order-status-${escapeHtml(order.status)}">${escapeHtml(order.status || "pending")}</span>
      </div>
      <p class="profile-order-items">${order.items.map((item) => `${escapeHtml(item.product_name)} × ${item.quantity}`).join(", ")}</p>
      <div class="profile-order-foot"><span>${escapeHtml(order.delivery_address)}</span><strong>${naira(order.total)}</strong></div>
    </article>
  `,
    )
    .join("");
}

async function init() {
  if (!auth.isLoggedIn()) {
    window.location.href = "index.html?login=1";
    return;
  }

  const user = auth.currentUser();
  if (!user) {
    auth.logout();
    window.location.href = "index.html?login=1";
    return;
  }
  document.getElementById("profile-avatar").textContent = initials(user);
  document.getElementById("profile-name").textContent = user.name;
  document.getElementById("profile-email").textContent = user.email;
  const memberSince = document.getElementById("profile-member-since");
  if (memberSince) {
    memberSince.textContent = user.created_at
      ? formatDate(user.created_at)
      : "NaijaCart member";
  }
  document.getElementById("profile-page-first-name").value =
    user.first_name || "";
  document.getElementById("profile-page-last-name").value =
    user.last_name || "";
  document.getElementById("profile-page-email").value = user.email || "";
  document.getElementById("profile-page-address").value = user.address || "";

  const ordersTarget = document.getElementById("profile-page-orders");
  ordersTarget.innerHTML =
    '<p class="profile-loading">Loading your orders...</p>';
  try {
    const orders = await api.getOrders();
    renderOrders(orders);
    const requestedOrderId = new URLSearchParams(window.location.search).get(
      "order_id",
    );
    const requestedOrder =
      requestedOrderId && document.getElementById(`order-${requestedOrderId}`);
    if (requestedOrder) {
      requestedOrder.classList.add("profile-order-focused");
      requestedOrder.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  } catch (error) {
    ordersTarget.innerHTML = `<p class="form-error">${escapeHtml(error.message || "Orders could not be loaded.")}</p>`;
  }

  const form = document.getElementById("profile-page-form");
  const message = document.getElementById("profile-page-message");
  const save = document.getElementById("profile-page-save");
  document.getElementById("profile-signout").addEventListener("click", () => {
    auth.logout();
    window.location.replace("index.html");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    message.hidden = true;
    save.disabled = true;
    save.textContent = "Saving...";
    const data = Object.fromEntries(new FormData(form));
    try {
      const updated = await auth.updateProfile(
        data.first_name,
        data.last_name,
        data.address,
      );
      document.getElementById("profile-avatar").textContent = initials(updated);
      document.getElementById("profile-name").textContent = updated.name;
      message.className = "form-success";
      message.textContent = "Your profile has been updated.";
      message.hidden = false;
    } catch (error) {
      message.className = "form-error";
      message.textContent = error.message;
      message.hidden = false;
      message.focus();
    } finally {
      save.disabled = false;
      save.textContent = "Save changes";
    }
  });
}

init().catch((error) =>
  showError(error.message || "Your profile could not be loaded."),
);
