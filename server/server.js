import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { createSession, hashPassword, hashToken, requireUser, verifyPassword } from "./auth.js";
import { config, publicConfigSummary } from "./config.js";
import { closeDatabase, statements } from "./db.js";

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
    if (!isAdminRequest(request)) {
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

function cleanFeedbackCategory(value) {
  const category = cleanText(value, 24);
  return ["bug", "idea", "ux", "other"].includes(category) ? category : "other";
}

function isAdminRequest(request) {
  if (!config.adminToken) return false;
  const token = cleanText(request.headers["x-admin-token"], 200);
  return token && token === config.adminToken;
}

function normalizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at,
  };
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
  const recentTrades = Array.isArray(snapshot.history)
    ? await Promise.all(
        snapshot.history
          .filter(isPublicTrade)
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
  const groups = await Promise.all(
    rows.map(async (row) => {
      const snapshot = parseSnapshot(row.snapshot);
      if (!Array.isArray(snapshot.history)) return [];

      return Promise.all(snapshot.history.filter(isPublicTrade).map(async (trade) => {
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

async function findPublicTrade(ownerId, tradeId) {
  const row = await statements.getPublicProfile.get(ownerId);
  if (!row) return null;
  const snapshot = parseSnapshot(row.snapshot);
  const trade = Array.isArray(snapshot.history)
    ? snapshot.history.find((item) => cleanText(item?.id, 64) === tradeId && isPublicTrade(item))
    : null;
  return trade ? { owner: row, trade } : null;
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
