import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.NOVAX_E2E_PORT || 8791);
const e2eOrigin = `http://127.0.0.1:${e2ePort}`;
const usesExternalServer = process.env.NOVAX_E2E_EXTERNAL === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  workers: 1,
  expect: {
    timeout: 7000,
  },
  use: {
    baseURL: e2eOrigin,
    trace: "retain-on-failure",
  },
  webServer: usesExternalServer ? undefined : {
    command: "node server/server.js",
    url: `${e2eOrigin}/api/health`,
    reuseExistingServer: false,
    timeout: 15000,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(e2ePort),
      NOVAX_PUBLIC_ORIGIN: e2eOrigin,
      NOVAX_DATABASE_PATH: "./data/novax-e2e.sqlite",
      NOVAX_ADMIN_TOKEN: "e2e-admin-token",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
