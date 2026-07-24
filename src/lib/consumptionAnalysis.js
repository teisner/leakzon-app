/**
 * Determines whether the readings contain at least `minDays` consecutive
 * calendar days of data — i.e. a streak of daily readings with no gaps.
 *
 * @param {Date[]} dates — parsed reading dates
 * @param {number} minDays — minimum consecutive-day streak required (default 7)
 * @returns {boolean}
 */
export function hasContinuousDailyData(dates, minDays = 7) {
  if (!dates || dates.length < minDays) return false;

  // Unique day keys (YYYY-MM-DD)
  const dayKeys = [...new Set(
    dates.map((d) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
    })
  )];

  if (dayKeys.length < minDays) return false;

  // Convert back to Date objects at midnight, sort ascending
  const days = dayKeys
    .map((k) => {
      const [y, m, dd] = k.split("-").map(Number);
      return new Date(y, m, dd);
    })
    .sort((a, b) => a.getTime() - b.getTime());

  let best = 1;
  let cur = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((days[i].getTime() - days[i - 1].getTime()) / 86400000);
    if (diff === 1) {
      cur++;
      best = Math.max(best, cur);
    } else {
      cur = 1;
    }
  }

  return best >= minDays;
}