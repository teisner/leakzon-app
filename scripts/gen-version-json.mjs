// Writes public/version.json from src/lib/version.js before every build.
//
// The running bundle has APP_VERSION baked in, so it can't tell that a newer
// build has been deployed. version.json is a tiny static file served fresh from
// the current deployment, so an old tab can fetch it and notice it's behind.
// Generated (not hand-maintained) so it can never drift from APP_VERSION.
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(resolve(root, "src/lib/version.js"), "utf8");

const match = src.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
if (!match) {
  console.error("gen-version-json: could not find APP_VERSION in src/lib/version.js");
  process.exit(1);
}

const out = resolve(root, "public/version.json");
writeFileSync(out, JSON.stringify({ version: match[1] }) + "\n");

// Also publish the changelog as a static file. The app bundles versions.md at
// build time for instant render, but the "refresh changelog" button needs to
// read what the *current* deployment has, which a bundled copy can never show.
copyFileSync(resolve(root, "versions.md"), resolve(root, "public/versions.md"));
copyFileSync(resolve(root, "Product_overview.md"), resolve(root, "public/Product_overview.md"));

console.log(`gen-version-json: wrote ${match[1]} -> public/version.json + public/versions.md + public/Product_overview.md`);
