import { chromium } from "../../node_modules/playwright/index.mjs";
import fs from "fs";
const SCR = "/private/tmp/claude-502/-Users-tomereisner-Documents-Onboarding/ee5cec51-7c73-434f-beb2-26e59601c2ec/scratchpad";
const session = JSON.parse(fs.readFileSync(`${SCR}/session.json`, "utf8"));
const user = JSON.parse(fs.readFileSync(`${SCR}/user.json`, "utf8"))[0];
const projects = JSON.parse(fs.readFileSync(`${SCR}/projects.json`, "utf8"));
const obion = projects.find(p => p.name === "Obion TN");
const ref = fs.readFileSync("./.env.local", "utf8").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(({ ref, session, user }) => {
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
    access_token: session.access_token, refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now()/1000) + 3600, expires_in: 3600, token_type: "bearer", user: session.user }));
  localStorage.setItem("loggedInUser", JSON.stringify(user));
}, { ref, session, user });

// A translation key that has no entry renders as the key itself: word.word
const KEY_RE = /\b[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]{2,}\b/g;
const IGNORE = /\.(com|net|org|app|co|il|csv|xlsx|xls|geojson|json|zip|shp|dbf|prj|png|jpg|md|js|jsx|ts|sql|gov|biz)$/i;

const pages = [["/", "Dashboard"], [`/project/${obion.id}`, "GIS map"], [`/project/${obion.id}?view=data`, "Meter Data"],
  [`/project/${obion.id}?view=network`, "Network"], [`/project/${obion.id}?view=wetwork`, "Wetwork"],
  [`/project/${obion.id}?view=updates`, "Version Updates"], [`/project/${obion.id}?view=settings`, "Settings"],
  [`/project/${obion.id}/upload`, "Import / Export"], [`/mobile-locator/${obion.id}`, "Mobile Locator"]];

const found = new Map();
for (const [path, label] of pages) {
  const page = await ctx.newPage();
  try { await page.goto(`http://localhost:4319${path}`, { waitUntil: "networkidle", timeout: 40000 }); } catch {}
  await page.waitForTimeout(2000);
  const text = await page.evaluate(() => document.body.innerText || "");
  for (const m of text.match(KEY_RE) || []) {
    if (IGNORE.test(m)) continue;
    if (!found.has(m)) found.set(m, new Set());
    found.get(m).add(label);
  }
  await page.close();
}
await browser.close();

const i18n = fs.readFileSync("./src/lib/i18n.jsx", "utf8");
console.log(found.size ? "Untranslated keys showing in the UI:" : "No untranslated keys found.");
for (const [key, where] of [...found].sort()) {
  const declared = i18n.includes(`'${key}'`);
  console.log(`  ${declared ? "?" : "MISSING"}  ${key.padEnd(34)} seen on: ${[...where].join(", ")}`);
}
