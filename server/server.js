import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { createSession, hashPassword, hashToken, requireUser, verifyPassword } from "./auth.js";
import { config, publicConfigSummary } from "./config.js";
import { closeDatabase, statements } from "./db.js";
import { sendPasswordResetEmail } from "./email.js";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    applySecurityHeaders(response);
    if (url.pathname.startsWith("/api/")) {
      if (handleCors(request, response)) return;
      await handleApi(request, response, url);
      return;
    }
    serveStatic(url, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: "SERVER_ERROR",
      message: config.isProduction ? "伺服器暫時無法處理請求。" : error.message,
    });
  }
});

server.listen(config.port, config.host, () => {
  const displayHost = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
  process.stdout.write(`NovaX server running at http://${displayHost}:${config.port}\n`);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function shutdown(signal) {
  process.stdout.write(`NovaX server received ${signal}, shutting down...\n`);
  server.close(async () => {
    await closeDatabase();
    process.exit(0);
  });
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      name: "NovaX API",
      uptime: Math.round(process.uptime()),
      config: publicConfigSummary(),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/feedback") {
    const session = await requireUser(request);
    const body = await readJson(request);
    const category = cleanFeedbackCategory(body.category);
    const message = cleanText(body.body, 1000);
    const contact = cleanText(body.contact, 120);
    const pagePath = cleanText(body.pagePath, 160);
    const userAgent = cleanText(request.headers["user-agent"], 220);

    if (message.length < 8) {
      sendJson(response, 400, { error: "FEEDBACK_TOO_SHORT", message: "請輸入至少 8 個字的回饋內容。" });
      return;
    }

    const row = await statements.createFeedback.get(
      session?.user.id || null,
      category,
      message,
      contact || null,
      pagePath || null,
      userAgent || null,
    );
    sendJson(response, 201, { feedback: normalizeFeedback(row) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/feedback") {
    if (!(await isAdminRequest(request))) {
      sendJson(response, 401, { error: "ADMIN_REQUIRED", message: "需要管理者權限。" });
      return;
    }

    const summary = await statements.getAdminSummary.get();
    const rows = (await statements.getFeedback.all()).map(normalizeFeedback);
    sendJson(response, 200, {
      summary: normalizeAdminSummary(summary),
      rows,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/dashboard") {
    if (!(await isAdminRequest(request))) {
      sendJson(response, 401, { error: "ADMIN_REQUIRED", message: "需要管理者權限。" });
      return;
    }

    const adminSummary = normalizeAdminSummary(await statements.getAdminSummary.get());
    const moderationSummary = normalizeModerationSummary(await statements.getModerationSummary.get());
    sendJson(response, 200, {
      summary: {
        ...adminSummary,
        ...moderationSummary,
        adminAccountsCount: config.adminEmails.length,
      },
      users: (await statements.getAdminUsers.all()).map(normalizeAdminAccount),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/reports") {
    const session = await requireUser(request);
    if (!session) {
      sendJson(response, 401, { error: "UNAUTHENTICATED", message: "請先登入後再檢舉內容。" });
      return;
    }

    const body = await readJson(request);
    const targetType = cleanReportTarget(body.targetType);
    const reason = cleanReportReason(body.reason);
    const details = cleanText(body.details, 500);
    let ownerId = Number(body.ownerId) || null;
    let tradeId = cleanText(body.tradeId, 64);
    const commentId = Number(body.commentId) || null;

    if (targetType === "trade") {
      if (!ownerId || !tradeId || !(await findPublicTrade(ownerId, tradeId))) {
        sendJson(response, 404, { error: "TRADE_NOT_FOUND", message: "找不到可檢舉的公開交易。" });
        return;
      }
    } else if (targetType === "comment") {
      const comment = commentId ? await statements.getTradeCommentById.get(commentId) : null;
      if (!comment || comment.hidden_comment_id || !(await findPublicTrade(comment.owner_id, comment.trade_id))) {
        sendJson(response, 404, { error: "COMMENT_NOT_FOUND", message: "找不到可檢舉的留言。" });
        return;
      }
      ownerId = comment.owner_id;
      tradeId = cleanText(comment.trade_id, 64);
    } else {
      sendJson(response, 400, { error: "BAD_TARGET", message: "檢舉目標不正確。" });
      return;
    }

    const row = await statements.createContentReport.get(
      session.user.id,
      targetType,
      ownerId,
      tradeId || null,
      commentId,
      reason,
      details || null,
    );
    sendJson(response, 201, { report: normalizeContentReport(row) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/moderation") {
    if (!(await isAdminRequest(request))) {
      sendJson(response, 401, { error: "ADMIN_REQUIRED", message: "需要管理者權限。" });
      return;
    }

    sendJson(response, 200, {
      summary: normalizeModerationSummary(await statements.getModerationSummary.get()),
      reports: (await statements.getContentReports.all()).map(normalizeContentReport),
      hiddenTrades: (await statements.getHiddenTrades.all()).map(normalizeHiddenTrade),
      hiddenComments: (await statements.getHiddenComments.all()).map(normalizeHiddenComment),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/moderation/trades/hide") {
    if (!(await isAdminRequest(request))) {
      sendJson(response, 401, { error: "ADMIN_REQUIRED", message: "需要管理者權限。" });
      return;
    }

    const body = await readJson(request);
    const ownerId = Number(body.ownerId);
    const tradeId = cleanText(body.tradeId, 64);
    const reason = cleanText(body.reason, 240) || "違反社群規範";
    if (!ownerId || !tradeId || !(await findPublicTrade(ownerId, tradeId, { includeHidden: true }))) {
      sendJson(response, 404, { error: "TRADE_NOT_FOUND", message: "找不到公開交易。" });
      return;
    }

    await statements.hideTrade.run(ownerId, tradeId, reason);
    await statements.markTradeReportsActioned.run(ownerId, tradeId);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/moderation/trades/unhide") {
    if (!(await isAdminRequest(request))) {
      sendJson(response, 401, { error: "ADMIN_REQUIRED", message: "需要管理者權限。" });
      return;
    }

    const body = await readJson(request);
    await statements.unhideTrade.run(Number(body.ownerId), cleanText(body.tradeId, 64));
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/moderation/comments/hide") {
    if (!(await isAdminRequest(request))) {
      sendJson(response, 401, { error: "ADMIN_REQUIRED", message: "需要管理者權限。" });
      return;
    }

    const body = await readJson(request);
    const commentId = Number(body.commentId);
    const reason = cleanText(body.reason, 240) || "違反社群規範";
    if (!commentId || !(await statements.getTradeCommentById.get(commentId))) {
      sendJson(response, 404, { error: "COMMENT_NOT_FOUND", message: "找不到留言。" });
      return;
    }

    await statements.hideComment.run(commentId, reason);
    await statements.markCommentReportsActioned.run(commentId);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/moderation/comments/unhide") {
    if (!(await isAdminRequest(request))) {
      sendJson(response, 401, { error: "ADMIN_REQUIRED", message: "需要管理者權限。" });
      return;
    }

    const body = await readJson(request);
    await statements.unhideComment.run(Number(body.commentId));
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJson(request);
    const name = cleanText(body.name, 32);
    const email = cleanEmail(body.email);
    const password = String(body.password || "");

    if (!name || !email.includes("@") || password.length < 8) {
      sendJson(response, 400, { error: "INVALID_INPUT", message: "請輸入名稱、email，密碼至少 8 碼。" });
      return;
    }

    if (await statements.getUserByEmail.get(email)) {
      sendJson(response, 409, { error: "EMAIL_EXISTS", message: "這個 email 已經註冊。" });
      return;
    }

    const { hash, salt } = hashPassword(password);
    const user = await statements.createUser.get(name, email, hash, salt);
    const session = await createSession(user.id);
    sendJson(response, 201, { user: normalizeUser(user), ...session });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(request);
    const email = cleanEmail(body.email);
    const password = String(body.password || "");
    const user = await statements.getUserByEmail.get(email);

    if (!user || !verifyPassword(password, user.salt, user.password_hash)) {
      sendJson(response, 401, { error: "BAD_CREDENTIALS", message: "登入資料不正確。" });
      return;
    }

    const session = await createSession(user.id);
    sendJson(response, 200, { user: normalizeUser(user), ...session });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/forgot-password") {
    const body = await readJson(request);
    const email = cleanEmail(body.email);
    if (!email.includes("@")) {
      sendJson(response, 400, { error: "INVALID_EMAIL", message: "請輸入有效 email。" });
      return;
    }

    await statements.deleteStalePasswordResets.run(new Date().toISOString());
    const user = await statements.getUserByEmail.get(email);
    let devResetUrl = "";

    if (user) {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + config.passwordResetMinutes * 60 * 1000).toISOString();
      await statements.markUserPasswordResetsUsed.run(user.id);
      await statements.createPasswordReset.run(user.id, tokenHash, expiresAt);
      const resetUrl = buildPasswordResetUrl(request, token);

      if (config.email.enabled) {
        try {
          await sendPasswordResetEmail(user, resetUrl);
        } catch (error) {
          console.error(error);
          await statements.markUserPasswordResetsUsed.run(user.id);
          sendJson(response, 502, {
            error: "EMAIL_FAILED",
            message: "重設信暫時寄送失敗，請稍後再試。",
          });
          return;
        }
      } else if (!config.isProduction) {
        devResetUrl = resetUrl;
      }
    }

    sendJson(response, 202, {
      ok: true,
      emailEnabled: config.email.enabled,
      message: config.email.enabled
        ? "如果這個 email 有註冊，我們會寄出重設密碼連結。"
        : "目前尚未啟用寄信服務，請聯絡管理者協助重設密碼。",
      ...(devResetUrl ? { devResetUrl } : {}),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/reset-password") {
    const body = await readJson(request);
    const resetToken = cleanText(body.token, 220);
    const password = String(body.password || "");

    if (!resetToken) {
      sendJson(response, 400, { error: "MISSING_TOKEN", message: "重設連結不完整。" });
      return;
    }
    if (password.length < 8) {
      sendJson(response, 400, { error: "WEAK_PASSWORD", message: "新密碼至少 8 碼。" });
      return;
    }

    await statements.deleteStalePasswordResets.run(new Date().toISOString());
    const reset = await statements.getPasswordReset.get(hashToken(resetToken));
    if (!reset || reset.used_at || new Date(reset.expires_at).getTime() <= Date.now()) {
      sendJson(response, 400, { error: "RESET_EXPIRED", message: "重設連結已失效，請重新申請。" });
      return;
    }

    const { hash, salt } = hashPassword(password);
    await statements.updateUserPassword.run(hash, salt, reset.user_id);
    await statements.markPasswordResetUsed.run(reset.reset_id);
    await statements.deleteUserSessions.run(reset.user_id);
    const session = await createSession(reset.user_id);
    sendJson(response, 200, { user: normalizeUser(reset), ...session });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const session = await requireUser(request);
    if (session) {
      await statements.deleteSession.run(hashToken(session.token));
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/me") {
    const session = await requireUser(request);
    if (!session) {
      sendJson(response, 401, { error: "UNAUTHENTICATED", message: "請先登入。" });
      return;
    }
    sendJson(response, 200, { user: session.user });
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/me/profile") {
    const session = await requireUser(request);
    if (!session) {
      sendJson(response, 401, { error: "UNAUTHENTICATED", message: "請先登入。" });
      return;
    }

    const body = await readJson(request);
    const name = cleanText(body.name, 32);
    const email = cleanEmail(body.email);
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");

    if (!name || !email.includes("@")) {
      sendJson(response, 400, { error: "INVALID_INPUT", message: "請輸入有效名稱與 email。" });
      return;
    }

    const existing = await statements.getUserByEmail.get(email);
    if (existing && existing.id !== session.user.id) {
      sendJson(response, 409, { error: "EMAIL_EXISTS", message: "這個 email 已經被使用。" });
      return;
    }

    const fullUser = await statements.getUserById.get(session.user.id);
    if (!fullUser) {
      sendJson(response, 404, { error: "USER_NOT_FOUND", message: "找不到使用者。" });
      return;
    }

    if (newPassword) {
      if (newPassword.length < 8) {
        sendJson(response, 400, { error: "WEAK_PASSWORD", message: "新密碼至少 8 碼。" });
        return;
      }
      if (!verifyPassword(currentPassword, fullUser.salt, fullUser.password_hash)) {
        sendJson(response, 401, { error: "BAD_PASSWORD", message: "目前密碼不正確。" });
        return;
      }
    }

    const updated = await statements.updateUserProfile.get(name, email, session.user.id);
    if (newPassword) {
      const { hash, salt } = hashPassword(newPassword);
      await statements.updateUserPassword.run(hash, salt, session.user.id);
    }

    sendJson(response, 200, { user: normalizeUser(updated) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/account") {
    const session = await requireUser(request);
    if (!session) {
      sendJson(response, 401, { error: "UNAUTHENTICATED", message: "請先登入。" });
      return;
    }

    const row = await statements.getAccount.get(session.user.id);
    sendJson(response, 200, {
      account: row
        ? {
            snapshot: JSON.parse(row.snapshot),
            equity: row.equity,
            roi: row.roi,
            tradesCount: row.trades_count,
            updatedAt: row.updated_at,
          }
        : null,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/account/sync") {
    const session = await requireUser(request);
    if (!session) {
      sendJson(response, 401, { error: "UNAUTHENTICATED", message: "請先登入。" });
      return;
    }

    const body = await readJson(request);
    const snapshot = sanitizeSnapshot(body.snapshot);
    const metrics = sanitizeMetrics(body.metrics);

    await statements.upsertAccount.run(
      session.user.id,
      JSON.stringify(snapshot),
      metrics.equity,
      metrics.roi,
      metrics.tradesCount,
    );
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/me/following") {
    const session = await requireUser(request);
    if (!session) {
      sendJson(response, 401, { error: "UNAUTHENTICATED", message: "請先登入。" });
      return;
    }

    const rows = await Promise.all((await statements.getFollowingPreview.all(session.user.id)).map(async (row) => ({
      ...(await normalizePublicSummary(row)),
      isFollowing: true,
      followedAt: row.followed_at,
    })));
    sendJson(response, 200, { rows });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/notifications") {
    const session = await requireUser(request);
    if (!session) {
      sendJson(response, 401, { error: "UNAUTHENTICATED", message: "請先登入。" });
      return;
    }

    const rows = (await statements.getNotifications.all(session.user.id)).map(normalizeNotification);
    sendJson(response, 200, {
      rows,
      unreadCount: rows.filter((row) => !row.readAt).length,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/notifications/read") {
    const session = await requireUser(request);
    if (!session) {
      sendJson(response, 401, { error: "UNAUTHENTICATED", message: "請先登入。" });
      return;
    }

    await statements.markNotificationsRead.run(session.user.id);
    const rows = (await statements.getNotifications.all(session.user.id)).map(normalizeNotification);
    sendJson(response, 200, { rows, unreadCount: 0 });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/feed/following") {
    const session = await requireUser(request);
    if (!session) {
      sendJson(response, 401, { error: "UNAUTHENTICATED", message: "請先登入。" });
      return;
    }

    sendJson(response, 200, { rows: (await buildFollowingFeed(session)).slice(0, 20) });
    return;
  }

  const publicProfileMatch = url.pathname.match(/^\/api\/users\/(\d+)\/public$/);
  if (request.method === "GET" && publicProfileMatch) {
    const session = await requireUser(request);
    const userId = Number(publicProfileMatch[1]);
    const row = await statements.getPublicProfile.get(userId);
    if (!row) {
      sendJson(response, 404, { error: "USER_NOT_FOUND", message: "找不到這位使用者。" });
      return;
    }

    sendJson(response, 200, { profile: await normalizePublicProfile(row, session) });
    return;
  }

  const tradeLikeMatch = url.pathname.match(/^\/api\/users\/(\d+)\/trades\/([^/]+)\/like$/);
  if ((request.method === "POST" || request.method === "DELETE") && tradeLikeMatch) {
    const session = await requireUser(request);
    if (!session) {
      sendJson(response, 401, { error: "UNAUTHENTICATED", message: "請先登入。" });
      return;
    }

    const ownerId = Number(tradeLikeMatch[1]);
    const tradeId = decodeURIComponent(tradeLikeMatch[2]);
    const record = await findPublicTrade(ownerId, tradeId);
    if (!record) {
      sendJson(response, 404, { error: "TRADE_NOT_FOUND", message: "找不到公開交易。" });
      return;
    }

    if (ownerId === session.user.id) {
      sendJson(response, 400, { error: "SELF_LIKE", message: "不能對自己的公開交易按讚。" });
      return;
    }

    if (request.method === "POST") {
      const result = await statements.likeTrade.run(session.user.id, ownerId, tradeId);
      if (result.changes > 0) {
        await createNotification(ownerId, session.user.id, "trade_like", ownerId, tradeId);
      }
    } else {
      await statements.unlikeTrade.run(session.user.id, ownerId, tradeId);
    }

    sendJson(response, 200, {
      ok: true,
      likedByMe: request.method === "POST",
      likesCount: await publicTradeLikesCount(ownerId, tradeId),
    });
    return;
  }

  const tradeCommentMatch = url.pathname.match(/^\/api\/users\/(\d+)\/trades\/([^/]+)\/comments$/);
  if (request.method === "POST" && tradeCommentMatch) {
    const session = await requireUser(request);
    if (!session) {
      sendJson(response, 401, { error: "UNAUTHENTICATED", message: "請先登入。" });
      return;
    }

    const ownerId = Number(tradeCommentMatch[1]);
    const tradeId = decodeURIComponent(tradeCommentMatch[2]);
    const record = await findPublicTrade(ownerId, tradeId);
    if (!record) {
      sendJson(response, 404, { error: "TRADE_NOT_FOUND", message: "找不到公開交易。" });
      return;
    }

    const body = await readJson(request);
    const comment = cleanText(body.body, 240);
    if (!comment) {
      sendJson(response, 400, { error: "EMPTY_COMMENT", message: "請輸入留言內容。" });
      return;
    }

    const row = await statements.createTradeComment.get(ownerId, tradeId, session.user.id, comment);
    if (ownerId !== session.user.id) {
      await createNotification(ownerId, session.user.id, "trade_comment", ownerId, tradeId, comment);
    }
    sendJson(response, 201, {
      comment: normalizePublicComment({
        ...row,
        author_id: session.user.id,
        author_name: session.user.name,
      }),
    });
    return;
  }

  const followMatch = url.pathname.match(/^\/api\/users\/(\d+)\/follow$/);
  if ((request.method === "POST" || request.method === "DELETE") && followMatch) {
    const session = await requireUser(request);
    if (!session) {
      sendJson(response, 401, { error: "UNAUTHENTICATED", message: "請先登入。" });
      return;
    }

    const targetId = Number(followMatch[1]);
    if (targetId === session.user.id) {
      sendJson(response, 400, { error: "SELF_FOLLOW", message: "不能追蹤自己的帳號。" });
      return;
    }

    if (!(await statements.getUserById.get(targetId))) {
      sendJson(response, 404, { error: "USER_NOT_FOUND", message: "找不到這位使用者。" });
      return;
    }

    if (request.method === "POST") {
      const result = await statements.followUser.run(session.user.id, targetId);
      if (result.changes > 0) {
        await createNotification(targetId, session.user.id, "follow", targetId, null);
      }
      sendJson(response, 200, { ok: true, isFollowing: true });
    } else {
      await statements.unfollowUser.run(session.user.id, targetId);
      sendJson(response, 200, { ok: true, isFollowing: false });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/leaderboard") {
    const session = await requireUser(request);
    const followingIds = session
      ? new Set((await statements.getFollowingIds.all(session.user.id)).map((row) => row.followed_id))
      : new Set();
    const rows = await Promise.all(
      (await statements.getLeaderboard.all()).map(async (row, index) => ({
        rank: index + 1,
        ...(await normalizePublicSummary(row)),
        isFollowing: followingIds.has(row.id),
        isSelf: session?.user.id === row.id,
      })),
    );
    sendJson(response, 200, { rows });
    return;
  }

  sendJson(response, 404, { error: "NOT_FOUND", message: "API route not found." });
}

function serveStatic(url, response) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  if (!isPublicAsset(pathname)) {
    sendJson(response, 404, { error: "NOT_FOUND" });
    return;
  }

  const target = normalize(join(config.rootDir, pathname));
  if (!target.startsWith(config.rootDir) || !existsSync(target)) {
    sendJson(response, 404, { error: "NOT_FOUND" });
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(target)] || "application/octet-stream",
    "Cache-Control": target.endsWith("service-worker.js") ? "no-cache" : "public, max-age=300",
  });
  createReadStream(target).pipe(response);
}

function isPublicAsset(pathname) {
  const publicFiles = new Set([
    "/index.html",
    "/styles.css",
    "/app.js",
    "/manifest.webmanifest",
    "/service-worker.js",
  ]);
  return publicFiles.has(pathname) || pathname.startsWith("/assets/") || pathname.startsWith("/src/");
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > config.maxJsonBytes) {
        request.destroy();
        reject(new Error("Payload too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function applySecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (config.isProduction) {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function handleCors(request, response) {
  const origin = request.headers.origin || "";
  const allowed = origin && config.corsOrigins.includes(origin);

  if (allowed) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (request.method !== "OPTIONS") return false;
  response.writeHead(allowed || !origin ? 204 : 403);
  response.end();
  return true;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 254);
}

function buildPasswordResetUrl(request, token) {
  const origin = config.publicOrigin || requestOrigin(request);
  const url = new URL(origin || "http://127.0.0.1:8787");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("reset_token", token);
  return url.toString();
}

function requestOrigin(request) {
  const host = cleanText(request.headers.host, 120);
  if (!host) return "";
  const forwardedProto = cleanText(request.headers["x-forwarded-proto"], 20).split(",")[0];
  const proto = forwardedProto || (config.isProduction ? "https" : "http");
  return `${proto}://${host}`;
}

function cleanFeedbackCategory(value) {
  const category = cleanText(value, 24);
  return ["bug", "idea", "ux", "other"].includes(category) ? category : "other";
}

function cleanReportTarget(value) {
  const target = cleanText(value, 24);
  return ["trade", "comment"].includes(target) ? target : "";
}

function cleanReportReason(value) {
  const reason = cleanText(value, 32);
  return ["spam", "abuse", "misleading", "personal", "other"].includes(reason) ? reason : "other";
}

async function isAdminRequest(request) {
  const token = cleanText(request.headers["x-admin-token"], 200);
  if (config.adminToken && token && token === config.adminToken) return true;

  const session = await requireUser(request);
  return session?.user.role === "admin";
}

function normalizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: userRole(user),
    createdAt: user.created_at,
  };
}

function userRole(user) {
  const email = String(user?.email || "").toLowerCase();
  return user?.role === "admin" || config.adminEmails.includes(email) ? "admin" : "user";
}

function normalizeFeedback(row) {
  return {
    id: row.id,
    category: cleanFeedbackCategory(row.category),
    body: cleanText(row.body, 1000),
    contact: cleanText(row.contact, 120),
    pagePath: cleanText(row.page_path, 160),
    userAgent: cleanText(row.user_agent, 220),
    status: cleanText(row.status, 24) || "new",
    createdAt: row.created_at,
    user: row.user_id
      ? {
          id: row.user_id,
          name: cleanText(row.user_name, 32) || "使用者",
          email: cleanEmail(row.user_email),
        }
      : null,
  };
}

function normalizeAdminSummary(row) {
  return {
    usersCount: Math.max(0, Math.round(finiteNumber(row?.users_count, 0))),
    syncedAccountsCount: Math.max(0, Math.round(finiteNumber(row?.synced_accounts_count, 0))),
    feedbackCount: Math.max(0, Math.round(finiteNumber(row?.feedback_count, 0))),
    newFeedbackCount: Math.max(0, Math.round(finiteNumber(row?.new_feedback_count, 0))),
  };
}

function normalizeAdminAccount(row) {
  return {
    id: row.id,
    name: cleanText(row.name, 32) || "使用者",
    email: cleanEmail(row.email),
    role: userRole(row),
    createdAt: row.created_at,
    equity: nullableNumber(row.equity),
    roi: nullableNumber(row.roi),
    tradesCount: Math.max(0, Math.round(finiteNumber(row.trades_count, 0))),
    accountUpdatedAt: row.account_updated_at || null,
    followersCount: Math.max(0, Math.round(finiteNumber(row.followers_count, 0))),
    followingCount: Math.max(0, Math.round(finiteNumber(row.following_count, 0))),
    feedbackCount: Math.max(0, Math.round(finiteNumber(row.feedback_count, 0))),
    reportsMadeCount: Math.max(0, Math.round(finiteNumber(row.reports_made_count, 0))),
  };
}

function normalizeContentReport(row) {
  return {
    id: row.id,
    targetType: cleanReportTarget(row.target_type),
    ownerId: row.owner_id,
    tradeId: cleanText(row.trade_id, 64),
    commentId: row.comment_id,
    reason: cleanReportReason(row.reason),
    details: cleanText(row.details, 500),
    status: cleanText(row.status, 24) || "open",
    createdAt: row.created_at,
    reporter: row.reporter_id
      ? {
          id: row.reporter_id,
          name: cleanText(row.reporter_name, 32) || "使用者",
        }
      : null,
    ownerName: cleanText(row.owner_name, 32),
    commentBody: cleanText(row.comment_body, 240),
    commentAuthorName: cleanText(row.comment_author_name, 32),
  };
}

function normalizeModerationSummary(row) {
  return {
    reportsCount: Math.max(0, Math.round(finiteNumber(row?.reports_count, 0))),
    openReportsCount: Math.max(0, Math.round(finiteNumber(row?.open_reports_count, 0))),
    hiddenTradesCount: Math.max(0, Math.round(finiteNumber(row?.hidden_trades_count, 0))),
    hiddenCommentsCount: Math.max(0, Math.round(finiteNumber(row?.hidden_comments_count, 0))),
  };
}

function normalizeHiddenTrade(row) {
  return {
    ownerId: row.owner_id,
    ownerName: cleanText(row.owner_name, 32) || "使用者",
    tradeId: cleanText(row.trade_id, 64),
    reason: cleanText(row.reason, 240),
    hiddenAt: row.hidden_at,
  };
}

function normalizeHiddenComment(row) {
  return {
    commentId: row.comment_id,
    ownerId: row.owner_id,
    ownerName: cleanText(row.owner_name, 32) || "使用者",
    tradeId: cleanText(row.trade_id, 64),
    body: cleanText(row.body, 240),
    authorName: cleanText(row.author_name, 32) || "使用者",
    reason: cleanText(row.reason, 240),
    hiddenAt: row.hidden_at,
  };
}

async function normalizePublicSummary(row) {
  const followers = await statements.getFollowersCount.get(row.id);
  return {
    id: row.id,
    name: row.name,
    equity: nullableNumber(row.equity),
    roi: nullableNumber(row.roi),
    tradesCount: Math.max(0, Math.round(finiteNumber(row.trades_count, 0))),
    updatedAt: row.updated_at || null,
    followersCount: Math.max(0, Math.round(finiteNumber(followers?.count, 0))),
  };
}

async function normalizePublicProfile(row, session) {
  const snapshot = parseSnapshot(row.snapshot);
  const hiddenTrades = await hiddenTradeSet();
  const recentTrades = Array.isArray(snapshot.history)
    ? await Promise.all(
        snapshot.history
          .filter((trade) => isPublicTrade(trade) && !hiddenTrades.has(publicTradeKey(row.id, cleanText(trade?.id, 64))))
          .slice(0, 6)
          .map((trade) => normalizePublicTrade(trade, row.id, session)),
      )
    : [];
  const following = await statements.getFollowingCount.get(row.id);
  const follow = session ? await statements.getFollow.get(session.user.id, row.id) : null;

  return {
    ...(await normalizePublicSummary(row)),
    createdAt: row.created_at,
    followingCount: Math.max(0, Math.round(finiteNumber(following?.count, 0))),
    isSelf: session?.user.id === row.id,
    isFollowing: Boolean(follow),
    recentTrades,
  };
}

async function buildFollowingFeed(session) {
  const rows = await statements.getFollowingFeedSources.all(session.user.id);
  const hiddenTrades = await hiddenTradeSet();
  const groups = await Promise.all(
    rows.map(async (row) => {
      const snapshot = parseSnapshot(row.snapshot);
      if (!Array.isArray(snapshot.history)) return [];

      return Promise.all(snapshot.history
        .filter((trade) => isPublicTrade(trade) && !hiddenTrades.has(publicTradeKey(row.id, cleanText(trade?.id, 64))))
        .map(async (trade) => {
        const publicTrade = await normalizePublicTrade(trade, row.id, session);
        return {
          ...publicTrade,
          ownerId: row.id,
          ownerName: cleanText(row.name, 32) || "使用者",
          ownerEquity: nullableNumber(row.equity),
          ownerRoi: nullableNumber(row.roi),
          ownerTradesCount: Math.max(0, Math.round(finiteNumber(row.trades_count, 0))),
          ownerUpdatedAt: row.updated_at || null,
          followedAt: row.followed_at || null,
          sortAt: finiteNumber(publicTrade.journal.updatedAt, 0),
        };
      }));
    }),
  );

  return groups
    .flat()
    .sort((a, b) => b.sortAt - a.sortAt);
}

async function normalizePublicTrade(trade, ownerId, session) {
  const safe = trade && typeof trade === "object" ? trade : {};
  const tradeId = cleanText(safe.id, 64);
  const journal = safe.journal && typeof safe.journal === "object" ? safe.journal : {};
  const tradeLike = session ? await statements.getTradeLike.get(session.user.id, ownerId, tradeId) : null;
  const comments = await statements.getTradeComments.all(ownerId, tradeId);
  return {
    id: tradeId,
    symbol: cleanText(safe.symbol, 16) || "--",
    side: safe.side === "sell" ? "sell" : "buy",
    mode: cleanText(safe.mode, 24) || "--",
    qty: finiteNumber(safe.qty, 0),
    price: finiteNumber(safe.price, 0),
    pnl: finiteNumber(safe.pnl, 0),
    time: cleanText(safe.time, 32) || "--",
    journal: {
      strategy: cleanText(journal.strategy, 24),
      emotion: cleanText(journal.emotion, 24),
      rating: finiteNumber(journal.rating, 0) || null,
      note: cleanText(journal.note, 600),
      updatedAt: finiteNumber(journal.updatedAt, 0) || null,
    },
    likesCount: await publicTradeLikesCount(ownerId, tradeId),
    likedByMe: Boolean(tradeLike),
    comments: comments.map(normalizePublicComment),
  };
}

function normalizePublicComment(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: cleanText(row.author_name, 32) || "使用者",
    body: cleanText(row.body, 240),
    createdAt: row.created_at,
  };
}

function normalizeNotification(row) {
  return {
    id: row.id,
    type: cleanText(row.type, 32),
    actorId: row.actor_id,
    actorName: cleanText(row.actor_name, 32) || "使用者",
    ownerId: row.owner_id,
    tradeId: cleanText(row.trade_id, 64),
    body: cleanText(row.body, 240),
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

async function createNotification(recipientId, actorId, type, ownerId = null, tradeId = null, body = null) {
  if (!recipientId || !actorId || recipientId === actorId) return;
  await statements.createNotification.run(
    recipientId,
    actorId,
    type,
    ownerId,
    tradeId ? cleanText(tradeId, 64) : null,
    body ? cleanText(body, 240) : null,
  );
}

function isPublicTrade(trade) {
  return Boolean(trade && typeof trade === "object" && trade.journal?.public === true);
}

async function findPublicTrade(ownerId, tradeId, options = {}) {
  const row = await statements.getPublicProfile.get(ownerId);
  if (!row) return null;
  const snapshot = parseSnapshot(row.snapshot);
  const trade = Array.isArray(snapshot.history)
    ? snapshot.history.find((item) => cleanText(item?.id, 64) === tradeId && isPublicTrade(item))
    : null;
  if (trade && !options.includeHidden && await isPublicTradeHidden(ownerId, tradeId)) return null;
  return trade ? { owner: row, trade } : null;
}

async function hiddenTradeSet() {
  const rows = await statements.getHiddenTradeKeys.all();
  return new Set(rows.map((row) => publicTradeKey(row.owner_id, row.trade_id)));
}

async function isPublicTradeHidden(ownerId, tradeId) {
  const rows = await statements.getHiddenTradeKeys.all();
  return rows.some((row) => String(row.owner_id) === String(ownerId) && String(row.trade_id) === String(tradeId));
}

function publicTradeKey(ownerId, tradeId) {
  return `${ownerId}:${tradeId}`;
}

async function publicTradeLikesCount(ownerId, tradeId) {
  const row = await statements.getTradeLikesCount.get(ownerId, tradeId);
  return Math.max(0, Math.round(finiteNumber(row?.count, 0)));
}

function parseSnapshot(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeSnapshot(snapshot) {
  const safe = snapshot && typeof snapshot === "object" ? snapshot : {};
  return {
    activeSymbol: cleanText(safe.activeSymbol, 16) || "BTCUSDT",
    selectedMode: safe.selectedMode === "spot" ? "spot" : "perp",
    marketSource: safe.marketSource === "binance" ? "binance" : "sim",
    cash: finiteNumber(safe.cash, 0),
    positions: safeObject(safe.positions),
    spot: safeObject(safe.spot),
    openOrders: Array.isArray(safe.openOrders) ? safe.openOrders.slice(0, 80) : [],
    history: Array.isArray(safe.history) ? safe.history.slice(0, 120) : [],
    dismissedAlerts: safeObject(safe.dismissedAlerts),
    learningProgress: safeObject(safe.learningProgress),
    realizedPnl: finiteNumber(safe.realizedPnl, 0),
  };
}

function sanitizeMetrics(metrics) {
  const safe = metrics && typeof metrics === "object" ? metrics : {};
  return {
    equity: finiteNumber(safe.equity, 0),
    roi: finiteNumber(safe.roi, 0),
    tradesCount: Math.max(0, Math.min(100000, Math.round(finiteNumber(safe.tradesCount, 0)))),
  };
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}
