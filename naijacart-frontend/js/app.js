// js/app.js -- the conductor. Wires products, cart, auth and checkout together.
import { api } from "./api.js";
import { auth } from "./auth.js";
import { cart, naira } from "./cart.js";
import { notify } from "./toast.js";

/* --------------------------------------------------------------- header */
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

function renderCartCount() {
  document.getElementById("cart-count").textContent = cart.count();
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
  const label = document.getElementById("account-btn");
  const adminLink = document.getElementById("admin-link");
  const user = auth.currentUser();
  const nameParts = user?.name.trim().split(/\s+/).filter(Boolean) || [];
  const initials =
    nameParts.length > 1
      ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`
      : nameParts[0]?.slice(0, 2) || "";
  label.textContent = user ? initials.toUpperCase() : "Sign in";
  label.classList.toggle("profile-trigger", Boolean(user));
  label.title = user ? "Click to edit profile or sign out" : "Sign in";
  adminLink.hidden = !auth.isAdmin();
  label.setAttribute(
    "aria-label",
    user ? `Signed in as ${user.name}` : "Sign in",
  );
  if (!user) closeAccountMenu();
}

document.addEventListener("cart:changed", renderCartCount);
document.addEventListener("auth:changed", renderAccountLabel);

/* --------------------------------------------------------------- auth form */
let isLoginMode = true;
const authDialog = document.getElementById("auth-dialog");
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authNameFields = document.getElementById("auth-name-fields");
const authLastNameField = document.getElementById("auth-last-name-field");
const authPhoneField = document.getElementById("auth-phone-field");
const authAddressField = document.getElementById("auth-address-field");
const authConfirmPasswordField = document.getElementById(
  "auth-confirm-password-field",
);
const authSubmit = document.getElementById("auth-submit");
const authToggle = document.getElementById("auth-toggle");
const authError = document.getElementById("auth-error");
const productDialog = document.getElementById("product-dialog");
const productDetail = document.getElementById("product-detail");
const relatedProducts = document.getElementById("related-products");

authForm.querySelectorAll("input").forEach((input) => {
  input.addEventListener("input", () => {
    authError.hidden = true;
  });
});

// Password visibility toggle
document.querySelectorAll(".password-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = btn.parentElement.querySelector("input");
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    btn.textContent = visible ? "Hide" : "Show";
    btn.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    btn.setAttribute("aria-pressed", String(visible));
  });
});

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
  authConfirmPasswordField.hidden = isLoginMode;
  [
    document.getElementById("auth-first-name"),
    document.getElementById("auth-last-name"),
    document.getElementById("auth-phone"),
    document.getElementById("auth-address"),
    document.getElementById("auth-confirm-password"),
  ].forEach((input) => {
    input.disabled = isLoginMode;
  });
  authError.hidden = true;
}

function toggleAuthMode() {
  setAuthMode(!isLoginMode);
}

setAuthMode(true);

authToggle.addEventListener("click", toggleAuthMode);

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!authForm.reportValidity()) return;

  authError.hidden = true;
  const formData = new FormData(authForm);
  const data = Object.fromEntries(formData);

  if (!isLoginMode && data.password !== data.confirm_password) {
    authError.textContent = "Passwords do not match.";
    authError.hidden = false;
    authError.focus();
    return;
  }

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
        data.confirm_password,
      );
    }

    notify(isLoginMode ? "Welcome back." : "Your account was created.");
    closeDialog(authDialog);
    renderAccountLabel();
  } catch (err) {
    if (!authDialog.open) authDialog.showModal();
    authError.textContent = err.message;
    authError.hidden = false;
    authError.focus();
  } finally {
    authSubmit.disabled = false;
  }
});

if (authDialog) {
  authDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (!authForm.dataset.forceClose) {
      authDialog.showModal();
    }
  });
}

/* --------------------------------------------------------------- dialogs */
function openDialog(dialog) {
  dialog.showModal();
}

function closeDialog(dialog) {
  dialog.close();
}

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeDialog(btn.closest(".dialog")));
});

/* ---------------------------------------------------------- product grid */
const state = { q: "", category: "all", sort: "newest" };

function card(p) {
  return `
    <article class="card" data-product-id="${p.id}">
      <a class="product-link" href="?product=${p.id}" aria-label="View ${escapeHtml(p.name)}">
        <img src="${escapeHtml(imageUrl(p.image_url))}" alt="${escapeHtml(p.name)}" class="card-img" />
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(p.name)}</h3>
          <p class="card-price">${naira(p.price)}</p>
          <p class="card-stock">${p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}</p>
        </div>
      </a>
      <div class="card-actions">
        <button class="add-btn btn btn-primary btn-sm" data-id="${p.id}" ${p.stock <= 0 ? "disabled" : ""}>${p.stock > 0 ? "Add to cart" : "Out of stock"}</button>
      </div>
    </article>
  `;
}

function renderProductDetail(product) {
  productDetail.innerHTML = `
    <div class="product-detail-media">
      <img src="${escapeHtml(imageUrl(product.image_url))}" alt="${escapeHtml(product.name)}" />
    </div>
    <div class="product-detail-copy">
      <p class="product-category">${escapeHtml(product.category || "NaijaCart collection")}</p>
      <h2>${escapeHtml(product.name)}</h2>
      <p class="product-detail-price">${naira(product.price)}</p>
      <p class="product-description">${escapeHtml(product.description || "A carefully selected everyday essential from the NaijaCart collection.")}</p>
      <p class="product-detail-stock">${product.stock > 0 ? `${product.stock} available now` : "Currently out of stock"}</p>
      <button class="btn btn-primary detail-add-btn" data-id="${product.id}" ${product.stock <= 0 ? "disabled" : ""}>
        ${product.stock > 0 ? "Add to cart" : "Out of stock"}
      </button>
    </div>
  `;
}

async function openProductDetails(productId) {
  productDetail.innerHTML =
    '<p class="product-loading">Loading product details...</p>';
  relatedProducts.innerHTML = "";
  openDialog(productDialog);
  try {
    const product = await api.getProduct(productId);
    renderProductDetail(product);
    const related = (
      await api.getProducts({ category: product.category, sort: "newest" })
    )
      .filter((item) => item.id !== product.id)
      .slice(0, 3);
    relatedProducts.innerHTML = related.length
      ? related.map(card).join("")
      : '<p class="product-loading">More products are coming soon.</p>';
  } catch (error) {
    productDetail.innerHTML = `<p class="form-error">${escapeHtml(error.message || "Product details could not be loaded.")}</p>`;
  }
}

export async function loadProducts() {
  const products = await api.getProducts(state);
  cart.syncProducts(products);
  if (state.q) {
    products.sort((a, b) => a.name.localeCompare(b.name));
  }
  const grid = document.getElementById("product-grid");
  grid.innerHTML = products.length
    ? products.map(card).join("")
    : `<div class="product-empty" role="status">
        <strong>Product not available</strong>
        <span>Try another search or browse all categories.</span>
      </div>`;

  grid.querySelectorAll(".add-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (!auth.isLoggedIn()) {
        openDialog(authDialog);
        return;
      }
      const product = products.find((p) => p.id === Number(btn.dataset.id));
      if (product && cart.add(product)) {
        document.dispatchEvent(new Event("cart:changed"));
        notify(`${product.name} added to your cart.`);
      } else if (product && product.stock > 0) {
        notify(
          "You already have the maximum available stock in your cart.",
          "error",
        );
      }
    }),
  );

}

document.getElementById("product-grid").addEventListener("click", (event) => {
  const addButton = event.target.closest(".add-btn");
  if (addButton) return;
  const productLink = event.target.closest(".product-link");
  if (!productLink) return;
  event.preventDefault();
  openProductDetails(
    Number(new URL(productLink.href).searchParams.get("product")),
  );
});

productDialog.addEventListener("click", (event) => {
  const addButton = event.target.closest(".detail-add-btn");
  const productLink = event.target.closest(".product-link");
  if (productLink) {
    event.preventDefault();
    openProductDetails(
      Number(new URL(productLink.href).searchParams.get("product")),
    );
    return;
  }
  if (addButton) {
    const productId = Number(addButton.dataset.id);
    if (!auth.isLoggedIn()) {
      openDialog(authDialog);
      return;
    }
    api
      .getProduct(productId)
      .then((product) => {
        if (cart.add(product)) {
          document.dispatchEvent(new Event("cart:changed"));
          notify(`${product.name} added to your cart.`);
        } else {
          notify(
            "You already have the maximum available stock in your cart.",
            "error",
          );
        }
      })
      .catch((error) => notify(error.message, "error"));
  }
});

export function setFilter(patch) {
  Object.assign(state, patch);
  return loadProducts();
}

function scrollToSearchResult() {
  document
    .querySelector("#product-grid .card, #product-grid .product-empty")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* --------------------------------------------------------- category chips */
async function loadCategories() {
  const products = await api.getProducts();
  const categories = [...new Set(products.map((p) => p.category))];
  const chipsNav = document.getElementById("category-chips");

  chipsNav.innerHTML = `
    <button class="chip ${state.category === "all" ? "active" : ""}" data-category="all">All</button>
    ${categories
      .map(
        (cat) => `
      <button class="chip ${state.category === cat ? "active" : ""}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>
    `,
      )
      .join("")}
  `;

  chipsNav.querySelectorAll(".chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      chipsNav.querySelector(".chip.active")?.classList.remove("active");
      chip.classList.add("active");
      setFilter({ category: chip.dataset.category });
    }),
  );
}

/* ------------------------------------------------------------- search box */
const searchInput = document.getElementById("search");
const searchCancel = document.getElementById("search-cancel");
let searchTimer;

function updateSearchControls() {
  searchCancel.hidden = !searchInput.value.trim();
}

function selectAllCategory() {
  state.category = "all";
  document.querySelectorAll("#category-chips .chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.category === "all");
  });
}

document.getElementById("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  selectAllCategory();
  setFilter({ q: searchInput.value.trim(), category: "all" }).then(() => {
    updateSearchControls();
    scrollToSearchResult();
  });
});

searchInput.addEventListener("input", () => {
  updateSearchControls();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    selectAllCategory();
    const query = searchInput.value.trim();
    setFilter({ q: query, category: "all" }).then(() => {
      if (query) scrollToSearchResult();
    });
  }, 250);
});

searchCancel.addEventListener("click", () => {
  clearTimeout(searchTimer);
  searchInput.value = "";
  selectAllCategory();
  state.q = "";
  state.sort = "newest";
  document.getElementById("sort").value = "newest";
  updateSearchControls();
  loadProducts().then(() => {
    scrollToSearchResult();
  });
});

/* --------------------------------------------------------------- sort box */
document.getElementById("sort").addEventListener("change", (e) => {
  setFilter({ sort: e.target.value });
});

/* -------------------------------------------------------- account button */
document.getElementById("account-btn").addEventListener("click", (event) => {
  event.stopPropagation();
  if (!auth.isLoggedIn()) {
    closeAccountMenu();
    openDialog(authDialog);
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

/* ----------------------------------------------------------------- cart button */
document.getElementById("cart-btn").addEventListener("click", () => {
  if (!auth.isLoggedIn()) {
    openDialog(authDialog);
    return;
  }
  window.location.href = "cart.html";
});

/* -------------------------------------------------------------- init */
const loginRedirectUrl = new URL(window.location.href);
if (loginRedirectUrl.searchParams.get("login") === "1") {
  loginRedirectUrl.searchParams.delete("login");
  window.history.replaceState(
    {},
    document.title,
    `${loginRedirectUrl.pathname}${loginRedirectUrl.search}${loginRedirectUrl.hash}`,
  );
  openDialog(authDialog);
}

loadCategories().catch(() => {
  document.getElementById("category-chips").innerHTML =
    '<p class="form-error">Categories could not be loaded.</p>';
});
loadProducts().catch((error) => {
  const grid = document.getElementById("product-grid");
  grid.innerHTML =
    '<div class="product-empty" role="alert"><strong>We could not load the catalogue.</strong><span>Please check your connection and try again.</span><button class="btn btn-outline" type="button" id="retry-products">Try again</button></div>';
  grid
    .querySelector("#retry-products")
    .addEventListener("click", () => loadProducts().catch(() => {}));
});
renderCartCount();
renderAccountLabel();
