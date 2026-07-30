// How a meter's coordinates came to be, for the small marker shown beside them.
//
// A location that arrived in the import file is the trustworthy case and gets no
// icon — anything else was worked out or placed by someone, and that is worth
// seeing at a glance next to the numbers. The meter table and the map markers
// both need this and must agree, so the mapping lives here.
//
// `meter.location_source` is null for an imported location. The values written
// elsewhere in the app:
//   estimated  — interpolated between located meters on the same street
//   geocoded   — looked up from the address
//   field      — dropped by someone standing there, via the Mobile Locator
//   manual     — typed in, or dragged on the map
//   generated  — invented for an export (a placeholder main for a DMA)

export const LOCATION_SOURCES = {
  estimated: { key: "estimated", icon: "sparkles", tone: "violet" },
  geocoded: { key: "geocoded", icon: "search", tone: "blue" },
  field: { key: "field", icon: "smartphone", tone: "emerald" },
  manual: { key: "manual", icon: "move", tone: "amber" },
  generated: { key: "generated", icon: "circle", tone: "slate" },
};

// Anything unrecognised is still shown — an unknown source is information, and
// silently treating it as imported would be a lie.
const FALLBACK = { key: "other", icon: "sparkles", tone: "slate" };

// Returns null when the location came from the import and needs no marker.
export function locationSourceInfo(meter) {
  const raw = meter?.location_source;
  if (!raw) return null;
  if (meter?.latitude == null || meter?.longitude == null) return null;
  const key = String(raw).toLowerCase().trim();
  return LOCATION_SOURCES[key] || { ...FALLBACK, key };
}

// i18n key for the tooltip, e.g. locationSource.estimated
export function locationSourceLabelKey(info) {
  return `locationSource.${info?.key || "other"}`;
}

// Tailwind classes per tone, kept beside the tones so a new source only has to
// be added in one place.
export const LOCATION_SOURCE_CLASSES = {
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  slate: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};
