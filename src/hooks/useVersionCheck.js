import { useCallback, useEffect, useRef, useState } from "react";
import { APP_VERSION } from "@/lib/version";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

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
