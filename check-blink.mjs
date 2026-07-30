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
const errs = [];
page.on("pageerror", e => errs.push(e.message.split("\n")[0]));
await page.goto("http://localhost:4319/project/bb514897-8a68-406c-8396-b2af9becacd7?view=data", { waitUntil: "networkidle" }).catch(()=>{});
await page.waitForTimeout(6000);

const btn = page.locator('button[title="View on map"]').first();
console.log("View-on-map buttons found:", await page.locator('button[title="View on map"]').count());
await btn.click();

const sample = async (label) => {
  const r = await page.evaluate(() => {
    const blink = document.querySelectorAll("path.meter-blink");
    const one = blink[0];
    return {
      inGis: !!document.querySelector(".leaflet-container"),
      blinkCount: blink.length,
      anim: one ? getComputedStyle(one).animationName + " " + getComputedStyle(one).animationDuration + " x" + getComputedStyle(one).animationIterationCount : null,
      opacity: one ? Number(getComputedStyle(one).opacity).toFixed(2) : null,
      highlightRings: document.querySelectorAll("path.meter-highlight-pulse").length,
    };
  });
  console.log(`  ${label.padEnd(18)} gis=${r.inGis} blink=${r.blinkCount} opacity=${r.opacity} rings=${r.highlightRings} ${r.anim || ""}`);
  return r;
};
await page.waitForTimeout(300); await sample("t≈0.3s");
await page.waitForTimeout(1200); await sample("t≈1.5s");
await page.waitForTimeout(1000); await sample("t≈2.5s");
await page.waitForTimeout(3000); await sample("t≈5.5s");
console.log(await page.evaluate(() => {
  const paths = document.querySelectorAll(".leaflet-overlay-pane path");
  const amber = [...paths].filter(p => (p.getAttribute("stroke") || "").toLowerCase().includes("fbbf24") || (p.getAttribute("stroke")||"").toLowerCase().includes("f59e0b"));
  return `  leaflet paths: ${paths.length} | amber-stroked: ${amber.length} | classes seen: ${[...new Set([...paths].map(p=>p.getAttribute("class")||"-"))].slice(0,6).join(" / ")}`;
}));
console.log("page errors:", errs.length ? errs : "none");
await page.screenshot({ path: `${SCR}/blink.png` });
await browser.close();
