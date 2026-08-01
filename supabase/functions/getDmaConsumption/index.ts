// Replaces base44/functions/getDmaConsumption/entry.ts.
// The point-in-polygon + aggregation logic is portable as-is (plain math);
// only the data access changed from base44.asServiceRole to direct Postgres.
import { admin, getCallerUser, hasProjectAccess, json, CORS_HEADERS } from '../_shared/authz.ts';

function pointInPolygon(lat: number, lng: number, polygon: [number, number][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lati, lngi] = polygon[i];
    const [latj, lngj] = polygon[j];
    const intersect =
      lati > lat !== latj > lat && lng < ((lngj - lngi) * (lat - lati)) / (latj - lati) + lngi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function aggregateByDate(readings: any[]) {
  const byKey: Record<string, any> = {};
  for (const r of readings) {
    // Group on the timestamp so an hourly series stays hourly; falling back to
    // the date would fold a day's 24 readings into one point.
    const key = r.reading_at || r.reading_date || r.period_label || 'unknown';
    if (!byKey[key]) byKey[key] = { reading_at: r.reading_at, reading_date: r.reading_date, period_label: r.period_label, consumption: 0, count: 0 };
    byKey[key].consumption += r.consumption || 0;
    byKey[key].count += 1;
  }
  return Object.values(byKey).sort((a: any, b: any) => {
    const da = new Date(a.reading_at || a.reading_date || 0).getTime();
    const db = new Date(b.reading_at || b.reading_date || 0).getTime();
    return da - db;
  });
}

async function fetchAllReadingsForMeters(meterIds: string[]) {
  const allReadings: any[] = [];
  const chunkSize = 100;
  for (let i = 0; i < meterIds.length; i += chunkSize) {
    const chunk = meterIds.slice(i, i + chunkSize);
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: batch } = await admin
        .from('consumption_reading')
        .select('*')
        .in('meter_id', chunk)
        .order('id')
        .range(from, from + 4999);
      allReadings.push(...(batch || []));
      hasMore = (batch?.length || 0) === 5000;
      from += 5000;
    }
  }
  return allReadings;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { project_id, polygon, main_meter_id } = await req.json();
    if (!project_id || !polygon || polygon.length < 3) {
      return json({ error: 'project_id and polygon (>=3 points) are required' }, 400);
    }

    const user = await getCallerUser(req);
    if (!(await hasProjectAccess(user, project_id))) return json({ error: 'Unauthorized' }, 403);

    const allMeters: any[] = [];
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: batch } = await admin
        .from('meter')
        .select('id, latitude, longitude')
        .eq('project_id', project_id)
        .eq('is_main', false)
        .order('id')
        .range(from, from + 4999);
      allMeters.push(...(batch || []));
      hasMore = (batch?.length || 0) === 5000;
      from += 5000;
    }

    const metersInDma = allMeters.filter(
      (m) => m.latitude != null && m.longitude != null && pointInPolygon(m.latitude, m.longitude, polygon)
    );
    const meterIds = metersInDma.map((m) => m.id);

    const allReadings = await fetchAllReadingsForMeters(meterIds);
    const aggregated = aggregateByDate(allReadings);

    let mainMeterReadings: any[] = [];
    let mainMeterUid: string | null = null;
    if (main_meter_id) {
      const { data: mainMeter } = await admin.from('meter').select('uid').eq('id', main_meter_id).single();
      if (mainMeter) {
        mainMeterUid = mainMeter.uid;
        const mainReadings = await fetchAllReadingsForMeters([main_meter_id]);
        mainMeterReadings = aggregateByDate(mainReadings);
      }
    }

    return json({
      readings: aggregated,
      main_meter_readings: mainMeterReadings,
      main_meter_uid: mainMeterUid,
      count: allReadings.length,
      meter_count: metersInDma.length,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
