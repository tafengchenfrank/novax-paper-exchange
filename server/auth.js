import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { statements } from "./db.js";

const keyLength = 64;

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: scryptSync(password, salt, keyLength).toString("hex"),
  };
}

export function verifyPassword(password, salt, storedHash) {
  const candidate = Buffer.from(hashPassword(password, salt).hash, "hex");
  const stored = Buffer.from(storedHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export async function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000).toISOString();
  await statements.createSession.run(userId, tokenHash, expiresAt);
  return { token, expiresAt };
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requireUser(request) {
  const auth = request.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;

  await statements.deleteExpiredSessions.run();
  const row = await statements.getSession.get(hashToken(token));
  if (!row) return null;

  return {
    token,
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: userRole(row),
      createdAt: row.created_at,
    },
  };
}

function userRole(row) {
  return row.role === "admin" ? "admin" : "user";
}
