import { auth } from "./auth.js";
import { cart, naira } from "./cart.js";
import { notify } from "./toast.js";

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
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

function imageUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return "assets/img/placeholder.svg";
  if (
    /^(https?:\/\/|data:image\/|blob:|\/|\.\/|assets\/|uploads\/)/i.test(url)
  ) {
    return url;
  }
  return "assets/img/placeholder.svg";
}

function openDialog(dialog) {
  if (dialog && typeof dialog.showModal === "function") dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog && typeof dialog.close === "function") dialog.close();
}

let accountMenuCloseTimer = null;

function clearAccountMenuCloseTimer() {
  if (accountMenuCloseTimer) {
    clearTimeout(accountMenuCloseTimer);
    accountMenuCloseTimer = null;
  }
}

function closeAccountMenu() {
  const menu = document.getElementById("account-menu");
  const button = document.getElementById("account-btn");
  const wrap = document.querySelector(".account-menu-wrap");
  if (!menu || !button) return;
  menu.hidden = true;
  button.setAttribute("aria-expanded", "false");
  wrap?.classList.remove("is-open");
  clearAccountMenuCloseTimer();
}

function toggleAccountMenu(forceOpen) {
  const menu = document.getElementById("account-menu");
  const button = document.getElementById("account-btn");
  const wrap = document.querySelector(".account-menu-wrap");
  if (!menu || !button) return;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : menu.hidden;
  menu.hidden = !shouldOpen;
  button.setAttribute("aria-expanded", String(shouldOpen));
  wrap?.classList.toggle("is-open", shouldOpen);
  if (shouldOpen) {
    clearAccountMenuCloseTimer();
  }
}

function scheduleAccountMenuClose() {
  clearAccountMenuCloseTimer();
  accountMenuCloseTimer = setTimeout(() => {
    closeAccountMenu();
  }, 180);
}

function renderAccountLabel() {
  const button = document.getElementById("account-btn");
  const adminLink = document.getElementById("admin-link");
  const user = auth.currentUser();
  if (!button) return;

  if (user) {
    const nameParts = user.name?.trim().split(/\s+/).filter(Boolean) || [];
    const initials =
      nameParts.length > 1
        ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`
        : nameParts[0]?.slice(0, 2) || "";
    button.textContent = initials ? initials.toUpperCase() : "Profile";
    button.title = "Click to edit profile or sign out";
    button.classList.add("profile-trigger");
  } else {
    button.textContent = "Sign in";
    button.title = "Sign in";
    button.classList.remove("profile-trigger");
  }

  if (adminLink) adminLink.hidden = !(user && user.is_admin);
  if (!user) closeAccountMenu();
}

function bindAuthDialog() {
  const authDialog = document.getElementById("auth-dialog");
  const authForm = document.getElementById("auth-form");
  const authTitle = document.getElementById("auth-title");
  const authSubmit = document.getElementById("auth-submit");
  const authToggle = document.getElementById("auth-toggle");
  const authError = document.getElementById("auth-error");
  const authNameFields = document.getElementById("auth-name-fields");
  const authLastNameField = document.getElementById("auth-last-name-field");
  const authPhoneField = document.getElementById("auth-phone-field");
  const authAddressField = document.getElementById("auth-address-field");

  let isLoginMode = true;

  function setAuthMode(loginMode) {
    isLoginMode = loginMode;
    authTitle.textContent = isLoginMode ? "Sign in" : "Create account";
    authSubmit.textContent = isLoginMode ? "Sign in" : "Create account";
    authToggle.textContent = isLoginMode
      ? "New here? Create an account"
      : "Already have an account? Sign in";
    authNameFields.hidden = isLoginMode;
    authLastNameField.hidden = isLoginMode;
    authPhoneField.hidden = isLoginMode;
    authAddressField.hidden = isLoginMode;
    [
      document.getElementById("auth-first-name"),
      document.getElementById("auth-last-name"),
      document.getElementById("auth-phone"),
      document.getElementById("auth-address"),
    ].forEach((input) => {
      input.disabled = isLoginMode;
    });
    authError.hidden = true;
  }

  authForm.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      authError.hidden = true;
    });
  });

  document.querySelectorAll(".password-toggle").forEach((button) => {
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

  authToggle.addEventListener("click", () => setAuthMode(!isLoginMode));
  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(authDialog));
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!authForm.reportValidity()) return;
    authError.hidden = true;

    const formData = new FormData(authForm);
    const data = Object.fromEntries(formData);
    authSubmit.disabled = true;

    try {
      if (isLoginMode) {
        const user = await auth.login(data.email, data.password);
        if (user.is_admin) {
          window.location.href = "admin.html";
          return;
        }
      } else {
        await auth.register(
          data.first_name,
          data.last_name,
          data.email,
          data.phone,
          data.address,
          data.password,
        );
      }
      notify(isLoginMode ? "Welcome back." : "Your account was created.");
      closeDialog(authDialog);
      renderAccountLabel();
      window.location.href = "profile.html";
    } catch (error) {
      if (!authDialog.open) openDialog(authDialog);
      authError.textContent = error.message;
      authError.hidden = false;
      authError.focus();
    } finally {
      authSubmit.disabled = false;
    }
  });

  if (authDialog) {
    authDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      authDialog.showModal();
    });
  }

  setAuthMode(true);
}

function renderCart() {
  cart.ensureSelectionState();

  const items = cart.items();
  const selectedIds = new Set(cart.selectedIds());
  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const container = document.getElementById("cart-items-container");
  const count = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = selectedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const deliveryFee = subtotal >= 25000 ? 0 : 1500;
  const total = subtotal + deliveryFee;

  document.getElementById("cart-items-count").textContent = String(count);
  document.getElementById("summary-subtotal").textContent = naira(subtotal);
  document.getElementById("summary-delivery").textContent =
    deliveryFee === 0 ? "FREE" : naira(deliveryFee);
  document.getElementById("summary-total").textContent = naira(total);

  const freeDeliveryMsg = document.getElementById("free-delivery-msg");
  if (freeDeliveryMsg) freeDeliveryMsg.hidden = deliveryFee !== 0;

  const checkoutButton = document.getElementById("checkout-btn");
  if (checkoutButton) {
    checkoutButton.disabled = selectedItems.length === 0;
    checkoutButton.textContent =
      selectedItems.length === 0
        ? "Proceed to Checkout"
        : `Checkout ${selectedItems.length} item${selectedItems.length > 1 ? "s" : ""}`;
  }

  if (!items.length) {
    container.innerHTML = `
      <div class="cart-empty">
        <strong>Your cart is empty.</strong>
        <span>Add products from the shop to continue.</span>
      </div>
    `;
    return;
  }

  const allSelected = items.length > 0 && selectedItems.length === items.length;

  container.innerHTML = `
    <div class="cart-list-toolbar">
      <label class="select-all-control">
        <input id="select-all-items" type="checkbox" ${allSelected ? "checked" : ""} />
        <span>Select all</span>
      </label>
    </div>
    ${items
      .map(
        (item) => `
          <article class="cart-item" data-id="${item.id}">
            <div class="cart-select">
              <input
                type="checkbox"
                class="cart-select-box"
                data-select-id="${item.id}"
                ${selectedIds.has(item.id) ? "checked" : ""}
                aria-label="Select ${escapeHtml(item.name)} for checkout"
              />
            </div>
            <img src="${escapeHtml(imageUrl(item.image_url || item.image || ""))}" alt="${escapeHtml(item.name)}" class="cart-item-image" />
            <div class="cart-item-details">
              <div class="cart-item-header">
                <h3>${escapeHtml(item.name)}</h3>
                <button type="button" class="cart-remove" data-remove-id="${item.id}">Remove</button>
              </div>
              <p class="cart-item-price">${naira(item.price)}</p>
              <div class="cart-item-actions">
                <div class="quantity-control" aria-label="Quantity controls for ${escapeHtml(item.name)}">
                  <button type="button" class="qty-btn" data-action="decrease" data-id="${item.id}" aria-label="Decrease quantity">−</button>
                  <span class="qty-value">${item.quantity}</span>
                  <button type="button" class="qty-btn" data-action="increase" data-id="${item.id}" aria-label="Increase quantity">+</button>
                </div>
                <strong class="cart-item-total">${naira(item.price * item.quantity)}</strong>
              </div>
            </div>
          </article>
        `,
      )
      .join("")}
  `;

  const selectAllCheckbox = document.getElementById("select-all-items");
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", (event) => {
      const checked = event.target.checked;
      cart.setSelectedIds(checked ? items.map((item) => item.id) : []);
      renderCart();
    });
  }

  container.querySelectorAll(".cart-select-box").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const id = Number(event.target.dataset.selectId);
      cart.toggleSelected(id, event.target.checked);
      renderCart();
    });
  });

  container.querySelectorAll("[data-remove-id]").forEach((button) => {
    button.addEventListener("click", () => {
      cart.remove(Number(button.dataset.removeId));
      renderCart();
      notify("Item removed from your cart.");
    });
  });

  container.querySelectorAll("[data-action]").forEach((button) => {
    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    button.addEventListener("click", () => {
      const item = cart.items().find((entry) => entry.id === id);
      if (!item) return;
      const nextQty =
        action === "increase" ? item.quantity + 1 : item.quantity - 1;
      if (nextQty <= 0) {
        cart.remove(id);
      } else {
        cart.updateQty(id, nextQty);
      }
      renderCart();
    });
  });
}

document.addEventListener("cart:changed", renderCart);

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const products = await api.getProducts();
    cart.syncProducts(products);
    renderCart();
  } catch (error) {
    console.warn("Could not sync cart images:", error);
    renderCart();
  }
});

document.getElementById("account-btn").addEventListener("click", (event) => {
  event.stopPropagation();
  if (!auth.isLoggedIn()) {
    closeAccountMenu();
    openDialog(document.getElementById("auth-dialog"));
    return;
  }
  clearAccountMenuCloseTimer();
  toggleAccountMenu(true);
});

const accountWrap = document.querySelector(".account-menu-wrap");
accountWrap?.addEventListener("mouseenter", () => {
  if (auth.isLoggedIn()) {
    clearAccountMenuCloseTimer();
    toggleAccountMenu(true);
  }
});
accountWrap?.addEventListener("mouseleave", () => {
  if (auth.isLoggedIn()) {
    scheduleAccountMenuClose();
  }
});

document.getElementById("account-menu")?.addEventListener("mouseenter", () => {
  clearAccountMenuCloseTimer();
});
document.getElementById("account-menu")?.addEventListener("mouseleave", () => {
  scheduleAccountMenuClose();
});

document.querySelectorAll(".account-menu-item").forEach((item) => {
  item.addEventListener("click", () => {
    const action = item.dataset.action;
    closeAccountMenu();

    if (action === "profile") {
      window.location.href = "profile.html";
      return;
    }

    if (action === "signout") {
      auth.logout();
      window.location.replace("index.html");
    }
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".account-menu-wrap")) {
    closeAccountMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAccountMenu();
});

document.getElementById("checkout-btn").addEventListener("click", () => {
  if (!auth.isLoggedIn()) {
    openDialog(document.getElementById("auth-dialog"));
    return;
  }

  const selectedItems = cart.selectedItems();
  if (!selectedItems.length) {
    notify("Please select at least one item to checkout.", "error");
    return;
  }

  window.location.href = "checkout.html";
});

bindAuthDialog();
renderAccountLabel();
renderCart();
