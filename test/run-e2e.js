import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.NOVAX_E2E_PORT || 8791);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server/server.js"], {
  cwd: rootDir,
  env: {
    ...process.env,
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: String(port),
    NOVAX_PUBLIC_ORIGIN: origin,
    NOVAX_DATABASE_PATH: "./data/novax-e2e.sqlite",
    NOVAX_ADMIN_TOKEN: "e2e-admin-token",
  },
  stdio: ["ignore", "inherit", "inherit"],
});

let exitCode = 1;
try {
  await waitForServer(server);
  const playwright = spawn(
    process.execPath,
    [join(rootDir, "node_modules", "@playwright", "test", "cli.js"), "test", ...process.argv.slice(2)],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        NOVAX_E2E_EXTERNAL: "1",
        NOVAX_E2E_PORT: String(port),
      },
      stdio: "inherit",
    },
  );
  const [code] = await once(playwright, "exit");
  exitCode = code ?? 1;
} finally {
  await stopServer(server);
}

process.exit(exitCode);

async function waitForServer(child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error("E2E server exited before becoming ready.");
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`E2E server did not become ready at ${origin}.`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    once(child, "exit").then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}
