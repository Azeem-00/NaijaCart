// js/auth.js -- log in / register and manage the active session.
import { api } from "./api.js";
import { cart } from "./cart.js";

const TOKEN_KEY = "naijacart_token";
const USER_KEY = "naijacart_user";

function storedUser() {
  const raw = sessionStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

cart.setUser(storedUser()?.id ?? null);

export const auth = {
  currentUser() {
    return storedUser();
  },

  isLoggedIn() {
    return !!sessionStorage.getItem(TOKEN_KEY);
  },

  isAdmin() {
    const u = this.currentUser();
    return !!(u && u.is_admin);
  },

  async login(email, password) {
    const data = await api.login({ email, password });
    this._save(data);
    return data.user;
  },

  async register(
    first_name,
    last_name,
    email,
    phone,
    address,
    password,
    confirm_password,
  ) {
    const data = await api.register({
      first_name,
      last_name,
      email,
      phone,
      address,
      password,
      confirm_password,
    });
    this._save(data);
    return data.user;
  },

  async updateProfile(first_name, last_name, address) {
    const data = await api.updateProfile({ first_name, last_name, address });
    const token = sessionStorage.getItem(TOKEN_KEY);
    this._save({ token, user: data.user });
    return data.user;
  },

  logout() {
    cart.setUser(null);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    document.dispatchEvent(new Event("auth:changed"));
  },

  _save(data) {
    sessionStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    cart.setUser(data.user.id);
    document.dispatchEvent(new Event("auth:changed"));
  },
};
