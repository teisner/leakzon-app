// Turning a meter's readings into the series a chart draws.
//
// This used to be done inline in the chart, keyed on the calendar date, and it
// kept the *first* reading of each day and discarded the rest. That was correct
// while a meter could only hold one reading a day. With hourly data it threw
// away 23 readings in 24 and reported a day's consumption as one hour of it.

const HOUR_MS = 3600 * 1000;

// The moment a reading belongs to. reading_at carries the time; reading_date is
// the same moment truncated, kept for everything written before hourly data
// existed.
export function readingMoment(r) {
  const raw = r?.reading_at || r?.reading_date;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hourKey = (d) => `${dayKey(d)}T${String(d.getHours()).padStart(2, "0")}`;
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * What shape the data actually is, rather than what the project claims.
 * A meter is only worth charting hourly if it really carries several readings
 * within a day.
 */
export function detectSeriesGranularity(readings) {
  const perDay = new Map();
  let offMidnight = 0;
  let total = 0;
  for (const r of readings || []) {
    const d = readingMoment(r);
    if (!d) continue;
    total++;
    if (d.getHours() !== 0 || d.getMinutes() !== 0) offMidnight++;
    const k = dayKey(d);
    if (!perDay.has(k)) perDay.set(k, new Set());
    perDay.get(k).add(hourKey(d));
  }
  const maxPerDay = perDay.size ? Math.max(...[...perDay.values()].map((s) => s.size)) : 0;
  return {
    total,
    days: perDay.size,
    maxPerDay,
    offMidnight,
    // Either signal is enough: a stated time, or more than one reading in a day.
    hourly: offMidnight > 0 || maxPerDay > 1,
  };
}

/**
 * Which periods actually hold readings — the answer to "where is my data?".
 * Used both to report coverage and to offer a view with the empty stretches
 * left out.
 */
export function coverageSummary(readings) {
  const days = new Set();
  const stamps = new Set();
  let first = null;
  let last = null;
  for (const r of readings || []) {
    const d = readingMoment(r);
    if (!d) continue;
    days.add(dayKey(d));
    stamps.add(d.getTime());
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
  }
  const spanDays = first && last
    ? Math.floor((new Date(dayKey(last)) - new Date(dayKey(first))) / (24 * HOUR_MS)) + 1
    : 0;
  return {
    daysWithData: days.size,
    readings: stamps.size,
    first,
    last,
    spanDays,
    // Days inside the range that hold nothing at all.
    emptyDays: Math.max(0, spanDays - days.size),
  };
}

/**
 * Builds the points to plot.
 *
 * granularity — "hourly" | "daily" | "monthly"
 * fillGaps    — when true, periods with no reading are emitted as zero so the
 *               gap is visible; when false they are simply absent, which is the
 *               "only periods with data" view.
 *
 * Values are SUMMED within a period. For daily over hourly data that is the
 * day's real consumption; taking the first reading, as the chart used to,
 * reported one hour of it.
 */
export function buildSeries(readings, { granularity = "daily", from = null, to = null, fillGaps = true } = {}) {
  const buckets = new Map();
  const keyOf = granularity === "hourly" ? hourKey : granularity === "monthly" ? monthKey : dayKey;

  for (const r of readings || []) {
    const d = readingMoment(r);
    if (!d) continue;
    if (from && d < from) continue;
    if (to && d > to) continue;
    const k = keyOf(d);
    const existing = buckets.get(k);
    if (existing) {
      existing.consumption += Number(r.consumption) || 0;
      existing.count += 1;
    } else {
      buckets.set(k, {
        key: k,
        // The start of the period, so points sort and label consistently.
        at: granularity === "hourly" ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours())
          : granularity === "monthly" ? new Date(d.getFullYear(), d.getMonth(), 1)
          : new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        consumption: Number(r.consumption) || 0,
        count: 1,
      });
    }
  }

  let points = [...buckets.values()].sort((a, b) => a.at - b.at);
  if (!fillGaps || points.length === 0 || granularity === "monthly") return points;

  // Fill the empty periods between the first and last point so a gap reads as a
  // gap rather than as a straight line between two distant readings.
  const step = granularity === "hourly" ? HOUR_MS : 24 * HOUR_MS;
  const start = from ? new Date(from) : points[0].at;
  const end = to ? new Date(to) : points[points.length - 1].at;
  if (granularity === "hourly") start.setMinutes(0, 0, 0); else start.setHours(0, 0, 0, 0);

  // A guard against filling something absurd — a year of hourly slots is 8,760
  // points, which no chart reads usefully and no browser enjoys.
  const slots = Math.floor((end - start) / step) + 1;
  if (slots > 20000) return points;

  const byKey = new Map(points.map((p) => [p.key, p]));
  const filled = [];
  for (let t = new Date(start); t <= end; t = new Date(t.getTime() + step)) {
    const k = keyOf(t);
    filled.push(byKey.get(k) || { key: k, at: new Date(t), consumption: 0, count: 0, isMissing: true });
  }
  return filled;
}

/**
 * The granularity to open on: what the project says it is, unless the data
 * cannot support it. An AMI project is hourly by nature; anything else is read
 * periodically and belongs on a daily axis.
 */
export function defaultGranularity(projectType, detected) {
  if (!detected?.hourly) return "daily";
  return String(projectType || "").toUpperCase() === "AMI" ? "hourly" : "daily";
}
