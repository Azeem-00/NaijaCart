// js/checkout.js -- Paystack checkout and order completion
import { api, PAYSTACK_PUBLIC_KEY } from "./api.js";
import { auth } from "./auth.js";
import { cart, naira } from "./cart.js";
import { notify } from "./toast.js";

// Initialize checkout page
document.addEventListener("DOMContentLoaded", async () => {
  if (!auth.isLoggedIn()) {
    const checkoutMain = document.querySelector(".checkout-main");
    checkoutMain.innerHTML = `
      <div class="checkout-section">
        <h2>Sign in required</h2>
        <p class="form-error">Please return to the home page, sign in, and then open checkout again.</p>
        <a class="btn btn-primary" href="index.html">Return to shop</a>
      </div>
    `;
    return;
  }

  try {
    const products = await api.getProducts();
    cart.syncProducts(products);
  } catch (error) {
    console.warn("Could not sync checkout product images:", error);
  }

  // Check for cancelled payment in URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("payment") === "cancelled") {
    notify("Payment was cancelled. You can try again.", "error");
    // Clean URL
    window.history.replaceState({}, document.title, "checkout.html");
  }

  cart.ensureSelectionState();

  const selectedItems = cart.selectedItems();
  // Store checkout data globally
  window.checkoutData = {
    items: selectedItems,
    subtotal: selectedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    ),
    deliveryFee: 0,
    total: 0,
  };

  if (selectedItems.length === 0) {
    window.location.href = "cart.html";
    return;
  }

  // Calculate delivery fee
  window.checkoutData.deliveryFee =
    window.checkoutData.subtotal >= 25000 ? 0 : 1500;
  window.checkoutData.total =
    window.checkoutData.subtotal + window.checkoutData.deliveryFee;

  renderOrderSummary();
  setupCheckoutForm();
});

function renderOrderSummary() {
  const orderItems = document.getElementById("order-items");
  const items = window.checkoutData.items;

  if (items.length === 0) {
    window.location.href = "cart.html";
    return;
  }

  orderItems.innerHTML = items
    .map(
      (item) => `
    <div class="order-item">
      <img src="${escapeHtml(imageUrl(item.image_url))}" alt="${escapeHtml(item.name)}" class="order-item-image" />
      <div class="order-item-details">
        <div class="order-item-name">${escapeHtml(item.name)}</div>
        <div class="order-item-qty">Qty: ${item.quantity}</div>
        <div class="order-item-price">${naira(item.price * item.quantity)}</div>
      </div>
    </div>
  `,
    )
    .join("");

  document.getElementById("summary-subtotal").textContent = naira(
    window.checkoutData.subtotal,
  );
  document.getElementById("summary-delivery").textContent =
    window.checkoutData.deliveryFee === 0
      ? "FREE"
      : naira(window.checkoutData.deliveryFee);
  document.getElementById("summary-total").textContent = naira(
    window.checkoutData.total,
  );

  const freeDeliveryMsg = document.getElementById("free-delivery-msg");
  if (window.checkoutData.deliveryFee === 0) {
    freeDeliveryMsg.hidden = false;
  }
}

function setupCheckoutForm() {
  const checkoutForm = document.getElementById("checkout-form");
  const checkoutError = document.getElementById("checkout-error");
  const submitBtn = document.getElementById("checkout-submit-btn");

  // Update button text based on payment method
  document.querySelectorAll('input[name="payment_method"]').forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (e.target.value === "paystack") {
        submitBtn.textContent = "Continue to Payment";
      } else {
        submitBtn.textContent = "Place Order — Pay on Delivery";
      }
    });
  });

  submitBtn.addEventListener("click", async () => {
    if (!checkoutForm.reportValidity()) return;

    checkoutError.hidden = true;
    const formData = new FormData(checkoutForm);
    const data = Object.fromEntries(formData);
    const paymentMethod = data.payment_method || "paystack";
    const submitBtn = document.getElementById("checkout-submit-btn");

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Processing...";

      if (paymentMethod === "paystack") {
        await processPaystackPayment(data);
      } else {
        await processCashOnDelivery(data);
      }
    } catch (err) {
      console.error("Checkout error:", err);
      checkoutError.textContent =
        err.message || "An error occurred during checkout";
      checkoutError.hidden = false;
      notify(err.message || "An error occurred during checkout", "error");
      submitBtn.disabled = false;
      submitBtn.textContent =
        paymentMethod === "paystack"
          ? "Continue to Payment"
          : "Place Order — Pay on Delivery";
    }
  });
}

async function processPaystackPayment(data) {
  const email = auth.currentUser()?.email;
  const submitButton = document.getElementById("checkout-submit-btn");

  if (!email) {
    throw new Error("Please sign in to continue with payment");
  }

  if (!PAYSTACK_PUBLIC_KEY || !PAYSTACK_PUBLIC_KEY.startsWith("pk_")) {
    throw new Error(
      "Paystack public key is missing. Add it to naijacart-frontend/js/api.js.",
    );
  }

  console.log("Starting Paystack payment process...");

  try {
    const reference =
      "NJC-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);

    window.checkoutData.deliveryAddress = data.delivery_address;
    window.checkoutData.phone = data.phone;
    window.checkoutData.paymentReference = reference;

    const order = await api.createOrder({
      items: window.checkoutData.items,
      delivery_address: data.delivery_address,
      phone: data.phone,
      payment_reference: reference,
    });

    window.checkoutData.orderId = order.order_id;
    sessionStorage.setItem("pending_order_id", order.order_id);
    sessionStorage.setItem("payment_reference", reference);

    const completePayment = async (response) => {
      try {
        await api.verifyPayment(response.reference);
        cart.clearSelected();
        window.location.href = `confirmation.html?order_id=${order.order_id}&payment=success&reference=${encodeURIComponent(response.reference)}`;
      } catch (error) {
        throwPaymentError(error.message);
      }
    };

    if (window.PaystackPop) {
      const handler = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email,
        amount: Math.round(order.total * 100),
        ref: reference,
        channels: ["card", "bank_transfer", "ussd"],
        callback: function (response) {
          void completePayment(response);
        },
        onClose: function () {
          submitButton.disabled = false;
          submitButton.textContent = "Continue to Payment";
          notify(
            "Payment window closed. Your order is still awaiting payment.",
            "error",
          );
        },
      });
      handler.openIframe();
      return;
    }

    const callbackUrl = `${window.location.origin}${window.location.pathname.replace("checkout.html", "confirmation.html")}?order_id=${order.order_id}&payment=success&reference=${encodeURIComponent(reference)}`;
    const hosted = await api.initializePayment({
      amount: order.total,
      reference,
      callback_url: callbackUrl,
    });
    if (!hosted.authorization_url) {
      throw new Error("Paystack could not start the payment window.");
    }
    window.location.replace(hosted.authorization_url);
  } catch (err) {
    console.error("Payment process error:", err);
    throw err;
  }
}

function throwPaymentError(message) {
  const checkoutError = document.getElementById("checkout-error");
  const submitButton = document.getElementById("checkout-submit-btn");
  checkoutError.textContent = message || "Payment verification failed";
  checkoutError.hidden = false;
  submitButton.disabled = false;
  submitButton.textContent = "Continue to Payment";
  notify(checkoutError.textContent, "error");
}

async function processCashOnDelivery(data) {
  try {
    const order = await api.createOrder({
      items: window.checkoutData.items,
      delivery_address: data.delivery_address,
      phone: data.phone,
    });

    cart.clearSelected();
    window.location.href = `confirmation.html?order_id=${order.order_id}`;
  } catch (err) {
    throw err;
  }
}

// Helper functions
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
