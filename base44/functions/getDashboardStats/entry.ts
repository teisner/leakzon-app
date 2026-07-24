import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const dmaStats = {};
    const meterStats = {};

    const BATCH_SIZE = 5000;
    const MAX_METER_BATCHES = 40; // up to 200K meters

    await Promise.all([
      // DMA loading — use stored meter_count field (no polygon parsing)
      (async () => {
        let skip = 0;
        let hasMore = true;
        while (hasMore) {
          const batch = await base44.asServiceRole.entities.Dma.filter({}, 'id', 50000, skip);
          for (const d of batch) {
            const pid = d.project_id;
            if (!dmaStats[pid]) dmaStats[pid] = { dmaCount: 0, assignedCount: 0 };
            dmaStats[pid].dmaCount++;
            dmaStats[pid].assignedCount += d.meter_count || 0;
          }
          hasMore = batch.length === 50000;
          skip += batch.length;
        }
      })(),
      // Meter loading — fire all batches in parallel
      (async () => {
        const batches = await Promise.all(
          Array.from({ length: MAX_METER_BATCHES }, (_, i) =>
            base44.asServiceRole.entities.Meter.filter({}, 'id', BATCH_SIZE, i * BATCH_SIZE)
              .catch(() => [])
          )
        );
        for (const batch of batches) {
          if (!Array.isArray(batch)) continue;
          for (const m of batch) {
            const pid = m.project_id;
            meterStats[pid] = (meterStats[pid] || 0) + 1;
          }
        }
      })(),
    ]);

    // Merge
    const stats = {};
    const allPids = new Set([...Object.keys(dmaStats), ...Object.keys(meterStats)]);
    for (const pid of allPids) {
      const d = dmaStats[pid] || { dmaCount: 0, assignedCount: 0 };
      stats[pid] = {
        total: meterStats[pid] || 0,
        assignedCount: d.assignedCount,
        dmaCount: d.dmaCount,
      };
    }

    return Response.json({ stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});