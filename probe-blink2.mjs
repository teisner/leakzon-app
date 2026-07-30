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

// pick a row whose View-on-map button is enabled, and note its UID
const picked = await page.evaluate(() => {
  const rows = [...document.querySelectorAll("tbody tr")];
  for (const tr of rows) {
    const b = tr.querySelector('button[title="View on map"]');
    if (b && !b.disabled) return { uid: tr.querySelector("td")?.innerText.trim().split("\n")[0], idx: rows.indexOf(tr) };
  }
  return null;
});
console.log("clicking row", JSON.stringify(picked));
await page.evaluate((idx) => {
  const tr = [...document.querySelectorAll("tbody tr")][idx];
  tr.querySelector('button[title="View on map"]').click();
}, picked.idx);

await page.waitForTimeout(700);
console.log(await page.evaluate(() => {
  const amber = [...document.querySelectorAll("path")].filter(p => ["#fbbf24","#f59e0b"].includes((p.getAttribute("stroke")||"").toLowerCase()));
  return amber.map(p => "  " + p.outerHTML.slice(0, 200)).join("\n") || "  (none)";
}));
for (const t of [400]) {
  await page.waitForTimeout(t === 400 ? 400 : 800);
  const r = await page.evaluate(() => {
    const all = [...document.querySelectorAll("path")];
    const cls = (p) => p.getAttribute("class") || "";
    return {
      total: all.length,
      blink: all.filter(p => cls(p).includes("meter-blink")).length,
      pulse: all.filter(p => cls(p).includes("meter-highlight-pulse")).length,
      amber: all.filter(p => (p.getAttribute("stroke") || "").toLowerCase() === "#fbbf24" || (p.getAttribute("stroke") || "").toLowerCase() === "#f59e0b").length,
    };
  });
  console.log(`  paths=${r.total} blink=${r.blink} pulseRing=${r.pulse} amberStroked=${r.amber}`);
}
await browser.close();
