import { chromium } from "./node_modules/playwright/index.mjs";
import fs from "fs";
const SCR = "/private/tmp/claude-502/-Users-tomereisner-Documents-Onboarding/ee5cec51-7c73-434f-beb2-26e59601c2ec/scratchpad";
const session = JSON.parse(fs.readFileSync(`${SCR}/session.json`, "utf8"));
const user = JSON.parse(fs.readFileSync(`${SCR}/user.json`, "utf8"))[0];
const ref = fs.readFileSync("./.env.local", "utf8").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await ctx.addInitScript(({ ref, session, user }) => {
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: session.access_token,
    refresh_token: session.refresh_token, expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600,
    token_type: "bearer", user: session.user }));
  localStorage.setItem("loggedInUser", JSON.stringify(user));
}, { ref, session, user });
const page = await ctx.newPage();
await page.goto("http://localhost:4319/project/bb514897-8a68-406c-8396-b2af9becacd7?view=data", { waitUntil: "networkidle" }).catch(()=>{});
await page.waitForTimeout(7000);

const idx = await page.evaluate(() => {
  const rows = [...document.querySelectorAll("tbody tr")];
  return rows.findIndex(tr => { const b = tr.querySelector('button[title="View on map"]'); return b && !b.disabled; });
});
const countDisc = () => page.evaluate(() =>
  [...document.querySelectorAll("path")].filter(p =>
    (p.getAttribute("fill") || "").toLowerCase() === "#fbbf24" &&
    (p.getAttribute("fill-opacity") || "") === "0.55").length);

console.log("before click, blink discs:", await countDisc());
await page.evaluate((i) => [...document.querySelectorAll("tbody tr")][i].querySelector('button[title="View on map"]').click(), idx);

const samples = [];
const t0 = Date.now();
while (Date.now() - t0 < 4000) {
  samples.push(`${((Date.now()-t0)/1000).toFixed(1)}s:${await countDisc()}`);
  await page.waitForTimeout(120);
}
console.log("disc present over time (1 = visible, 0 = hidden):");
console.log("  " + samples.join(" "));
const on = samples.filter(s => s.endsWith(":1")).length, off = samples.filter(s => s.endsWith(":0")).length;
console.log(`  visible in ${on} samples, hidden in ${off} — alternating means it blinks`);
console.log("after 3s, disc:", await countDisc(), "(0 = blinking stopped)");
console.log("map flew to the meter:", await page.evaluate(() => !!document.querySelector(".leaflet-container")));
await browser.close();
