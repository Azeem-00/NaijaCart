const container = document.createElement("div");
container.className = "toast-container";
container.setAttribute("aria-live", "polite");
container.setAttribute("aria-atomic", "true");
document.body.appendChild(container);

export function notify(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  const mark = document.createElement("span");
  mark.className = "toast-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = type === "error" ? "!" : "✓";
  const text = document.createElement("span");
  text.textContent = message;
  const dismissButton = document.createElement("button");
  dismissButton.className = "toast-dismiss";
  dismissButton.type = "button";
  dismissButton.setAttribute("aria-label", "Dismiss notification");
  dismissButton.textContent = "×";
  toast.append(mark, text, dismissButton);
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  const dismiss = () => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 220);
  };
  dismissButton.addEventListener("click", dismiss);
  setTimeout(dismiss, 4200);
}
