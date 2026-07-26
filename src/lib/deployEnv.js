// Whether this build is being served somewhere other than production.
//
// Decided from the hostname at runtime rather than a build-time flag, so it
// cannot go wrong on the real domain: production is whitelisted explicitly and
// everything else (Vercel preview URLs, localhost) counts as a preview. Add any
// new production domain here, otherwise it will show the PREVIEW badge.
const PRODUCTION_HOSTS = ["ob.leakzon.app"];

export const IS_PREVIEW =
  typeof window !== "undefined" && !PRODUCTION_HOSTS.includes(window.location.hostname);
