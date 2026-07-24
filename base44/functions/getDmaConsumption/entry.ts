import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lati, lngi] = polygon[i];
    const [latj, lngj] = polygon[j];
    const intersect =
      (lati > lat) !== (latj > lat) &&
      lng < ((lngj - lngi) * (lat - lati)) / (latj - lati) + lngi;
    if (intersect) inside = !inside;
  }
  return inside;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { project_id, polygon, main_meter_id } = await req.json();
    if (!project_id || !polygon || polygon.length < 3) {
      return Response.json({ error: 'project_id and polygon (>=3 points) are required' }, { status: 400 });
    }

    // Fetch all sub-meters for the project
    const allMeters = [];
    let lastId = null;
    let hasMore = true;
    while (hasMore) {
      const query = lastId
        ? { project_id, is_main: false, _id: { $gt: lastId } }
        : { project_id, is_main: false };
      const batch = await base44.asServiceRole.entities.Meter.filter(query, '_id', 5000);
      allMeters.push(...batch);
      hasMore = batch.length === 5000;
      if (batch.length > 0) lastId = batch[batch.length - 1].id;
    }

    // Filter meters inside the polygon
    const metersInDma = allMeters.filter(
      (m) =>
        m.latitude != null &&
        m.longitude != null &&
        pointInPolygon(m.latitude, m.longitude, polygon)
    );

    const meterIds = new Set(metersInDma.map((m) => m.id));

    // Fetch consumption readings for all matched meters — paginate by meter_id batches
    const allReadings = [];
    const meterIdArray = [...meterIds];
    const chunkSize = 100;
    for (let i = 0; i < meterIdArray.length; i += chunkSize) {
      const chunk = meterIdArray.slice(i, i + chunkSize);
      let batchHasMore = true;
      let batchLastId = null;
      while (batchHasMore) {
        const query =
          batchLastId != null
            ? { meter_id: { $in: chunk }, _id: { $gt: batchLastId } }
            : { meter_id: { $in: chunk } };
        const batch = await base44.asServiceRole.entities.ConsumptionReading.filter(
          query,
          '_id',
          5000
        );
        allReadings.push(...batch);
        batchHasMore = batch.length === 5000;
        if (batch.length > 0) batchLastId = batch[batch.length - 1].id;
      }
    }

    // Aggregate by reading_date (fallback to period_label)
    const byKey = {};
    for (const r of allReadings) {
      const key = r.reading_date || r.period_label || 'unknown';
      if (!byKey[key]) byKey[key] = { reading_date: r.reading_date, period_label: r.period_label, consumption: 0, count: 0 };
      byKey[key].consumption += r.consumption || 0;
      byKey[key].count += 1;
    }

    const aggregated = Object.values(byKey).sort((a, b) => {
      const da = a.reading_date ? new Date(a.reading_date).getTime() : 0;
      const db = b.reading_date ? new Date(b.reading_date).getTime() : 0;
      return da - db;
    });

    // Fetch main meter readings if a main meter is linked to this DMA
    let mainMeterReadings = [];
    let mainMeterUid = null;
    if (main_meter_id) {
      try {
        const mainMeter = await base44.asServiceRole.entities.Meter.get(main_meter_id);
        if (mainMeter) {
          mainMeterUid = mainMeter.uid;
          const mainReadings = [];
          let mainLastId = null;
          let mainHasMore = true;
          while (mainHasMore) {
            const query = mainLastId
              ? { meter_id: main_meter_id, _id: { $gt: mainLastId } }
              : { meter_id: main_meter_id };
            const batch = await base44.asServiceRole.entities.ConsumptionReading.filter(
              query,
              '_id',
              5000
            );
            mainReadings.push(...batch);
            mainHasMore = batch.length === 5000;
            if (batch.length > 0) mainLastId = batch[batch.length - 1].id;
          }

          const mainByKey = {};
          for (const r of mainReadings) {
            const key = r.reading_date || r.period_label || 'unknown';
            if (!mainByKey[key]) mainByKey[key] = { reading_date: r.reading_date, period_label: r.period_label, consumption: 0, count: 0 };
            mainByKey[key].consumption += r.consumption || 0;
            mainByKey[key].count += 1;
          }
          mainMeterReadings = Object.values(mainByKey).sort((a, b) => {
            const da = a.reading_date ? new Date(a.reading_date).getTime() : 0;
            const db = b.reading_date ? new Date(b.reading_date).getTime() : 0;
            return da - db;
          });
        }
      } catch {
        // Main meter fetch failed — continue without it
      }
    }

    return Response.json({
      readings: aggregated,
      main_meter_readings: mainMeterReadings,
      main_meter_uid: mainMeterUid,
      count: allReadings.length,
      meter_count: metersInDma.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});