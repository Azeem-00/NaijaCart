// js/confirmation.js -- Order confirmation page
import { api } from "./api.js";
import { auth } from "./auth.js";
import { naira } from "./cart.js";

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get("order_id");
  const paymentStatus = urlParams.get("payment");
  const reference = urlParams.get("reference");
  const ordersLink = document.getElementById("view-orders-link");
  if (ordersLink && orderId) {
    ordersLink.href = `profile.html?order_id=${encodeURIComponent(orderId)}`;
  }

  renderConfirmation(orderId, paymentStatus, reference);
});

function renderConfirmation(orderId, paymentStatus, reference) {
  const messageContainer = document.getElementById("confirmation-message");

  if (!orderId) {
    messageContainer.innerHTML = `
      <div class="confirmation-error">
        <div class="error-icon">⚠️</div>
        <h2>Order Not Found</h2>
        <p>We couldn't find your order. Please contact customer support.</p>
      </div>
    `;
    return;
  }

  // If there's a reference, verify the payment
  if (reference && paymentStatus === "success") {
    verifyPaymentAndShowConfirmation(orderId, reference);
    return;
  }

  if (paymentStatus === "success") {
    messageContainer.innerHTML = `
      <div class="confirmation-success">
        <div class="success-icon">✓</div>
        <h2>Order Confirmed!</h2>
        <p>Thank you for your purchase. Your order #${orderId} has been successfully placed and payment confirmed.</p>
        <p class="order-details">You will receive an email confirmation shortly with your order details.</p>
      </div>
    `;
  } else if (paymentStatus === "failed") {
    messageContainer.innerHTML = `
      <div class="confirmation-error">
        <div class="error-icon">✕</div>
        <h2>Payment Failed</h2>
        <p>Your order #${orderId} was created but payment failed. Please try again or contact customer support.</p>
        <p class="order-details">Order ID: #${orderId}</p>
      </div>
    `;
  } else if (paymentStatus === "error") {
    messageContainer.innerHTML = `
      <div class="confirmation-error">
        <div class="error-icon">⚠️</div>
        <h2>Payment Error</h2>
        <p>There was an error processing your payment for order #${orderId}. Please contact customer support.</p>
        <p class="order-details">Order ID: #${orderId}</p>
      </div>
    `;
  } else {
    // Cash on delivery or no payment status
    messageContainer.innerHTML = `
      <div class="confirmation-success">
        <div class="success-icon">✓</div>
        <h2>Order Placed Successfully!</h2>
        <p>Thank you for your purchase. Your order #${orderId} has been successfully placed.</p>
        <p class="order-details">You will pay on delivery. Our team will contact you to confirm delivery details.</p>
      </div>
    `;
  }
}

async function verifyPaymentAndShowConfirmation(orderId, reference) {
  const messageContainer = document.getElementById("confirmation-message");

  // Show loading state
  messageContainer.innerHTML = `
    <div class="confirmation-loading">
      <div class="loading-spinner"></div>
      <p>Verifying your payment...</p>
    </div>
  `;

  try {
    const result = await api.verifyPayment(reference);

    if (result.success) {
      messageContainer.innerHTML = `
        <div class="confirmation-success">
          <div class="success-icon">✓</div>
          <h2>Payment Confirmed!</h2>
          <p>Thank you for your purchase. Your order #${orderId} has been successfully placed and payment verified.</p>
          <p class="order-details">You will receive an email confirmation shortly with your order details.</p>
        </div>
      `;
    } else {
      messageContainer.innerHTML = `
        <div class="confirmation-error">
          <div class="error-icon">⚠️</div>
          <h2>Payment Verification Failed</h2>
          <p>There was an issue verifying your payment. Please contact customer support with Order ID: #${orderId}</p>
          <p class="order-details">Reference: ${reference}</p>
        </div>
      `;
    }
  } catch (err) {
    console.error("Payment verification error:", err);
    messageContainer.innerHTML = `
      <div class="confirmation-error">
        <div class="error-icon">⚠️</div>
        <h2>Verification Error</h2>
        <p>We couldn't verify your payment automatically. Your order #${orderId} has been placed.</p>
        <p class="order-details">Please contact customer support if you have any concerns.</p>
      </div>
    `;
  }
}
