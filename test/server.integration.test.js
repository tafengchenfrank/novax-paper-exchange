import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const rootDir = new URL("../", import.meta.url);

test("protects private files and supports permanent account deletion", async () => {
  const port = await availablePort();
  const dataDir = mkdtempSync(join(tmpdir(), "novax-test-"));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(port),
      NOVAX_DATA_DIR: dataDir,
      NOVAX_DATABASE_PATH: join(dataDir, "novax.sqlite"),
      NOVAX_PUBLIC_ORIGIN: origin,
      DATABASE_URL: "",
      NOVAX_BILLING_PROVIDER: "lemonsqueezy",
      LEMONSQUEEZY_CHECKOUT_URL: "https://novax-test.lemonsqueezy.com/checkout/buy/12345",
      LEMONSQUEEZY_PORTAL_URL: "https://novax-test.lemonsqueezy.com/billing",
      LEMONSQUEEZY_PRO_VARIANT_ID: "12345",
      LEMONSQUEEZY_WEBHOOK_SECRET: "integration-webhook-secret",
      NOVAX_BILLING_LINK_SECRET: "integration-link-secret",
      NOVAX_BILLING_ALLOW_TEST_MODE: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });

  try {
    await waitForServer(origin, child, () => logs);

    const home = await fetch(origin);
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-security-policy") || "", /default-src 'self'/);
    assert.equal(await rawStatus(port, "/src/%2e%2e%2fpackage.json"), 404);
    assert.equal(await rawStatus(port, "/assets/%2e%2e%2fserver%2fconfig.js"), 404);

    const email = `integration-${Date.now()}@novax.local`;
    const rejectedConsent = await jsonRequest(origin, "/api/auth/register", {
      method: "POST",
      body: { name: "No Consent", email: `no-consent-${email}`, password: "password123" },
    });
    assert.equal(rejectedConsent.status, 400);

    const registered = await jsonRequest(origin, "/api/auth/register", {
      method: "POST",
      body: {
        name: "Integration User",
        email,
        password: "password123",
        acceptedTerms: true,
        acceptedPrivacy: true,
      },
    });
    assert.equal(registered.status, 201);
    const token = registered.data.token;

    const sync = await jsonRequest(origin, "/api/account/sync", {
      method: "POST",
      token,
      body: { snapshot: { cash: 10000, history: [] }, metrics: { equity: 10000, roi: 0, tradesCount: 0 } },
    });
    assert.equal(sync.status, 200);

    const rejectedCheckout = await jsonRequest(origin, "/api/billing/checkout", {
      method: "POST",
      token,
      body: { acceptedTerms: true },
    });
    assert.equal(rejectedCheckout.status, 400);

    const checkout = await jsonRequest(origin, "/api/billing/checkout", {
      method: "POST",
      token,
      body: { acceptedTerms: true, acceptedPrivacy: true, acceptedRecurring: true },
    });
    assert.equal(checkout.status, 200);
    const checkoutUrl = new URL(checkout.data.checkoutUrl);
    const accountId = checkoutUrl.searchParams.get("checkout[custom][account_id]");
    const accountSignature = checkoutUrl.searchParams.get("checkout[custom][account_signature]");
    assert.ok(accountId);
    assert.match(accountSignature, /^[a-f0-9]{64}$/);

    const activeWebhook = subscriptionWebhook({
      eventName: "subscription_created",
      accountId,
      accountSignature,
      status: "active",
    });
    const activeResult = await signedWebhook(origin, activeWebhook);
    assert.equal(activeResult.status, 200, JSON.stringify(activeResult.data));
    assert.equal(activeResult.data.plan, "pro");

    const duplicateResult = await signedWebhook(origin, activeWebhook);
    assert.equal(duplicateResult.status, 200);
    assert.equal(duplicateResult.data.duplicate, true);

    const billingStatus = await jsonRequest(origin, "/api/billing/status", { token });
    assert.equal(billingStatus.status, 200);
    assert.equal(billingStatus.data.subscription.hasProAccess, true);
    assert.equal(billingStatus.data.subscription.plan, "pro");

    const blockedSubscribedDeletion = await jsonRequest(origin, "/api/me", {
      method: "DELETE",
      token,
      body: { currentPassword: "password123" },
    });
    assert.equal(blockedSubscribedDeletion.status, 409);
    assert.equal(blockedSubscribedDeletion.data.error, "ACTIVE_SUBSCRIPTION");

    const expiredWebhook = subscriptionWebhook({
      eventName: "subscription_expired",
      accountId,
      accountSignature,
      status: "expired",
      endsAt: new Date(Date.now() - 1000).toISOString(),
    });
    const expiredResult = await signedWebhook(origin, expiredWebhook);
    assert.equal(expiredResult.status, 200);
    assert.equal(expiredResult.data.plan, "free");

    const expiredStatus = await jsonRequest(origin, "/api/billing/status", { token });
    assert.equal(expiredStatus.data.subscription.hasProAccess, false);

    const rejected = await jsonRequest(origin, "/api/me", {
      method: "DELETE",
      token,
      body: { currentPassword: "wrong-password" },
    });
    assert.equal(rejected.status, 401);

    const deleted = await jsonRequest(origin, "/api/me", {
      method: "DELETE",
      token,
      body: { currentPassword: "password123" },
    });
    assert.equal(deleted.status, 200);

    const login = await jsonRequest(origin, "/api/auth/login", {
      method: "POST",
      body: { email, password: "password123" },
    });
    assert.equal(login.status, 401);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (child.exitCode === null) child.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  server.close();
  await once(server, "close");
  return port;
}

async function waitForServer(origin, child, getLogs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited before startup.\n${getLogs()}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {
      // Startup is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not become ready.\n${getLogs()}`);
}

function rawStatus(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    req.once("error", reject);
    req.end();
  });
}

async function jsonRequest(origin, path, { method = "GET", token = "", body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})),
  };
}

function subscriptionWebhook({ eventName, accountId, accountSignature, status, endsAt = null }) {
  return {
    meta: {
      event_name: eventName,
      test_mode: true,
      custom_data: {
        account_id: accountId,
        account_signature: accountSignature,
      },
    },
    data: {
      type: "subscriptions",
      id: "integration-subscription",
      attributes: {
        customer_id: 99,
        variant_id: 12345,
        status,
        renews_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        ends_at: endsAt,
        test_mode: true,
        urls: { customer_portal: "https://novax-test.lemonsqueezy.com/billing" },
      },
    },
  };
}

async function signedWebhook(origin, body) {
  const raw = JSON.stringify(body);
  const signature = createHmac("sha256", "integration-webhook-secret").update(raw).digest("hex");
  const response = await fetch(`${origin}/api/billing/webhooks/lemonsqueezy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
    },
    body: raw,
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})),
  };
}
