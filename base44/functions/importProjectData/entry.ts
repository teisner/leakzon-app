import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const PAGE_SIZE = 5000;
const BATCH_SIZE = 500;
const CONCURRENCY = 4;
const BATCH_DELAY_MS = 200;
const READINGS_CHUNK_SIZE = 5000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchAll(base44, entityName, query, sort = 'id') {
  const all = [];
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    const batch = await base44.asServiceRole.entities[entityName].filter(query, sort, PAGE_SIZE, skip);
    all.push(...batch);
    hasMore = batch.length === PAGE_SIZE;
    skip += batch.length;
  }
  return all;
}

function strip({ id, created_date, updated_date, created_by_id, ...rest }) {
  return rest;
}

async function bulkCreateWithRetry(base44, entityName, batch, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await base44.asServiceRole.entities[entityName].bulkCreate(batch);
    } catch (err) {
      if (attempt < maxRetries && /rate.?limit|429|too many/i.test(err.message || '')) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

async function bulkCreateConcurrent(base44, entityName, records, concurrency = CONCURRENCY) {
  if (!records || records.length === 0) return [];
  const batches = [];
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    batches.push(records.slice(i, i + BATCH_SIZE));
  }
  const allCreated = [];
  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(b => bulkCreateWithRetry(base44, entityName, b)));
    for (const res of results) {
      if (Array.isArray(res)) allCreated.push(...res);
      else if (res && Array.isArray(res.data)) allCreated.push(...res.data);
      else if (res) allCreated.push(res);
    }
    if (i + concurrency < batches.length) await sleep(BATCH_DELAY_MS);
  }
  return allCreated;
}

// Fetch all project-specific entities EXCEPT consumption readings (streamed separately)
async function fetchSourceData(base44, sourceProjectId) {
  const [layers, meters, dmas, importLogs, networkNodes, networkLinks, mapNotes, isolatedPoints, imageOverlays, projectProgress] = await Promise.all([
    base44.asServiceRole.entities.ProjectLayer.filter({ project_id: sourceProjectId }, 'sort_order'),
    fetchAll(base44, 'Meter', { project_id: sourceProjectId }),
    base44.asServiceRole.entities.Dma.filter({ project_id: sourceProjectId }, 'sort_order'),
    fetchAll(base44, 'ImportLog', { project_id: sourceProjectId }),
    fetchAll(base44, 'NetworkNode', { project_id: sourceProjectId }),
    fetchAll(base44, 'NetworkLink', { project_id: sourceProjectId }),
    fetchAll(base44, 'MapNote', { project_id: sourceProjectId }),
    fetchAll(base44, 'IsolatedPoint', { project_id: sourceProjectId }),
    fetchAll(base44, 'ImageOverlay', { project_id: sourceProjectId }),
    fetchAll(base44, 'ProjectProgress', { project_id: sourceProjectId }),
  ]);
  return { layers, meters, dmas, import_logs: importLogs, network_nodes: networkNodes, network_links: networkLinks, map_notes: mapNotes, isolated_points: isolatedPoints, image_overlays: imageOverlays, project_progress: projectProgress };
}

// Delete all project-specific entities (used in overwrite mode)
async function deleteAllProjectData(base44, targetId) {
  await Promise.all([
    base44.asServiceRole.entities.ProjectLayer.deleteMany({ project_id: targetId }),
    base44.asServiceRole.entities.Meter.deleteMany({ project_id: targetId }),
    base44.asServiceRole.entities.ConsumptionReading.deleteMany({ project_id: targetId }),
    base44.asServiceRole.entities.Dma.deleteMany({ project_id: targetId }),
    base44.asServiceRole.entities.ImportLog.deleteMany({ project_id: targetId }),
    base44.asServiceRole.entities.NetworkNode.deleteMany({ project_id: targetId }),
    base44.asServiceRole.entities.NetworkLink.deleteMany({ project_id: targetId }),
    base44.asServiceRole.entities.MapNote.deleteMany({ project_id: targetId }),
    base44.asServiceRole.entities.IsolatedPoint.deleteMany({ project_id: targetId }),
    base44.asServiceRole.entities.ImageOverlay.deleteMany({ project_id: targetId }),
    base44.asServiceRole.entities.ProjectProgress.deleteMany({ project_id: targetId }),
  ]);
}

// Map and create a chunk of consumption readings using meter ID and UID maps
async function importReadingsChunk(base44, readingSource, targetId, meterIdMap, meterUidMap) {
  const readingRecords = [];
  let skipped = 0;
  for (const r of readingSource) {
    const d = strip(r);
    d.project_id = targetId;
    // Try matching by meter_id first, then by meter_uid (for orphaned readings where meter was re-imported)
    if (d.meter_id && meterIdMap[d.meter_id]) {
      d.meter_id = meterIdMap[d.meter_id];
      readingRecords.push(d);
    } else if (d.meter_uid && meterUidMap && meterUidMap[d.meter_uid]) {
      d.meter_id = meterUidMap[d.meter_uid];
      readingRecords.push(d);
    } else {
      skipped++;
    }
  }
  await bulkCreateConcurrent(base44, 'ConsumptionReading', readingRecords);
  return { imported: readingRecords.length, skipped };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { file_url, source_project_id, mode, target_project_id, new_name, readings_offset, meter_id_map, meter_uid_map } = body;

    // ---- Phase 2: Import a chunk of consumption readings only ----
    if (readings_offset != null && readings_offset > 0) {
      if (!target_project_id) return Response.json({ error: 'target_project_id required for readings chunk' }, { status: 400 });
      const midMap = meter_id_map || {};
      const uidMap = meter_uid_map || {};

      let readingSource;
      if (source_project_id) {
        readingSource = await base44.asServiceRole.entities.ConsumptionReading.filter(
          { project_id: source_project_id }, 'id', READINGS_CHUNK_SIZE, readings_offset
        );
      } else if (file_url) {
        const response = await fetch(file_url);
        const data = await response.json();
        readingSource = (data.consumption_readings || []).slice(readings_offset, readings_offset + READINGS_CHUNK_SIZE);
      } else {
        return Response.json({ error: 'source_project_id or file_url required' }, { status: 400 });
      }

      const { imported, skipped } = await importReadingsChunk(base44, readingSource, target_project_id, midMap, uidMap);

      return Response.json({
        success: true,
        phase: 2,
        readings_imported: imported,
        readings_skipped: skipped,
        has_more: readingSource.length === READINGS_CHUNK_SIZE,
      });
    }

    // ---- Phase 1: Create project + all non-reading entities + first readings chunk ----
    if (!mode || !['overwrite', 'new'].includes(mode)) {
      return Response.json({ error: 'mode must be "overwrite" or "new"' }, { status: 400 });
    }

    let data;
    if (source_project_id) {
      const project = await base44.asServiceRole.entities.Project.get(source_project_id);
      if (!project) return Response.json({ error: 'Source project not found' }, { status: 404 });
      data = { project, ...(await fetchSourceData(base44, source_project_id)) };
    } else if (file_url) {
      const response = await fetch(file_url);
      data = await response.json();
    } else {
      return Response.json({ error: 'Either file_url or source_project_id is required' }, { status: 400 });
    }

    if (!data || !data.project) {
      return Response.json({ error: 'Invalid export file: missing project data' }, { status: 400 });
    }

    // Determine target project
    let targetId;
    if (mode === 'new') {
      const projData = strip(data.project);
      projData.name = new_name || `${projData.name} (Copy)`;
      projData.onboarding_complete = false;
      projData.anomaly_reports_exported = false;
      const newProject = await base44.asServiceRole.entities.Project.create(projData);
      targetId = newProject.id;
    } else {
      if (!target_project_id) return Response.json({ error: 'target_project_id required for overwrite mode' }, { status: 400 });
      targetId = target_project_id;
      await deleteAllProjectData(base44, targetId);
    }

    let skipped = { readings: 0, network_links: 0, isolated_points: 0 };

    // Create layers (sequential — need ID map for meters, isolated points)
    const layerIdMap = {};
    const layerSource = data.layers || [];
    for (const layer of layerSource) {
      const oldId = layer.id;
      const layerData = { ...strip(layer), project_id: targetId };
      const newLayer = await base44.asServiceRole.entities.ProjectLayer.create(layerData);
      if (oldId) layerIdMap[oldId] = newLayer.id;
    }

    // Create meters (concurrent batches — need ID map for DMAs & readings, UID map for orphaned readings)
    const meterIdMap = {};
    const meterUidMap = {};
    const meterSource = data.meters || [];
    const meterRecords = meterSource.map(m => {
      const d = strip(m);
      d.project_id = targetId;
      if (d.layer_id && layerIdMap[d.layer_id]) d.layer_id = layerIdMap[d.layer_id];
      else d.layer_id = undefined;
      return d;
    });
    const createdMeters = await bulkCreateConcurrent(base44, 'Meter', meterRecords);
    let meterIdx = 0;
    for (const m of meterSource) {
      if (createdMeters[meterIdx] && m.id) {
        meterIdMap[m.id] = createdMeters[meterIdx].id;
        if (m.uid) meterUidMap[m.uid] = createdMeters[meterIdx].id;
      }
      meterIdx++;
    }

    // Create DMAs (concurrent batches — need ID map for network nodes, isolated points)
    const dmaIdMap = {};
    const dmaSource = data.dmas || [];
    const dmaRecords = dmaSource.map(d => {
      const dd = strip(d);
      dd.project_id = targetId;
      if (dd.main_meter_id && meterIdMap[dd.main_meter_id]) dd.main_meter_id = meterIdMap[dd.main_meter_id];
      else dd.main_meter_id = undefined;
      return dd;
    });
    const createdDmas = await bulkCreateConcurrent(base44, 'Dma', dmaRecords);
    let dmaIdx = 0;
    for (const d of dmaSource) {
      if (createdDmas[dmaIdx] && d.id) {
        dmaIdMap[d.id] = createdDmas[dmaIdx].id;
      }
      dmaIdx++;
    }

    // Create network nodes (need DMA ID map)
    const nodeIdMap = {};
    const nodeSource = data.network_nodes || [];
    const nodeRecords = nodeSource.map(n => {
      const d = strip(n);
      d.project_id = targetId;
      if (d.dma_id && dmaIdMap[d.dma_id]) d.dma_id = dmaIdMap[d.dma_id];
      else if (d.dma_id) d.dma_id = undefined;
      return d;
    });
    const createdNodes = await bulkCreateConcurrent(base44, 'NetworkNode', nodeRecords);
    let nodeIdx = 0;
    for (const n of nodeSource) {
      if (createdNodes[nodeIdx] && n.id) {
        nodeIdMap[n.id] = createdNodes[nodeIdx].id;
      }
      nodeIdx++;
    }

    // Create network links (skip if node IDs can't be mapped)
    const linkSource = data.network_links || [];
    const linkRecords = [];
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
    await bulkCreateConcurrent(base44, 'NetworkLink', linkRecords);

    // Create isolated points (skip if layer or DMA IDs can't be mapped)
    const isolatedSource = data.isolated_points || [];
    const isolatedRecords = [];
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
    await bulkCreateConcurrent(base44, 'IsolatedPoint', isolatedRecords);

    // Create map notes, image overlays, project progress, import logs
    const noteSource = data.map_notes || [];
    await bulkCreateConcurrent(base44, 'MapNote', noteSource.map(n => ({ ...strip(n), project_id: targetId })));

    const overlaySource = data.image_overlays || [];
    await bulkCreateConcurrent(base44, 'ImageOverlay', overlaySource.map(o => ({ ...strip(o), project_id: targetId })));

    const progressSource = data.project_progress || [];
    await bulkCreateConcurrent(base44, 'ProjectProgress', progressSource.map(p => ({ ...strip(p), project_id: targetId })));

    const logSource = data.import_logs || [];
    await bulkCreateConcurrent(base44, 'ImportLog', logSource.map(l => ({ ...strip(l), project_id: targetId })));

    // Import first chunk of consumption readings
    let firstReadingSource;
    if (source_project_id) {
      firstReadingSource = await base44.asServiceRole.entities.ConsumptionReading.filter(
        { project_id: source_project_id }, 'id', READINGS_CHUNK_SIZE, 0
      );
    } else {
      firstReadingSource = (data.consumption_readings || []).slice(0, READINGS_CHUNK_SIZE);
    }
    const { imported: firstReadingsImported, skipped: readingsSkipped } = await importReadingsChunk(base44, firstReadingSource, targetId, meterIdMap, meterUidMap);
    skipped.readings = readingsSkipped;
    const hasMoreReadings = firstReadingSource.length === READINGS_CHUNK_SIZE;

    return Response.json({
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
    return Response.json({ error: error.message }, { status: 500 });
  }
});