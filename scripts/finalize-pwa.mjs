import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const path = new URL("../dist/", import.meta.url);
const html = readFileSync(new URL("index.html", path), "utf8");
const workerPath = new URL("sw.js", path);
const worker = readFileSync(workerPath, "utf8");
const manifest = readFileSync(new URL("manifest.webmanifest", path), "utf8");
const version = createHash("sha256")
  .update(html)
  .update(worker)
  .update(manifest)
  .digest("hex")
  .slice(0, 16);
writeFileSync(workerPath, worker.replaceAll("__CRUX_BUILD__", version));
writeFileSync(new URL(".nojekyll", path), "");
console.log(`Offline app cache: ${version}`);
