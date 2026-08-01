/**
 * Date parsing and formatting utilities for consumption data imports.
 *
 * Column headers in consumption files often contain dates in various formats:
 *   "21/06/2026" (EU: DD/MM/YYYY)
 *   "06/21/2026" (US: MM/DD/YYYY)
 *   "2026-06-21" (ISO: YYYY-MM-DD)
 *   "06/2026"    (EU month: MM/YYYY)
 *   "Jun 2026", "June 2026"
 *
 * These utilities detect the source format, parse into a real Date, and
 * reformat to the project's preferred display format (US or EU).
 */

// A trailing clock time on a header or cell: "01/08/2026 14:30",
// "2026-08-01T14:00:00", "01/08/2026 2 PM". Returned separately from the date so
// the caller can tell "midnight was stated" from "no time was given" — the two
// look identical once parsed, but only the second means the file is daily.
const TIME_RE = /[T\s](\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(am|pm)?$|[T\s](\d{1,2})\s*(am|pm)$/i;

export function parseTimePart(str) {
  const s = String(str || "").trim();
  const m = s.match(TIME_RE);
  if (!m) return null;
  let hour = parseInt(m[1] ?? m[5], 10);
  const minute = parseInt(m[2] ?? "0", 10);
  const second = parseInt(m[3] ?? "0", 10);
  const ampm = (m[4] || m[6] || "").toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second, raw: m[0].trim() };
}

/**
 * Parse a date string from a consumption column header or cell.
 * Returns a Date object, or null if the string is not a recognizable date.
 */
export function parseHeaderDate(str) {
  if (!str) return null;
  let s = String(str).trim();
  if (!s) return null;

  // Strip a trailing time before matching the date patterns, then put it back
  // on the parsed Date. Without this "01/08/2026 14:30" fell through every
  // pattern to the generic Date() fallback, which reads it as US order.
  const time = parseTimePart(s);
  if (time) {
    s = s.slice(0, s.length - time.raw.length).replace(/[T,]\s*$/, "").trim();
    const base = parseHeaderDate(s);
    if (base) {
      base.setHours(time.hour, time.minute, time.second, 0);
      return base;
    }
  }

  // ISO: YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    if (!isNaN(d.getTime())) return d;
  }

  // DD/MM/YYYY or MM/DD/YYYY — disambiguate by which part > 12
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const a = parseInt(m[1]);
    const b = parseInt(m[2]);
    const year = parseInt(m[3]);
    // If first part > 12, it must be DD/MM (EU)
    if (a > 12 && b <= 12) {
      const d = new Date(year, b - 1, a);
      if (!isNaN(d.getTime())) return d;
    }
    // If second part > 12, it must be MM/DD (US)
    if (b > 12 && a <= 12) {
      const d = new Date(year, a - 1, b);
      if (!isNaN(d.getTime())) return d;
    }
    // Ambiguous (both <= 12) — assume EU (DD/MM) as default
    const d = new Date(year, b - 1, a);
    if (!isNaN(d.getTime())) return d;
  }

  // YYYY-MM (month only)
  m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) {
    const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, 1);
    if (!isNaN(d.getTime())) return d;
  }

  // MM/YYYY (month only)
  m = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = new Date(parseInt(m[2]), parseInt(m[1]) - 1, 1);
    if (!isNaN(d.getTime())) return d;
  }

  // Month name formats: "Jun 2026", "June 2026", "Jun-2026"
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  const lower = s.toLowerCase();
  const monthMatch = lower.match(/^([a-z]{3,})[\s\-]+(\d{4})$/);
  if (monthMatch) {
    const monthIdx = monthNames.indexOf(monthMatch[1]);
    if (monthIdx >= 0) {
      const realMonth = monthIdx % 12;
      const d = new Date(parseInt(monthMatch[2]), realMonth, 1);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Generic fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  return null;
}

/**
 * Format a Date to YYYY-MM-DD (ISO) for reliable storage and chart parsing.
 */
export function toISODate(date) {
  if (!date || isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Format a Date to the project's display format.
 * @param {Date} date
 * @param {"US"|"EU"} format — US = MM/DD/YYYY, EU = DD/MM/YYYY
 * @param {"day"|"month"} precision — "month" for month-only dates
 */
export function formatDateForProject(date, format = "EU", precision = "day") {
  if (!date || isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  if (precision === "month") {
    return `${m}/${y}`;
  }

  if (format === "US") {
    return `${m}/${d}/${y}`;
  }
  // EU default
  return `${d}/${m}/${y}`;
}

/**
 * Full pipeline: parse a raw date string and return both the ISO date
 * (for storage in reading_date) and the project-formatted label
 * (for display in period_label).
 *
 * @param {string} rawStr — the raw date string from a column header or cell
 * @param {"US"|"EU"} format — the project's date format
 * @returns {{ isoDate: string|null, label: string|null, precision: "day"|"month" }}
 */
export function normalizeDateForProject(rawStr, format = "EU") {
  const date = parseHeaderDate(rawStr);
  if (!date) return { isoDate: null, label: null, precision: "day" };

  // Detect precision: if the original string has no day component, it's month-only
  const s = String(rawStr).trim();
  const isMonthOnly = /^(\d{4})-(\d{1,2})$/.test(s) ||
    /^(\d{1,2})[\/\-](\d{4})$/.test(s) ||
    /^[a-z]{3,}[\s\-]+\d{4}$/i.test(s);

  const precision = isMonthOnly ? "month" : "day";
  return {
    isoDate: toISODate(date),
    label: formatDateForProject(date, format, precision),
    precision,
  };
}

/**
 * Format a Date as "YYYY-MM-DDTHH:MM:SS" for storage in reading_at.
 *
 * Deliberately not toISOString(): that converts to UTC, which would shift every
 * reading by the browser's offset and move some of them into the previous day.
 * A meter reading is a wall-clock event where the meter stands.
 */
export function toISODateTime(date) {
  if (!date || isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Whether a set of column headers (or cell values) carries times as well as
 * dates — i.e. whether the file is hourly rather than daily.
 *
 * Two signals, either of which is enough:
 *   - a header states a time of day
 *   - the same date appears more than once, which can only mean several
 *     readings within that day
 */
export function detectReadingGranularity(rawValues) {
  const values = (rawValues || []).map((v) => String(v ?? "").trim()).filter(Boolean);
  let withTime = 0;
  const perDate = new Map();
  for (const v of values) {
    const date = parseHeaderDate(v);
    if (!date) continue;
    if (parseTimePart(v)) withTime++;
    const key = toISODate(date);
    perDate.set(key, (perDate.get(key) || 0) + 1);
  }
  const repeatedDates = [...perDate.values()].filter((n) => n > 1).length;
  const granularity = withTime > 0 || repeatedDates > 0 ? "hourly" : "daily";
  return {
    granularity,
    withTime,
    repeatedDates,
    distinctDates: perDate.size,
    // The most readings any one date carries — 24 for a full hourly day.
    maxPerDate: perDate.size ? Math.max(...perDate.values()) : 0,
  };
}

/**
 * Full pipeline for one raw value: the timestamp to store, the date it falls
 * on, and a label to show. When the file states no time, the reading is midnight
 * — "01/08/2026 00:00" — which is what makes a daily file and an hourly one
 * comparable rather than two different shapes of data.
 */
export function normalizeReadingForProject(rawStr, format = "EU") {
  const date = parseHeaderDate(rawStr);
  if (!date) return { isoDateTime: null, isoDate: null, label: null, hasTime: false };
  const time = parseTimePart(String(rawStr || ""));
  if (!time) date.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  const { label, precision } = normalizeDateForProject(rawStr, format);
  // "08/2026 00:00" would be nonsense — a month has no clock time. Only a
  // day-precision reading carries one.
  const withClock = label && precision !== "month"
    ? `${label} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    : label;
  return {
    isoDateTime: toISODateTime(date),
    isoDate: toISODate(date),
    label: withClock,
    precision,
    hasTime: !!time,
  };
}
