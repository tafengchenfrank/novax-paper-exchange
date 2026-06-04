import { accessSync, constants, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { checkDatabase, closeDatabase } from "./db.js";
import { config } from "./config.js";

const checks = [];

await check("Node.js version", () => {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) {
    throw new Error(`Node 22+ is recommended, current is ${process.version}.`);
  }
  return process.version;
});

await check("Database", async () => {
  await checkDatabase();
  return config.databaseDisplay;
});

if (config.storage === "sqlite") {
  await check("Writable data directory", () => {
    mkdirSync(dirname(config.databasePath), { recursive: true });
    accessSync(dirname(config.databasePath), constants.R_OK | constants.W_OK);
    return dirname(config.databasePath);
  });
}

await check("HTTP bind", () => `${config.host}:${config.port}`);

await check("Email delivery", () => {
  const hasResendApiKey = Boolean(config.email.resendApiKey);
  const hasSender = Boolean(config.email.from);
  const hasSmtpHost = Boolean(config.email.smtp.host);
  const hasSmtpUser = Boolean(config.email.smtp.user);
  const hasSmtpPass = Boolean(config.email.smtp.pass);

  if (config.email.enabled && config.email.provider === "smtp") {
    return `smtp ${config.email.smtp.host}:${config.email.smtp.port} from ${config.email.from}`;
  }
  if (config.email.enabled && config.email.provider === "resend") {
    return `resend from ${config.email.from}`;
  }

  if (hasResendApiKey || hasSmtpHost || hasSmtpUser || hasSmtpPass || hasSender) {
    const missing = [
      hasResendApiKey && !hasSender ? "NOVAX_EMAIL_FROM" : "",
      hasSmtpHost && !hasSender ? "NOVAX_EMAIL_FROM" : "",
      !hasSmtpHost && (hasSmtpUser || hasSmtpPass) ? "SMTP_HOST" : "",
      hasSmtpUser && !hasSmtpPass ? "SMTP_PASS" : "",
      !hasSmtpUser && hasSmtpPass ? "SMTP_USER" : "",
      !hasResendApiKey && !hasSmtpHost ? "RESEND_API_KEY or SMTP_HOST" : "",
      !hasSender ? "NOVAX_EMAIL_FROM" : "",
    ].filter(Boolean);
    throw new Error(`Incomplete email config. Missing ${[...new Set(missing)].join(", ")}.`);
  }
  return "disabled; set Resend or SMTP env vars to enable password reset email";
});

if (config.isProduction) {
  if (config.storage === "postgres") {
    await check("PostgreSQL URL", () => {
      if (!config.databaseUrl) {
        throw new Error("Set DATABASE_URL to your PostgreSQL connection string.");
      }
      return config.databaseDisplay;
    });
  }

  await check("Production public origin", () => {
    if (!config.publicOrigin) {
      throw new Error("Set NOVAX_PUBLIC_ORIGIN to your HTTPS app URL.");
    }
    if (!config.publicOrigin.startsWith("https://")) {
      throw new Error("NOVAX_PUBLIC_ORIGIN should use HTTPS in production.");
    }
    return config.publicOrigin;
  });
}

const failed = checks.filter((item) => !item.ok);
checks.forEach((item) => {
  const prefix = item.ok ? "OK" : "FAIL";
  const detail = item.ok ? item.detail : item.error;
  process.stdout.write(`${prefix} ${item.name}: ${detail}\n`);
});

if (failed.length) {
  process.exitCode = 1;
} else {
  process.stdout.write("NovaX doctor passed.\n");
}

await closeDatabase();

async function check(name, fn) {
  try {
    checks.push({ name, ok: true, detail: await fn() });
  } catch (error) {
    checks.push({ name, ok: false, error: error.message });
  }
}
