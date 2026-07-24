import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function pad(n: number): string { return String(n).padStart(2, '0'); }

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateSafe(s: any): Date | null {
  if (!s) return null;
  const str = String(s).trim();
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    let d = new Date(+m[3], +m[2] - 1, +m[1]);
    if (!isNaN(d.getTime())) return d;
    d = new Date(+m[3], +m[1] - 1, +m[2]);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function getReadingDate(r: any): Date | null {
  if (r.reading_date) {
    const d = parseDateSafe(r.reading_date);
    if (d) return d;
  }
  if (r.period_label) return parseDateSafe(r.period_label);
  return null;
}

function pointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
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

async function fetchAllMeters(base44: any, projectId: string) {
  const all: any[] = [];
  let skip = 0;
  while (true) {
    const batch = await base44.asServiceRole.entities.Meter.filter(
      { project_id: projectId },
      'id',
      5000,
      skip
    );
    all.push(...batch);
    if (batch.length < 5000) break;
    skip += batch.length;
  }
  return all;
}

async function fetchReadingsForMeters(base44: any, meterIds: string[]) {
  const readings: any[] = [];
  if (meterIds.length === 0) return readings;
  const chunkSize = 100;
  for (let i = 0; i < meterIds.length; i += chunkSize) {
    const chunk = meterIds.slice(i, i + chunkSize);
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.ConsumptionReading.filter(
        { meter_id: { $in: chunk } },
        'id',
        5000,
        skip
      );
      readings.push(...batch);
      if (batch.length < 5000) break;
      skip += batch.length;
    }
  }
  return readings;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null);

    const { meter_id, project_id, missing_dates, radius_yards, weight_dma, weight_nearby, weight_same_day } = await req.json();

    if (!meter_id || !missing_dates || !Array.isArray(missing_dates)) {
      return Response.json({ error: 'meter_id and missing_dates are required' }, { status: 400 });
    }
    if (missing_dates.length === 0) {
      return Response.json({ results: [], spread_adjustments: {}, spread_patterns: [] });
    }

    const radius = radius_yards || 500;
    const wDma = weight_dma != null ? Number(weight_dma) : 33;
    const wNearby = weight_nearby != null ? Number(weight_nearby) : 33;
    const wSameDay = weight_same_day != null ? Number(weight_same_day) : 33;

    const meter = await base44.asServiceRole.entities.Meter.get(meter_id);
    if (!meter) return Response.json({ error: 'Meter not found' }, { status: 404 });
    const pid = project_id || meter.project_id;

    const dmas = await base44.asServiceRole.entities.Dma.filter({ project_id: pid });
    let containingDma: any = null;
    let dmaPolygon: number[][] | null = null;
    if (meter.latitude != null && meter.longitude != null) {
      for (const dma of dmas) {
        if (dma.main_meter_id === meter.id) {
          containingDma = dma;
          if (dma.polygon) { try { dmaPolygon = JSON.parse(dma.polygon); } catch {} }
          break;
        }
        if (dma.polygon) {
          let poly: any;
          try { poly = JSON.parse(dma.polygon); } catch { continue; }
          if (Array.isArray(poly) && poly.length >= 3 && pointInPolygon(meter.latitude, meter.longitude, poly)) {
            containingDma = dma;
            dmaPolygon = poly;
            break;
          }
        }
      }
    }

    const allMeters = await fetchAllMeters(base44, pid);

    const dmaMeterIds: string[] = [];
    const nearbyMeterIds: string[] = [];
    const radiusMeters = radius * 0.9144;

    if (meter.latitude != null && meter.longitude != null) {
      const latDeg = radiusMeters / 111320;
      const lngDeg = radiusMeters / (111320 * Math.cos(meter.latitude * Math.PI / 180));

      for (const m of allMeters) {
        if (m.id === meter.id) continue;
        if (m.latitude == null || m.longitude == null) continue;

        if (containingDma && dmaPolygon && dmaPolygon.length >= 3) {
          if (containingDma.main_meter_id === m.id || pointInPolygon(m.latitude, m.longitude, dmaPolygon)) {
            dmaMeterIds.push(m.id);
          }
        }

        const latDiff = (m.latitude - meter.latitude) / latDeg;
        const lngDiff = (m.longitude - meter.longitude) / lngDeg;
        if (latDiff * latDiff + lngDiff * lngDiff <= 1) {
          nearbyMeterIds.push(m.id);
        }
      }
    }

    const [targetReadings, dmaReadings, nearbyReadings] = await Promise.all([
      fetchReadingsForMeters(base44, [meter_id]),
      dmaMeterIds.length > 0 ? fetchReadingsForMeters(base44, dmaMeterIds) : Promise.resolve([]),
      nearbyMeterIds.length > 0 ? fetchReadingsForMeters(base44, nearbyMeterIds) : Promise.resolve([]),
    ]);

    const targetByDate: Record<string, number[]> = {};
    for (const r of targetReadings) {
      const d = getReadingDate(r);
      if (!d) continue;
      const key = dateKey(d);
      if (!targetByDate[key]) targetByDate[key] = [];
      targetByDate[key].push(r.consumption || 0);
    }

    const dmaByDate: Record<string, { total: number; count: number }> = {};
    for (const r of dmaReadings) {
      const d = getReadingDate(r);
      if (!d) continue;
      const key = dateKey(d);
      if (!dmaByDate[key]) dmaByDate[key] = { total: 0, count: 0 };
      dmaByDate[key].total += r.consumption || 0;
      dmaByDate[key].count += 1;
    }

    const nearbyByDate: Record<string, { total: number; count: number }> = {};
    for (const r of nearbyReadings) {
      const d = getReadingDate(r);
      if (!d) continue;
      const key = dateKey(d);
      if (!nearbyByDate[key]) nearbyByDate[key] = { total: 0, count: 0 };
      nearbyByDate[key].total += r.consumption || 0;
      nearbyByDate[key].count += 1;
    }

    const missingDateSet = new Set(missing_dates);

    const readingDates = Object.keys(targetByDate).sort();
    const readingValues = readingDates.map(d => {
      const vals = targetByDate[d];
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    });

    const nonZeroVals = readingValues.filter(v => v > 0).sort((a, b) => a - b);
    const medianNonZero = nonZeroVals.length >= 3
      ? nonZeroVals[Math.floor(nonZeroVals.length / 2)]
      : 0;
    const highThreshold = medianNonZero > 0 ? medianNonZero * 3 : 0;

    const spreadAdjustments: Record<string, number> = {};
    const spreadDetailsMap: Record<string, any> = {};
    const spreadPatterns: any[] = [];

    for (let i = 0; i < readingDates.length; i++) {
      const readingDate = readingDates[i];
      const readingVal = readingValues[i];
      if (readingVal <= 0) continue;

      const gapDates: string[] = [];
      const cursor = new Date(readingDate);
      cursor.setDate(cursor.getDate() - 1);
      while (missingDateSet.has(dateKey(cursor))) {
        gapDates.unshift(dateKey(cursor));
        cursor.setDate(cursor.getDate() - 1);
      }

      if (gapDates.length === 0) continue;

      const isAccumulated = highThreshold > 0
        ? readingVal >= highThreshold
        : gapDates.length >= 2;

      if (!isAccumulated) continue;

      const spreadCount = gapDates.length + 1;
      const spreadValue = readingVal / spreadCount;

      const pattern = {
        high_reading: +readingVal.toFixed(2),
        high_reading_date: readingDate,
        zero_missing_count: gapDates.length,
        spread_value: +spreadValue.toFixed(2),
        formula: `${readingVal.toFixed(2)} / ${spreadCount} = ${spreadValue.toFixed(2)}`,
        affected_dates: [...gapDates, readingDate],
      };
      spreadPatterns.push(pattern);

      for (const d of gapDates) {
        spreadAdjustments[d] = +spreadValue.toFixed(2);
        spreadDetailsMap[d] = pattern;
      }
      spreadAdjustments[readingDate] = +spreadValue.toFixed(2);
      spreadDetailsMap[readingDate] = pattern;
    }

    const results: any[] = [];
    for (const dateStr of missing_dates) {
      const missingDate = parseDateSafe(dateStr);
      if (!missingDate) {
        results.push({ date: dateStr, final: null, source: 'none', components_used: 0 });
        continue;
      }

      const origReadings = targetByDate[dateStr];
      const isMissingDay = !origReadings || origReadings.length === 0;
      const origVal = !isMissingDay ? origReadings.reduce((a, b) => a + b, 0) / origReadings.length : null;

      if (spreadAdjustments[dateStr] != null) {
        results.push({
          date: dateStr,
          original_value: origVal != null ? +origVal.toFixed(2) : null,
          is_missing: isMissingDay,
          final: spreadAdjustments[dateStr],
          source: 'spread',
          spread_detail: spreadDetailsMap[dateStr],
          components_used: 1,
        });
        continue;
      }

      let dmaAvg: number | null = null;
      let dmaDetail: any = null;
      if (dmaMeterIds.length > 0) {
        const data = dmaByDate[dateStr];
        if (data) {
          dmaAvg = data.total / dmaMeterIds.length;
          dmaDetail = { total: +data.total.toFixed(2), meter_count: dmaMeterIds.length, readings_found: data.count };
        }
      }

      let nearbyAvg: number | null = null;
      let nearbyDetail: any = null;
      if (nearbyMeterIds.length > 0) {
        const data = nearbyByDate[dateStr];
        if (data) {
          nearbyAvg = data.total / data.count;
          nearbyDetail = { total: +data.total.toFixed(2), meter_count: nearbyMeterIds.length, readings_found: data.count };
        }
      }

      const sameDayValues: any[] = [];
      for (const offset of [-14, -7, 7, 14]) {
        const d = new Date(missingDate);
        d.setDate(d.getDate() + offset);
        const key = dateKey(d);
        if (targetByDate[key]) {
          const avg = targetByDate[key].reduce((a, b) => a + b, 0) / targetByDate[key].length;
          sameDayValues.push({ date: key, offset, consumption: +avg.toFixed(2) });
        }
      }
      let sameDayAvg: number | null = null;
      let sameDayDetail: any = null;
      if (sameDayValues.length > 0) {
        sameDayAvg = sameDayValues.reduce((s, v) => s + v.consumption, 0) / sameDayValues.length;
        sameDayDetail = { readings: sameDayValues };
      }

      let weightedSum = 0;
      let totalWeight = 0;
      const components: any[] = [];
      if (dmaAvg != null) {
        weightedSum += dmaAvg * wDma; totalWeight += wDma;
        components.push({ name: 'DMA', value: +dmaAvg.toFixed(2), weight: wDma, weighted: +(dmaAvg * wDma).toFixed(2) });
      }
      if (nearbyAvg != null) {
        weightedSum += nearbyAvg * wNearby; totalWeight += wNearby;
        components.push({ name: 'Nearby', value: +nearbyAvg.toFixed(2), weight: wNearby, weighted: +(nearbyAvg * wNearby).toFixed(2) });
      }
      if (sameDayAvg != null) {
        weightedSum += sameDayAvg * wSameDay; totalWeight += wSameDay;
        components.push({ name: 'Same Day', value: +sameDayAvg.toFixed(2), weight: wSameDay, weighted: +(sameDayAvg * wSameDay).toFixed(2) });
      }

      const final = totalWeight > 0 ? weightedSum / totalWeight : null;
      const weightedDetail = {
        components,
        weighted_sum: +weightedSum.toFixed(2),
        total_weight: totalWeight,
        formula: totalWeight > 0 ? `${weightedSum.toFixed(2)} / ${totalWeight} = ${(weightedSum / totalWeight).toFixed(2)}` : null,
      };

      results.push({
        date: dateStr,
        original_value: origVal != null ? +origVal.toFixed(2) : null,
        is_missing: isMissingDay,
        dma_avg: dmaAvg != null ? +dmaAvg.toFixed(2) : null,
        dma_detail: dmaDetail,
        nearby_avg: nearbyAvg != null ? +nearbyAvg.toFixed(2) : null,
        nearby_detail: nearbyDetail,
        same_day_avg: sameDayAvg != null ? +sameDayAvg.toFixed(2) : null,
        same_day_detail: sameDayDetail,
        final: final != null ? +final.toFixed(2) : null,
        source: final != null ? 'weighted' : 'none',
        weighted_detail: weightedDetail,
        components_used: [dmaAvg, nearbyAvg, sameDayAvg].filter(v => v != null).length,
      });
    }

    return Response.json({
      results,
      spread_adjustments: spreadAdjustments,
      spread_patterns: spreadPatterns,
      high_threshold: highThreshold,
      median_non_zero: medianNonZero,
      dma_name: containingDma?.name || null,
      dma_meter_count: dmaMeterIds.length,
      nearby_meter_count: nearbyMeterIds.length,
      radius_yards: radius,
      weights: { dma: wDma, nearby: wNearby, same_day: wSameDay },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});