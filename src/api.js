import { startingBalance } from "./config.js";
import { calculateAccount } from "./portfolio.js";

const tokenKey = "novax-auth-token";

export function getToken() {
  return localStorage.getItem(tokenKey);
}

export function clearToken() {
  localStorage.removeItem(tokenKey);
}

export async function registerAccount({ name, email, password }) {
  const data = await request("/api/auth/register", {
    method: "POST",
    body: { name, email, password },
    auth: false,
  });
  localStorage.setItem(tokenKey, data.token);
  return data;
}

export async function loginAccount({ email, password }) {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  localStorage.setItem(tokenKey, data.token);
  return data;
}

export async function logoutAccount() {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } finally {
    clearToken();
  }
}

export async function getMe() {
  return request("/api/me");
}

export async function updateProfile({ name, email, currentPassword, newPassword }) {
  return request("/api/me/profile", {
    method: "PATCH",
    body: { name, email, currentPassword, newPassword },
  });
}

export async function getRemoteAccount() {
  return request("/api/account");
}

export async function syncRemoteAccount(app) {
  return request("/api/account/sync", {
    method: "POST",
    body: buildAccountPayload(app),
  });
}

export async function getLeaderboard() {
  return request("/api/leaderboard");
}

export async function getFollowing() {
  return request("/api/me/following");
}

export async function getFollowingFeed() {
  return request("/api/feed/following");
}

export async function getNotifications() {
  return request("/api/notifications");
}

export async function markNotificationsRead() {
  return request("/api/notifications/read", { method: "POST" });
}

export async function getPublicProfile(userId) {
  return request(`/api/users/${encodeURIComponent(userId)}/public`);
}

export async function followUser(userId) {
  return request(`/api/users/${encodeURIComponent(userId)}/follow`, { method: "POST" });
}

export async function unfollowUser(userId) {
  return request(`/api/users/${encodeURIComponent(userId)}/follow`, { method: "DELETE" });
}

export async function likePublicTrade(userId, tradeId) {
  return request(`/api/users/${encodeURIComponent(userId)}/trades/${encodeURIComponent(tradeId)}/like`, {
    method: "POST",
  });
}

export async function unlikePublicTrade(userId, tradeId) {
  return request(`/api/users/${encodeURIComponent(userId)}/trades/${encodeURIComponent(tradeId)}/like`, {
    method: "DELETE",
  });
}

export async function commentOnPublicTrade(userId, tradeId, body) {
  return request(`/api/users/${encodeURIComponent(userId)}/trades/${encodeURIComponent(tradeId)}/comments`, {
    method: "POST",
    body: { body },
  });
}

function buildAccountPayload(app) {
  const account = calculateAccount(app);
  return {
    snapshot: {
      activeSymbol: app.activeSymbol,
      selectedMode: app.selectedMode,
      marketSource: app.marketSource,
      cash: app.state.cash,
      positions: app.state.positions,
      spot: app.state.spot,
      openOrders: app.state.openOrders,
      history: app.state.history.slice(0, 120),
      dismissedAlerts: app.state.dismissedAlerts || {},
      learningProgress: app.state.learningProgress || {},
      realizedPnl: app.state.realizedPnl,
    },
    metrics: {
      equity: account.equity,
      roi: ((account.equity - startingBalance) / startingBalance) * 100,
      tradesCount: app.state.history.length,
    },
  };
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.auth !== false && token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "請求失敗，請稍後再試。");
  }
  return data;
}
