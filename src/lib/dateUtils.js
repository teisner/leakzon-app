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

/**
 * Parse a date string from a consumption column header or cell.
 * Returns a Date object, or null if the string is not a recognizable date.
 */
export function parseHeaderDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (!s) return null;

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