import { existsSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const publicFiles = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "service-worker.js",
]);

const assetExtensions = new Set([".png", ".svg"]);

export function resolvePublicAsset(rootDir, rawPathname) {
  const pathname = decodePathname(rawPathname);
  if (!pathname) return null;

  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  if (!requestedPath.startsWith("/") || requestedPath.includes("\\") || requestedPath.includes("\0")) {
    return null;
  }

  const relativePath = requestedPath.slice(1);
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  if (!isPublicAsset(relativePath)) return null;

  const root = resolve(rootDir);
  const target = resolve(root, relativePath);
  const pathFromRoot = relative(root, target);
  if (
    !pathFromRoot ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    return null;
  }

  if (!existsSync(target) || !statSync(target).isFile()) return null;
  return target;
}

function decodePathname(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return "";
  }
}

function isPublicAsset(relativePath) {
  if (publicFiles.has(relativePath)) return true;
  if (relativePath.startsWith("src/")) return extname(relativePath).toLowerCase() === ".js";
  if (relativePath.startsWith("assets/")) return assetExtensions.has(extname(relativePath).toLowerCase());
  return false;
}
