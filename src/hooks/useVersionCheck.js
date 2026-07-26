import { useCallback, useEffect, useRef, useState } from "react";
import { APP_VERSION } from "@/lib/version";
import { IS_PREVIEW } from "@/lib/deployEnv";

// Production waits an hour and asks before reloading. Preview polls fast and
// reloads itself — the point of preview is to be looking at the newest build.
const CHECK_INTERVAL_MS = IS_PREVIEW ? 30 * 1000 : 60 * 60 * 1000;

// Remembers which version this tab already auto-reloaded for. Without it, a
// version.json that stays ahead of the served bundle (CDN lag, a failed build)
// would reload the tab forever.
const RELOADED_KEY = "leakzon:auto-reloaded-version";

async function hardReload(version) {
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === version) return false;
    sessionStorage.setItem(RELOADED_KEY, version);
  } catch {
    // Private mode with storage blocked — reloading anyway risks a loop.
    return false;
  }
  // Drop anything the Cache Storage API is holding so the reload really
  // re-fetches rather than replaying the old build.
  try {
    if (window.caches?.keys) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((k) => window.caches.delete(k)));
    }
  } catch {
    // Not fatal — the reload below still revalidates the document.
  }
  window.location.reload();
  return true;
}

// Versions are "1.NNN". Compare numerically per part so 1.100 > 1.047 (a plain
// string compare would get that wrong).
function isNewer(candidate, current) {
  const a = String(candidate).split(".").map((n) => parseInt(n, 10));
  const b = String(current).split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return false;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Polls the deployed version.json hourly and reports when the running tab is
 * behind. version.json is regenerated on every build (see
 * scripts/gen-version-json.mjs), so it reflects what's currently deployed while
 * APP_VERSION reflects what this tab loaded.
 *
 * @returns {{ latestVersion: string|null, checkNow: () => Promise<string|null> }}
 *   latestVersion is the newer deployed version (null when up to date);
 *   checkNow forces an immediate check and resolves with the same value.
 */
export function useVersionCheck() {
  const [latest, setLatest] = useState(null);
  const checkRef = useRef(async () => null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        // Cache-bust: without this a CDN/browser cache would keep handing back
        // the version.json that shipped with this tab's bundle.
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return null;
        const data = await res.json();
        if (cancelled || !data?.version) return null;
        const newer = isNewer(data.version, APP_VERSION) ? data.version : null;
        setLatest(newer);
        // On preview, don't prompt — just pick up the new build. If the reload
        // was suppressed (already tried for this version) the normal
        // badge/dialog path still applies as a fallback.
        if (newer && IS_PREVIEW) await hardReload(newer);
        return newer;
      } catch {
        // Offline or blocked — stay quiet, try again next tick.
      }
      return null;
    };

    checkRef.current = check;

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    // Also re-check when the tab regains focus, so a machine left asleep
    // overnight notices promptly instead of waiting out the hour.
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Stable identity so callers can put it in dependency arrays.
  const checkNow = useCallback(() => checkRef.current(), []);

  return { latestVersion: latest, checkNow };
}
