// Replaces base44/functions/getMeterAnomalies/entry.ts. Statistics logic
// ported verbatim — it's plain math, not Base44-specific.
import { admin, getCallerUser, hasProjectAccess, json, CORS_HEADERS } from '../_shared/authz.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { project_id } = await req.json();
    if (!project_id) return json({ error: 'project_id is required' }, 400);

    const user = await getCallerUser(req);
    if (!(await hasProjectAccess(user, project_id))) return json({ error: 'Unauthorized' }, 403);

    const allMeters: any[] = [];
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: batch } = await admin
        .from('meter')
        .select('*')
        .eq('project_id', project_id)
        .order('id')
        .range(from, from + 4999);
      allMeters.push(...(batch || []));
      hasMore = (batch?.length || 0) === 5000;
      from += 5000;
    }

    const readingsByMeter: Record<string, number[]> = {};
    from = 0;
    hasMore = true;
    while (hasMore) {
      const { data: batch } = await admin
        .from('consumption_reading')
        .select('meter_id, consumption')
        .eq('project_id', project_id)
        .order('id')
        .range(from, from + 4999);
      for (const r of batch || []) {
        if (!readingsByMeter[r.meter_id]) readingsByMeter[r.meter_id] = [];
        readingsByMeter[r.meter_id].push(r.consumption);
      }
      hasMore = (batch?.length || 0) === 5000;
      from += 5000;
    }

    const meterReadingCounts: Record<string, number> = {};
    for (const m of allMeters) meterReadingCounts[m.id] = (readingsByMeter[m.id] || []).length;
    const maxReadings = Math.max(0, ...Object.values(meterReadingCounts));

    const allValues: number[] = [];
    for (const vals of Object.values(readingsByMeter)) {
      for (const v of vals) if (v != null && !isNaN(v)) allValues.push(v);
    }
    const mean = allValues.length > 0 ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0;
    const variance =
      allValues.length > 0 ? allValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / allValues.length : 0;
    const stdDev = Math.sqrt(variance);

    const anomalies: any[] = [];
    for (const m of allMeters) {
      const rawValues = readingsByMeter[m.id] || [];
      const values = rawValues.filter((v) => v != null && !isNaN(v));
      const nonZeroValues = values.filter((v) => v !== 0);
      const hasNegative = values.some((v) => v < 0);
      const hasOutlier = stdDev > 0 && values.some((v) => Math.abs(v - mean) > 4 * stdDev);

      let category: string | null = null;
      let reason = '';

      if (values.length === 0 || nonZeroValues.length === 0) {
        category = 'no_data';
        reason = values.length === 0 ? 'No consumption readings found' : 'All readings are zero or empty';
      } else if (maxReadings > 0 && values.length < maxReadings * 0.5) {
        category = 'partial_data';
        const pct = Math.round((values.length / maxReadings) * 100);
        reason = `Only ${values.length} of ${maxReadings} expected readings (${pct}%)`;
      } else if (hasNegative || hasOutlier) {
        category = 'need_investigation';
        const reasons = [];
        if (hasNegative) reasons.push('Contains negative readings');
        if (hasOutlier) reasons.push('Contains extreme consumption outliers (>4σ from mean)');
        reason = reasons.join('; ');
      }

      if (category) {
        anomalies.push({
          ...m,
          anomaly_category: category,
          anomaly_reason: reason,
          reading_count: values.length,
          expected_readings: maxReadings,
          has_negative: hasNegative,
          has_outlier: hasOutlier,
          max_consumption: values.length > 0 ? Math.max(...values) : null,
          min_consumption: values.length > 0 ? Math.min(...values) : null,
          avg_consumption:
            values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null,
        });
      }
    }

    const order: Record<string, number> = { no_data: 0, partial_data: 1, need_investigation: 2 };
    anomalies.sort((a, b) => order[a.anomaly_category] - order[b.anomaly_category]);

    return json({
      anomalies,
      counts: {
        no_data: anomalies.filter((a) => a.anomaly_category === 'no_data').length,
        partial_data: anomalies.filter((a) => a.anomaly_category === 'partial_data').length,
        need_investigation: anomalies.filter((a) => a.anomaly_category === 'need_investigation').length,
        total: anomalies.length,
      },
      max_readings: maxReadings,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
