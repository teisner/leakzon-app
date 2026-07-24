// Replaces base44/functions/importProjectData/entry.ts — duplicates a
// project (source_project_id) or restores one from an exported JSON file
// (file_url), remapping every foreign key across ~10 entity types since IDs
// change on import. The multi-phase protocol (Phase 1: project + everything
// except readings; Phase 2: paginated reading-chunk calls) is preserved
// exactly — the frontend (ProjectDataDialog.jsx) already drives this loop
// and isn't being touched.
//
// Original had NO auth check at all: any caller could read another
// project's full data via source_project_id, or overwrite/create projects
// unauthenticated. Now: creating a new project requires Admin/Super User
// (matches the project_insert RLS policy); overwriting or reading from an
// existing project requires access to that specific project.
import { admin, getCallerUser, hasProjectAccess, isAdminOrSuper, json, CORS_HEADERS } from '../_shared/authz.ts';

const BATCH_SIZE = 500;
const CONCURRENCY = 4;
const BATCH_DELAY_MS = 200;
const READINGS_CHUNK_SIZE = 5000;
const PAGE_SIZE = 5000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function strip(row: any) {
  const { id, created_at, updated_at, ...rest } = row;
  return rest;
}

async function fetchAll(table: string, projectId: string, orderCol = 'id') {
  const all: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data: batch } = await admin.from(table).select('*').eq('project_id', projectId).order(orderCol).range(from, from + PAGE_SIZE - 1);
    all.push(...(batch || []));
    hasMore = (batch?.length || 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }
  return all;
}

async function bulkCreateWithRetry(table: string, batch: any[], maxRetries = 3): Promise<any[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { data, error } = await admin.from(table).insert(batch).select();
    if (!error) return data || [];
    if (attempt < maxRetries && /rate.?limit|429|too many/i.test(error.message || '')) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    throw new Error(error.message);
  }
  return [];
}

async function bulkCreateConcurrent(table: string, records: any[], concurrency = CONCURRENCY) {
  if (!records || records.length === 0) return [];
  const batches: any[][] = [];
  for (let i = 0; i < records.length; i += BATCH_SIZE) batches.push(records.slice(i, i + BATCH_SIZE));

  const allCreated: any[] = [];
  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map((b) => bulkCreateWithRetry(table, b)));
    for (const res of results) allCreated.push(...res);
    if (i + concurrency < batches.length) await sleep(BATCH_DELAY_MS);
  }
  return allCreated;
}

async function fetchSourceData(sourceProjectId: string) {
  const [layers, meters, dmas, importLogs, networkNodes, networkLinks, mapNotes, isolatedPoints, imageOverlays, projectProgress] = await Promise.all([
    admin.from('project_layer').select('*').eq('project_id', sourceProjectId).order('sort_order').then((r) => r.data || []),
    fetchAll('meter', sourceProjectId),
    admin.from('dma').select('*').eq('project_id', sourceProjectId).order('sort_order').then((r) => r.data || []),
    fetchAll('import_log', sourceProjectId),
    fetchAll('network_node', sourceProjectId),
    fetchAll('network_link', sourceProjectId),
    fetchAll('map_note', sourceProjectId),
    fetchAll('isolated_point', sourceProjectId),
    fetchAll('image_overlay', sourceProjectId),
    fetchAll('project_progress', sourceProjectId),
  ]);
  return {
    layers, meters, dmas,
    import_logs: importLogs, network_nodes: networkNodes, network_links: networkLinks,
    map_notes: mapNotes, isolated_points: isolatedPoints, image_overlays: imageOverlays, project_progress: projectProgress,
  };
}

async function deleteAllProjectData(targetId: string) {
  const tables = [
    'project_layer', 'meter', 'consumption_reading', 'dma', 'import_log',
    'network_node', 'network_link', 'map_note', 'isolated_point', 'image_overlay', 'project_progress',
  ];
  await Promise.all(tables.map((t) => admin.from(t).delete().eq('project_id', targetId)));
}

async function importReadingsChunk(
  readingSource: any[],
  targetId: string,
  meterIdMap: Record<string, string>,
  meterUidMap: Record<string, string>
) {
  const readingRecords: any[] = [];
  let skipped = 0;
  for (const r of readingSource) {
    const d = strip(r);
    d.project_id = targetId;
    if (d.meter_id && meterIdMap[d.meter_id]) {
      d.meter_id = meterIdMap[d.meter_id];
      readingRecords.push(d);
    } else if (d.meter_uid && meterUidMap && meterUidMap[d.meter_uid]) {
      delete d.meter_uid; // not a column in this schema — resolved to meter_id only
      d.meter_id = meterUidMap[d.meter_uid];
      readingRecords.push(d);
    } else {
      skipped++;
    }
  }
  await bulkCreateConcurrent('consumption_reading', readingRecords);
  return { imported: readingRecords.length, skipped };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const body = await req.json();
    const { file_url, source_project_id, mode, target_project_id, new_name, readings_offset, meter_id_map, meter_uid_map } = body;

    const user = await getCallerUser(req);

    // ---- Phase 2: import a chunk of consumption readings only ----
    if (readings_offset != null && readings_offset > 0) {
      if (!target_project_id) return json({ error: 'target_project_id required for readings chunk' }, 400);
      if (!(await hasProjectAccess(user, target_project_id))) return json({ error: 'Unauthorized' }, 403);
      if (source_project_id && !(await hasProjectAccess(user, source_project_id))) return json({ error: 'Unauthorized' }, 403);

      const midMap = meter_id_map || {};
      const uidMap = meter_uid_map || {};

      let readingSource: any[];
      if (source_project_id) {
        const { data } = await admin
          .from('consumption_reading')
          .select('*')
          .eq('project_id', source_project_id)
          .order('id')
          .range(readings_offset, readings_offset + READINGS_CHUNK_SIZE - 1);
        readingSource = data || [];
      } else if (file_url) {
        const response = await fetch(file_url);
        const data = await response.json();
        readingSource = (data.consumption_readings || []).slice(readings_offset, readings_offset + READINGS_CHUNK_SIZE);
      } else {
        return json({ error: 'source_project_id or file_url required' }, 400);
      }

      const { imported, skipped } = await importReadingsChunk(readingSource, target_project_id, midMap, uidMap);
      return json({
        success: true,
        phase: 2,
        readings_imported: imported,
        readings_skipped: skipped,
        has_more: readingSource.length === READINGS_CHUNK_SIZE,
      });
    }

    // ---- Phase 1: create project + all non-reading entities + first readings chunk ----
    if (!mode || !['overwrite', 'new'].includes(mode)) {
      return json({ error: 'mode must be "overwrite" or "new"' }, 400);
    }

    if (source_project_id && !(await hasProjectAccess(user, source_project_id))) {
      return json({ error: 'Unauthorized' }, 403);
    }

    let data: any;
    if (source_project_id) {
      const { data: project } = await admin.from('project').select('*').eq('id', source_project_id).single();
      if (!project) return json({ error: 'Source project not found' }, 404);
      data = { project, ...(await fetchSourceData(source_project_id)) };
    } else if (file_url) {
      const response = await fetch(file_url);
      data = await response.json();
    } else {
      return json({ error: 'Either file_url or source_project_id is required' }, 400);
    }

    if (!data || !data.project) return json({ error: 'Invalid export file: missing project data' }, 400);

    let targetId: string;
    if (mode === 'new') {
      if (!isAdminOrSuper(user)) return json({ error: 'Unauthorized' }, 403);
      const projData = strip(data.project);
      projData.name = new_name || `${projData.name} (Copy)`;
      projData.onboarding_complete = false;
      projData.anomaly_reports_exported = false;
      const { data: newProject, error } = await admin.from('project').insert(projData).select().single();
      if (error) throw error;
      targetId = newProject.id;
    } else {
      if (!target_project_id) return json({ error: 'target_project_id required for overwrite mode' }, 400);
      if (!(await hasProjectAccess(user, target_project_id))) return json({ error: 'Unauthorized' }, 403);
      targetId = target_project_id;
      await deleteAllProjectData(targetId);
    }

    const skipped = { readings: 0, network_links: 0, isolated_points: 0 };

    // Layers (sequential — need ID map for meters, isolated points)
    const layerIdMap: Record<string, string> = {};
    const layerSource = data.layers || [];
    for (const layer of layerSource) {
      const oldId = layer.id;
      const layerData = { ...strip(layer), project_id: targetId };
      const { data: newLayer, error } = await admin.from('project_layer').insert(layerData).select().single();
      if (error) throw error;
      if (oldId) layerIdMap[oldId] = newLayer.id;
    }

    // Meters (concurrent batches)
    const meterIdMap: Record<string, string> = {};
    const meterUidMap: Record<string, string> = {};
    const meterSource = data.meters || [];
    const meterRecords = meterSource.map((m: any) => {
      const d = strip(m);
      d.project_id = targetId;
      d.layer_id = d.layer_id && layerIdMap[d.layer_id] ? layerIdMap[d.layer_id] : null;
      d.dma_id = null; // resolved after DMAs are created below
      return d;
    });
    const createdMeters = await bulkCreateConcurrent('meter', meterRecords);
    meterSource.forEach((m: any, i: number) => {
      if (createdMeters[i] && m.id) {
        meterIdMap[m.id] = createdMeters[i].id;
        if (m.uid) meterUidMap[m.uid] = createdMeters[i].id;
      }
    });

    // DMAs (concurrent batches — need meter ID map for main_meter_id)
    const dmaIdMap: Record<string, string> = {};
    const dmaSource = data.dmas || [];
    const dmaRecords = dmaSource.map((d: any) => {
      const dd = strip(d);
      dd.project_id = targetId;
      dd.main_meter_id = dd.main_meter_id && meterIdMap[dd.main_meter_id] ? meterIdMap[dd.main_meter_id] : null;
      if (dd.polygon && !dd.polygon_json) {
        try {
          dd.polygon_json = typeof dd.polygon === 'string' ? JSON.parse(dd.polygon) : dd.polygon;
        } catch {
          dd.polygon_json = [];
        }
      }
      delete dd.polygon;
      delete dd.meter_count;
      return dd;
    });
    const createdDmas = await bulkCreateConcurrent('dma', dmaRecords);
    dmaSource.forEach((d: any, i: number) => {
      if (createdDmas[i] && d.id) dmaIdMap[d.id] = createdDmas[i].id;
    });

    // Backfill meter.dma_id now that DMAs exist, using the original (pre-strip) dma_id on source meters
    const meterDmaUpdates = meterSource
      .map((m: any) => ({ newMeterId: meterIdMap[m.id], newDmaId: m.dma_id ? dmaIdMap[m.dma_id] : null }))
      .filter((x: any) => x.newMeterId && x.newDmaId);
    await Promise.all(meterDmaUpdates.map((u: any) => admin.from('meter').update({ dma_id: u.newDmaId }).eq('id', u.newMeterId)));

    // Network nodes (need DMA ID map)
    const nodeIdMap: Record<string, string> = {};
    const nodeSource = data.network_nodes || [];
    const nodeRecords = nodeSource.map((n: any) => {
      const d = strip(n);
      d.project_id = targetId;
      d.dma_id = d.dma_id && dmaIdMap[d.dma_id] ? dmaIdMap[d.dma_id] : null;
      return d;
    });
    const createdNodes = await bulkCreateConcurrent('network_node', nodeRecords);
    nodeSource.forEach((n: any, i: number) => {
      if (createdNodes[i] && n.id) nodeIdMap[n.id] = createdNodes[i].id;
    });

    // Network links (skip if node IDs can't be mapped)
    const linkSource = data.network_links || [];
    const linkRecords: any[] = [];
    for (const l of linkSource) {
      const d = strip(l);
      d.project_id = targetId;
      const fromMapped = d.from_node_id && nodeIdMap[d.from_node_id];
      const toMapped = d.to_node_id && nodeIdMap[d.to_node_id];
      if (fromMapped && toMapped) {
        d.from_node_id = nodeIdMap[d.from_node_id];
        d.to_node_id = nodeIdMap[d.to_node_id];
        linkRecords.push(d);
      } else {
        skipped.network_links++;
      }
    }
    await bulkCreateConcurrent('network_link', linkRecords);

    // Isolated points (skip if layer or DMA IDs can't be mapped)
    const isolatedSource = data.isolated_points || [];
    const isolatedRecords: any[] = [];
    for (const ip of isolatedSource) {
      const d = strip(ip);
      d.project_id = targetId;
      const layerMapped = d.layer_id && layerIdMap[d.layer_id];
      const dma1Mapped = d.dma1_id && dmaIdMap[d.dma1_id];
      const dma2Mapped = d.dma2_id && dmaIdMap[d.dma2_id];
      if (layerMapped && dma1Mapped && dma2Mapped) {
        d.layer_id = layerIdMap[d.layer_id];
        d.dma1_id = dmaIdMap[d.dma1_id];
        d.dma2_id = dmaIdMap[d.dma2_id];
        isolatedRecords.push(d);
      } else {
        skipped.isolated_points++;
      }
    }
    await bulkCreateConcurrent('isolated_point', isolatedRecords);

    // Map notes, image overlays, project progress, import logs
    const noteSource = data.map_notes || [];
    await bulkCreateConcurrent('map_note', noteSource.map((n: any) => ({ ...strip(n), project_id: targetId })));

    const overlaySource = data.image_overlays || [];
    await bulkCreateConcurrent('image_overlay', overlaySource.map((o: any) => ({ ...strip(o), project_id: targetId })));

    const progressSource = data.project_progress || [];
    await bulkCreateConcurrent('project_progress', progressSource.map((p: any) => ({ ...strip(p), project_id: targetId })));

    const logSource = data.import_logs || [];
    await bulkCreateConcurrent('import_log', logSource.map((l: any) => ({ ...strip(l), project_id: targetId })));

    // First chunk of consumption readings
    let firstReadingSource: any[];
    if (source_project_id) {
      const { data: readings } = await admin
        .from('consumption_reading')
        .select('*')
        .eq('project_id', source_project_id)
        .order('id')
        .range(0, READINGS_CHUNK_SIZE - 1);
      firstReadingSource = readings || [];
    } else {
      firstReadingSource = (data.consumption_readings || []).slice(0, READINGS_CHUNK_SIZE);
    }
    const { imported: firstReadingsImported, skipped: readingsSkipped } = await importReadingsChunk(
      firstReadingSource, targetId, meterIdMap, meterUidMap
    );
    skipped.readings = readingsSkipped;
    const hasMoreReadings = firstReadingSource.length === READINGS_CHUNK_SIZE;

    return json({
      success: true,
      phase: 1,
      project_id: targetId,
      target_project_id: targetId,
      meter_id_map: meterIdMap,
      meter_uid_map: meterUidMap,
      has_more_readings: hasMoreReadings,
      stats: {
        layers: layerSource.length,
        meters: meterSource.length,
        readings: firstReadingsImported,
        dmas: dmaSource.length,
        network_nodes: nodeSource.length,
        network_links: linkRecords.length,
        isolated_points: isolatedRecords.length,
        map_notes: noteSource.length,
        image_overlays: overlaySource.length,
        project_progress: progressSource.length,
        import_logs: logSource.length,
      },
      skipped,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
