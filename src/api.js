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

export async function requestPasswordReset(email) {
  return request("/api/auth/forgot-password", {
    method: "POST",
    body: { email },
    auth: false,
  });
}

export async function resetPassword({ token, password }) {
  const data = await request("/api/auth/reset-password", {
    method: "POST",
    body: { token, password },
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

export async function submitFeedback({ category, body, contact, pagePath }) {
  return request("/api/feedback", {
    method: "POST",
    body: { category, body, contact, pagePath },
    auth: Boolean(getToken()),
  });
}

export async function getAdminFeedback(adminToken) {
  return request("/api/admin/feedback", {
    headers: adminToken ? { "X-Admin-Token": adminToken } : {},
    auth: adminToken ? false : true,
  });
}

export async function bootstrapAdmin(adminToken) {
  return request("/api/admin/bootstrap", {
    method: "POST",
    headers: { "X-Admin-Token": adminToken },
  });
}

export async function getAdminDashboard(adminToken = "") {
  return request("/api/admin/dashboard", {
    headers: adminToken ? { "X-Admin-Token": adminToken } : {},
    auth: adminToken ? false : true,
  });
}

export async function updateAdminUserRole(userId, role) {
  return request(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
    method: "PATCH",
    body: { role },
  });
}

export async function updateAdminUserStatus(userId, status, reason = "") {
  return request(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
    method: "PATCH",
    body: { status, reason },
  });
}

export async function reportContent({ targetType, ownerId, tradeId, commentId, reason, details }) {
  return request("/api/reports", {
    method: "POST",
    body: { targetType, ownerId, tradeId, commentId, reason, details },
  });
}

export async function getAdminModeration(adminToken) {
  return request("/api/admin/moderation", {
    headers: adminToken ? { "X-Admin-Token": adminToken } : {},
    auth: adminToken ? false : true,
  });
}

export async function hideModerationTrade(adminToken, { ownerId, tradeId, reason }) {
  return request("/api/admin/moderation/trades/hide", {
    method: "POST",
    headers: adminToken ? { "X-Admin-Token": adminToken } : {},
    body: { ownerId, tradeId, reason },
    auth: adminToken ? false : true,
  });
}

export async function unhideModerationTrade(adminToken, { ownerId, tradeId }) {
  return request("/api/admin/moderation/trades/unhide", {
    method: "POST",
    headers: adminToken ? { "X-Admin-Token": adminToken } : {},
    body: { ownerId, tradeId },
    auth: adminToken ? false : true,
  });
}

export async function hideModerationComment(adminToken, { commentId, reason }) {
  return request("/api/admin/moderation/comments/hide", {
    method: "POST",
    headers: adminToken ? { "X-Admin-Token": adminToken } : {},
    body: { commentId, reason },
    auth: adminToken ? false : true,
  });
}

export async function unhideModerationComment(adminToken, { commentId }) {
  return request("/api/admin/moderation/comments/unhide", {
    method: "POST",
    headers: adminToken ? { "X-Admin-Token": adminToken } : {},
    body: { commentId },
    auth: adminToken ? false : true,
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
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(path, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    const reason = error?.message ? ` (${error.message})` : "";
    throw new Error(`連不到 NovaX 伺服器，請確認網站後端已啟動、Render 網址可正常開啟，或稍後再試。${reason}`);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "請求失敗，請稍後再試。");
  }
  return data;
}
