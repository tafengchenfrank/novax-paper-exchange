import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolvePublicAsset } from "../server/static-files.js";

const rootDir = fileURLToPath(new URL("../", import.meta.url));

test("resolves only intended public files", () => {
  assert.equal(resolvePublicAsset(rootDir, "/")?.endsWith("index.html"), true);
  assert.equal(resolvePublicAsset(rootDir, "/src/main.js")?.endsWith("main.js"), true);
  assert.equal(resolvePublicAsset(rootDir, "/assets/novax-logo.svg")?.endsWith("novax-logo.svg"), true);
  assert.equal(resolvePublicAsset(rootDir, "/server/server.js"), null);
  assert.equal(resolvePublicAsset(rootDir, "/package.json"), null);
});

test("rejects encoded traversal and malformed paths", () => {
  assert.equal(resolvePublicAsset(rootDir, "/src/%2e%2e%2f.env"), null);
  assert.equal(resolvePublicAsset(rootDir, "/assets/%2e%2e%2fserver%2fconfig.js"), null);
  assert.equal(resolvePublicAsset(rootDir, "/src/%5c..%5c.env"), null);
  assert.equal(resolvePublicAsset(rootDir, "/src/%E0%A4%A"), null);
});
