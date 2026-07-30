import { chromium } from "playwright";
import fs from "fs";
const SCR = "/private/tmp/claude-502/-Users-tomereisner-Documents-Onboarding/ee5cec51-7c73-434f-beb2-26e59601c2ec/scratchpad";
const BASE = "http://localhost:4319";
const session = JSON.parse(fs.readFileSync(`${SCR}/session.json`, "utf8"));
const user = JSON.parse(fs.readFileSync(`${SCR}/user.json`, "utf8"))[0];
const projects = JSON.parse(fs.readFileSync(`${SCR}/projects.json`, "utf8"));
const obion = projects.find(p => p.name === "Obion TN");
const wood = projects.find(p => p.name === "Woodlawn");
const env = fs.readFileSync("/Users/tomereisner/Documents/Onboarding/leakzon-app/.env.local", "utf8");
const ref = env.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// Seed the app's session the same way auth-login does: a Supabase session under
// the client's storage key, plus the system_user row the UI reads.
await ctx.addInitScript(({ ref, session, user }) => {
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
    access_token: session.access_token, refresh_token: session.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (session.expires_in || 3600),
    expires_in: session.expires_in || 3600, token_type: "bearer", user: session.user,
  }));
  localStorage.setItem("loggedInUser", JSON.stringify(user));
}, { ref, session, user });

const routes = [
  ["/",                                    "Dashboard"],
  [`/project/${obion.id}`,                 "Project — GIS map (Obion TN)"],
  [`/project/${obion.id}?view=data`,       "Project — Meter Data"],
  [`/project/${obion.id}?view=network`,    "Project — Network Design"],
  [`/project/${obion.id}?view=wetwork`,    "Project — Wetwork Inventory"],
  [`/project/${obion.id}?view=customer`,   "Project — Customer View"],
  [`/project/${obion.id}?view=updates`,    "Project — Version Updates"],
  [`/project/${obion.id}?view=settings`,   "Project — Settings"],
  [`/project/${obion.id}/upload`,          "Import / Export"],
  [`/project/${wood.id}?view=data`,        "Meter Data — Woodlawn (5,135)"],
  [`/mobile-locator/${obion.id}`,          "Mobile Locator (no token)"],
  [`/customer-mode/${obion.id}`,           "Customer Mode (no token)"],
  ["/no-such-route",                       "404 page"],
];

const results = [];
for (const [path, label] of routes) {
  const page = await ctx.newPage();
  const errors = [], failedReqs = [];
  page.on("pageerror", e => errors.push(e.message.split("\n")[0].slice(0, 90)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 90)); });
  page.on("requestfailed", r => failedReqs.push(r.url().split("/").pop()));
  const t0 = Date.now();
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 });
  } catch { /* networkidle can time out on the map's tile stream */ }
  await page.waitForTimeout(2500);
  const text = (await page.evaluate(() => document.body.innerText || "")).trim();
  const nodes = await page.evaluate(() => document.querySelectorAll("#root *").length);
  results.push({ label, ms: Date.now() - t0, chars: text.length, nodes, errors: [...new Set(errors)], failedReqs: [...new Set(failedReqs)],
                 head: text.replace(/\s+/g, " ").slice(0, 70) });
  await page.screenshot({ path: `${SCR}/shot-${label.replace(/[^a-z0-9]+/gi, "_")}.png` }).catch(() => {});
  await page.close();
}
await browser.close();

for (const r of results) {
  const blank = r.nodes < 40;
  const verdict = blank ? "BLANK" : r.errors.length ? "ERRORS" : "OK";
  console.log(`${verdict.padEnd(7)} ${String(r.nodes).padStart(5)} nodes  ${String(r.ms + "ms").padEnd(8)} ${r.label.padEnd(32)} ${r.head}`);
  for (const e of r.errors.slice(0, 3)) console.log(`          ↳ ${e}`);
}
fs.writeFileSync(`${SCR}/routes-result.json`, JSON.stringify(results, null, 2));
