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
const failed = [];
page.on("requestfailed", r => failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 70)}`));
await page.goto("http://localhost:4319/project/bb514897-8a68-406c-8396-b2af9becacd7", { waitUntil: "networkidle" }).catch(()=>{});
await page.waitForTimeout(8000);
console.log(await page.evaluate(() => {
  const svgPaths = document.querySelectorAll(".leaflet-container svg path");
  const panes = [...document.querySelectorAll(".leaflet-pane")].map(p => `${p.className.split(" ").pop()}:${p.children.length}`);
  return [
    `leaflet container: ${!!document.querySelector(".leaflet-container")}`,
    `svg paths: ${svgPaths.length}`,
    `circle markers: ${document.querySelectorAll("path.leaflet-interactive").length}`,
    `panes: ${panes.join(" ")}`,
  ].join("\n");
}));
console.log("failed requests:", failed.slice(0, 4).length ? failed.slice(0, 4) : "none");
await page.screenshot({ path: `${SCR}/map-state.png` });
await browser.close();
