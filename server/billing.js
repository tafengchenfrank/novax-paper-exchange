import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { statements } from "./db.js";

const subscriptionEvents = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
]);

export async function billingStatusForUser(userId) {
  const row = await statements.getSubscriptionByUser.get(userId);
  return normalizeSubscription(row);
}

export function createBillingCheckoutUrl(user) {
  if (!config.billing.enabled) {
    throw new BillingError("BILLING_DISABLED", "付費方案尚未開放，現在不會收取任何費用。", 503);
  }

  let url;
  try {
    url = new URL(config.billing.checkoutUrl);
  } catch {
    throw new BillingError("BILLING_CONFIG_ERROR", "結帳設定不完整，請聯絡客服。", 503);
  }
  if (config.isProduction && url.protocol !== "https:") {
    throw new BillingError("BILLING_CONFIG_ERROR", "正式環境的結帳網址必須使用 HTTPS。", 503);
  }

  const accountId = String(user.id);
  url.searchParams.set("checkout[email]", user.email);
  url.searchParams.set("checkout[custom][account_id]", accountId);
  url.searchParams.set("checkout[custom][account_signature]", signAccountId(accountId));
  return url.toString();
}

export async function billingPortalUrlForUser(userId) {
  const subscription = await billingStatusForUser(userId);
  return config.billing.portalUrl || subscription.portalUrl || "";
}

export async function processLemonSqueezyWebhook(rawBody, signature) {
  if (!config.billing.enabled) {
    throw new BillingError("BILLING_DISABLED", "Billing webhook is not configured.", 503);
  }
  if (!validWebhookSignature(rawBody, signature)) {
    throw new BillingError("BAD_SIGNATURE", "Webhook signature is invalid.", 401);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new BillingError("INVALID_JSON", "Webhook payload is invalid.", 400);
  }

  const eventName = cleanText(payload?.meta?.event_name);
  if (!subscriptionEvents.has(eventName) || payload?.data?.type !== "subscriptions") {
    return { handled: false, duplicate: false };
  }

  const eventId = createHash("sha256").update(rawBody).digest("hex");
  if (await statements.getBillingEvent.get(eventId)) {
    return { handled: true, duplicate: true };
  }

  const attributes = payload?.data?.attributes || {};
  const providerSubscriptionId = cleanText(payload?.data?.id);
  const variantId = cleanText(attributes.variant_id);
  const testMode = Boolean(attributes.test_mode ?? payload?.meta?.test_mode);
  if (!providerSubscriptionId || variantId !== config.billing.proVariantId) {
    return { handled: false, duplicate: false };
  }
  if (testMode && !config.billing.allowTestMode) {
    await statements.recordBillingEvent.run(eventId, eventName);
    return { handled: false, duplicate: false };
  }

  const existing = await statements.getSubscriptionByProviderId.get("lemonsqueezy", providerSubscriptionId);
  const accountId = verifiedAccountId(payload?.meta?.custom_data) || Number(existing?.user_id || 0);
  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    throw new BillingError("ACCOUNT_LINK_MISSING", "Webhook is missing a valid NovaX account link.", 400);
  }
  if (!(await statements.getUserById.get(accountId))) {
    await statements.recordBillingEvent.run(eventId, eventName);
    return { handled: true, duplicate: false, accountDeleted: true };
  }

  const status = normalizeSubscriptionStatus(attributes.status);
  const renewsAt = isoDateOrNull(attributes.renews_at);
  const endsAt = isoDateOrNull(attributes.ends_at);
  const plan = grantsProAccess(status, endsAt) ? "pro" : "free";
  const portalUrl = safeHttpsUrl(attributes?.urls?.customer_portal);

  await statements.upsertSubscription.run(
    accountId,
    "lemonsqueezy",
    providerSubscriptionId,
    cleanText(attributes.customer_id) || null,
    plan,
    status,
    variantId,
    renewsAt,
    endsAt,
    portalUrl || null,
    config.storage === "postgres" ? testMode : Number(testMode),
  );
  await statements.recordBillingEvent.run(eventId, eventName);
  return { handled: true, duplicate: false, accountId, plan, status };
}

export class BillingError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "BillingError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalizeSubscription(row) {
  if (!row) {
    return {
      plan: "free",
      status: "none",
      hasProAccess: false,
      renewsAt: null,
      endsAt: null,
      portalUrl: config.billing.portalUrl || "",
      testMode: false,
    };
  }
  const status = normalizeSubscriptionStatus(row.status);
  const endsAt = isoDateOrNull(row.ends_at);
  const hasProAccess = row.plan === "pro" && grantsProAccess(status, endsAt);
  return {
    plan: hasProAccess ? "pro" : "free",
    status,
    hasProAccess,
    renewsAt: isoDateOrNull(row.renews_at),
    endsAt,
    portalUrl: config.billing.portalUrl || safeHttpsUrl(row.portal_url),
    testMode: Boolean(row.test_mode),
  };
}

function verifiedAccountId(customData) {
  const accountId = cleanText(customData?.account_id);
  const signature = cleanText(customData?.account_signature);
  if (!/^\d+$/.test(accountId) || !signature) return 0;
  const expected = Buffer.from(signAccountId(accountId), "hex");
  const supplied = Buffer.from(signature, "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return 0;
  const value = Number(accountId);
  return Number.isSafeInteger(value) ? value : 0;
}

function signAccountId(accountId) {
  return createHmac("sha256", config.billing.linkSecret).update(String(accountId)).digest("hex");
}

function validWebhookSignature(rawBody, signature) {
  const expected = createHmac("sha256", config.billing.webhookSecret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const suppliedBuffer = Buffer.from(cleanText(signature), "hex");
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function grantsProAccess(status, endsAt) {
  if (["active", "on_trial", "past_due"].includes(status)) return true;
  return status === "cancelled" && Boolean(endsAt && new Date(endsAt).getTime() > Date.now());
}

function normalizeSubscriptionStatus(value) {
  const status = cleanText(value).toLowerCase();
  return ["on_trial", "active", "paused", "past_due", "unpaid", "cancelled", "expired"].includes(status)
    ? status
    : "none";
}

function isoDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function safeHttpsUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function cleanText(value) {
  return String(value ?? "").trim();
}
