import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const projects = await base44.asServiceRole.entities.Project.list('-created_date', 10000);
    const projectMap = {};
    for (const p of projects) projectMap[p.id] = p;

    const dmaStats = {};
    const meterStats = {};

    const BATCH_SIZE = 5000;
    const MAX_METER_BATCHES = 40;

    await Promise.all([
      // DMA loading — use stored meter_count
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
      // Meter loading — parallel batches
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

    // Load existing ProjectStats
    const existing = await base44.asServiceRole.entities.ProjectStats.list('-created_date', 10000);
    const existingByPid = {};
    for (const s of existing) existingByPid[s.project_id] = s;

    const toCreate = [];
    const toUpdate = [];

    for (const project of projects) {
      const pid = project.id;
      const d = dmaStats[pid] || { dmaCount: 0, assignedCount: 0 };
      const stats = {
        project_id: pid,
        project_name: project.name,
        meter_total: meterStats[pid] || 0,
        meter_assigned: d.assignedCount,
        dma_count: d.dmaCount,
      };
      if (existingByPid[pid]) {
        toUpdate.push({ id: existingByPid[pid].id, ...stats });
      } else {
        toCreate.push(stats);
      }
    }

    // Delete stats for projects that no longer exist
    const toDelete = [];
    for (const s of existing) {
      if (!projectMap[s.project_id]) toDelete.push(s.id);
    }

    if (toCreate.length > 0) {
      await base44.asServiceRole.entities.ProjectStats.bulkCreate(toCreate);
    }
    if (toUpdate.length > 0) {
      await base44.asServiceRole.entities.ProjectStats.bulkUpdate(toUpdate);
    }
    for (const id of toDelete) {
      await base44.asServiceRole.entities.ProjectStats.delete(id).catch(() => {});
    }

    return Response.json({
      success: true,
      created: toCreate.length,
      updated: toUpdate.length,
      deleted: toDelete.length,
      totalProjects: projects.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});