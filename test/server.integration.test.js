import assert from "node:assert/strict";
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
    const registered = await jsonRequest(origin, "/api/auth/register", {
      method: "POST",
      body: { name: "Integration User", email, password: "password123" },
    });
    assert.equal(registered.status, 201);
    const token = registered.data.token;

    const sync = await jsonRequest(origin, "/api/account/sync", {
      method: "POST",
      token,
      body: { snapshot: { cash: 10000, history: [] }, metrics: { equity: 10000, roi: 0, tradesCount: 0 } },
    });
    assert.equal(sync.status, 200);

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
