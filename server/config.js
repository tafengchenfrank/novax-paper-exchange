import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = normalize(join(__dirname, ".."));

loadEnvFile(join(rootDir, ".env"));

const nodeEnv = cleanText(process.env.NODE_ENV || "development");
const isProduction = nodeEnv === "production";
const host = cleanText(process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1"));
const port = numberInRange(process.env.PORT, 1, 65535, 8787);
const dataDir = resolveFromRoot(process.env.NOVAX_DATA_DIR || "data");
const databasePath = resolveFromRoot(process.env.NOVAX_DATABASE_PATH || join(dataDir, "novax.sqlite"));
const databaseUrl = cleanText(process.env.DATABASE_URL || "");
const storage = databaseUrl ? "postgres" : "sqlite";
const databaseDisplay = storage === "postgres" ? maskDatabaseUrl(databaseUrl) : databasePath;
const publicOrigin = cleanText(process.env.NOVAX_PUBLIC_ORIGIN || "");
const sessionDays = numberInRange(process.env.NOVAX_SESSION_DAYS, 1, 90, 14);
const maxJsonBytes = numberInRange(process.env.NOVAX_MAX_JSON_BYTES, 1000, 5_000_000, 1_000_000);
const corsOrigins = splitCsv(process.env.NOVAX_CORS_ORIGINS || publicOrigin);
const adminToken = cleanText(process.env.NOVAX_ADMIN_TOKEN || "");
const resendApiKey = cleanText(process.env.RESEND_API_KEY || "");
const emailFrom = cleanText(process.env.NOVAX_EMAIL_FROM || "");
const supportEmail = cleanText(process.env.NOVAX_SUPPORT_EMAIL || emailFrom);
const smtpHost = cleanText(process.env.SMTP_HOST || "");
const smtpPort = numberInRange(process.env.SMTP_PORT, 1, 65535, smtpHost ? 587 : 0);
const smtpUser = cleanText(process.env.SMTP_USER || "");
const smtpPass = cleanText(process.env.SMTP_PASS || "");
const smtpSecure = parseBoolean(process.env.SMTP_SECURE, smtpPort === 465);
const smtpHeloName = cleanText(process.env.SMTP_HELO_NAME || "novax.local");
const passwordResetMinutes = numberInRange(process.env.NOVAX_PASSWORD_RESET_MINUTES, 5, 120, 30);
const smtpAuthComplete = (!smtpUser && !smtpPass) || Boolean(smtpUser && smtpPass);
const emailProvider = emailFrom && resendApiKey ? "resend" : emailFrom && smtpHost && smtpAuthComplete ? "smtp" : "";
const emailEnabled = Boolean(emailProvider);

export const config = {
  nodeEnv,
  isProduction,
  rootDir,
  host,
  port,
  dataDir,
  databasePath,
  databaseUrl,
  storage,
  databaseDisplay,
  publicOrigin,
  sessionDays,
  maxJsonBytes,
  corsOrigins,
  adminToken,
  passwordResetMinutes,
  email: {
    enabled: emailEnabled,
    provider: emailProvider,
    resendApiKey,
    from: emailFrom,
    supportEmail,
    smtp: {
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      pass: smtpPass,
      secure: smtpSecure,
      heloName: smtpHeloName,
    },
  },
};

export function publicConfigSummary() {
  return {
    env: config.nodeEnv,
    host: config.host,
    port: config.port,
    storage: config.storage,
    corsOrigins: config.corsOrigins.length,
    sessionDays: config.sessionDays,
    adminEnabled: Boolean(config.adminToken),
    emailEnabled: config.email.enabled,
    emailProvider: config.email.provider,
  };
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const index = trimmed.indexOf("=");
    if (index <= 0) return;

    const key = trimmed.slice(0, index).trim();
    const value = unquote(trimmed.slice(index + 1).trim());
    if (!key || process.env[key] !== undefined) return;
    process.env[key] = value;
  });
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function resolveFromRoot(value) {
  const clean = cleanText(value);
  if (!clean) return rootDir;
  return normalize(isAbsolute(clean) ? clean : resolve(rootDir, clean));
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberInRange(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function parseBoolean(value, fallback = false) {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function cleanText(value) {
  return String(value || "").trim();
}

function maskDatabaseUrl(value) {
  try {
    const url = new URL(value);
    url.username = url.username ? "***" : "";
    url.password = url.password ? "***" : "";
    return url.toString();
  } catch {
    return "postgres://***";
  }
}
