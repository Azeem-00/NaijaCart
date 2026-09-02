// js/cart.js -- each account's cart lives in localStorage.
const KEY_PREFIX = "naijacart_cart_";
const SELECTION_KEY_PREFIX = "naijacart_cart_selection_";
let userId = null;

const key = () => (userId ? `${KEY_PREFIX}${userId}` : null);
const selectionKey = () => (userId ? `${SELECTION_KEY_PREFIX}${userId}` : null);

const read = () => {
  const cartKey = key();
  return cartKey ? JSON.parse(localStorage.getItem(cartKey) || "[]") : [];
};

const write = (items) => {
  const cartKey = key();
  if (!cartKey) return;
  localStorage.setItem(cartKey, JSON.stringify(items));
  document.dispatchEvent(new Event("cart:changed"));
};

const readSelectedIds = () => {
  const selectedKey = selectionKey();
  if (!selectedKey) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(selectedKey) || "[]");
    return Array.isArray(saved)
      ? saved.map(Number).filter(Number.isFinite)
      : [];
  } catch {
    return [];
  }
};

const writeSelectedIds = (ids) => {
  const selectedKey = selectionKey();
  if (!selectedKey) return;
  const unique = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
  localStorage.setItem(selectedKey, JSON.stringify(unique));
};

export const cart = {
  setUser(id) {
    userId = id;
    document.dispatchEvent(new Event("cart:changed"));
  },

  items: () => read(),

  ensureSelectionState() {
    const cartItems = read();
    const selectedKey = selectionKey();
    if (!selectedKey) return;

    const storedSelection = localStorage.getItem(selectedKey);
    if (storedSelection === null) {
      writeSelectedIds(cartItems.map((item) => item.id));
      return;
    }

    const validIds = new Set(cartItems.map((item) => item.id));
    const savedIds = readSelectedIds().filter((id) => validIds.has(id));
    writeSelectedIds(savedIds);
  },

  selectedIds() {
    const cartItems = read();
    const stored = readSelectedIds();
    const validIds = new Set(cartItems.map((item) => item.id));

    if (!stored.length) {
      const fallback = cartItems.map((item) => item.id);
      if (selectionKey()) {
        const selectedKey = selectionKey();
        if (localStorage.getItem(selectedKey) === null) {
          writeSelectedIds(fallback);
        }
      }
      return fallback;
    }

    return stored.filter((id) => validIds.has(id));
  },

  setSelectedIds(ids) {
    const cartItems = read();
    const validIds = new Set(cartItems.map((item) => item.id));
    const nextIds = [
      ...new Set((ids || []).map(Number).filter((id) => validIds.has(id))),
    ];
    writeSelectedIds(nextIds);
  },

  toggleSelected(id, isSelected) {
    const selected = new Set(this.selectedIds());
    if (isSelected === false) selected.delete(id);
    else selected.add(Number(id));
    this.setSelectedIds([...selected]);
  },

  selectedItems() {
    const selectedIds = new Set(this.selectedIds());
    return read().filter((item) => selectedIds.has(item.id));
  },

  selectedCount() {
    return this.selectedItems().reduce((s, i) => s + i.quantity, 0);
  },

  selectedTotal() {
    return this.selectedItems().reduce((s, i) => s + i.price * i.quantity, 0);
  },

  syncProducts(products) {
    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );
    const items = read();
    let changed = false;
    const syncedItems = items.filter((item) => {
      const product = productMap.get(item.id);
      if (!product) return true;
      const quantity = Math.min(item.quantity, product.stock);
      changed ||=
        item.stock !== product.stock ||
        item.price !== product.price ||
        item.name !== product.name ||
        item.image_url !== product.image_url ||
        item.quantity !== quantity;
      item.name = product.name;
      item.price = product.price;
      item.stock = product.stock;
      item.image_url = product.image_url;
      item.quantity = quantity;
      return quantity > 0;
    });

    if (changed || syncedItems.length !== items.length) {
      write(syncedItems);
    }

    const validSelected = this.selectedIds().filter((id) =>
      syncedItems.some((item) => item.id === id),
    );
    if (validSelected.length !== this.selectedIds().length) {
      writeSelectedIds(validSelected);
    }
  },

  add(product, qty = 1) {
    const items = read();
    const line = items.find((i) => i.id === product.id);
    const currentQuantity = line?.quantity || 0;
    const nextQuantity = Math.min(currentQuantity + qty, product.stock);
    if (nextQuantity <= 0 || nextQuantity === currentQuantity) return false;
    if (line) line.quantity = nextQuantity;
    else
      items.push({
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: nextQuantity,
        stock: product.stock,
        image_url: product.image_url,
      });
    write(items);
    const selected = new Set(this.selectedIds());
    selected.add(product.id);
    this.setSelectedIds([...selected]);
    return nextQuantity > currentQuantity;
  },

  updateQty(id, qty) {
    let items = read();
    if (qty <= 0) items = items.filter((i) => i.id !== id);
    else {
      const line = items.find((i) => i.id === id);
      if (line) line.quantity = Math.min(qty, line.stock);
    }
    write(items);
    const selectedIds = this.selectedIds().filter((selectedId) =>
      items.some((item) => item.id === selectedId),
    );
    writeSelectedIds(selectedIds);
  },

  remove(id) {
    const items = read().filter((i) => i.id !== id);
    write(items);
    const selectedIds = this.selectedIds().filter((selectedId) =>
      items.some((item) => item.id === selectedId),
    );
    writeSelectedIds(selectedIds);
  },

  clearSelected() {
    const selected = new Set(this.selectedIds());
    const items = read().filter((item) => !selected.has(item.id));
    write(items);
    writeSelectedIds(items.map((item) => item.id));
  },

  clear() {
    const cartKey = key();
    if (!cartKey) return;
    localStorage.removeItem(cartKey);
    localStorage.removeItem(selectionKey());
    document.dispatchEvent(new Event("cart:changed"));
  },

  count() {
    return read().reduce((s, i) => s + i.quantity, 0);
  },

  total() {
    return read().reduce((s, i) => s + i.price * i.quantity, 0);
  },
};

// Format money the Nigerian way: 8500 -> "₦8,500"
export function naira(n) {
  return "₦" + Number(n).toLocaleString("en-NG");
}
