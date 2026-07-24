import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PAGE_SIZE = 5000;

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });

    const project = await base44.asServiceRole.entities.Project.get(project_id);
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const [layers, meters, readings, dmas, importLogs, networkNodes, networkLinks, mapNotes, isolatedPoints, imageOverlays, projectProgress] = await Promise.all([
      base44.asServiceRole.entities.ProjectLayer.filter({ project_id }, 'sort_order'),
      fetchAll(base44, 'Meter', { project_id }),
      fetchAll(base44, 'ConsumptionReading', { project_id }),
      base44.asServiceRole.entities.Dma.filter({ project_id }, 'sort_order'),
      fetchAll(base44, 'ImportLog', { project_id }),
      fetchAll(base44, 'NetworkNode', { project_id }),
      fetchAll(base44, 'NetworkLink', { project_id }),
      fetchAll(base44, 'MapNote', { project_id }),
      fetchAll(base44, 'IsolatedPoint', { project_id }),
      fetchAll(base44, 'ImageOverlay', { project_id }),
      fetchAll(base44, 'ProjectProgress', { project_id }),
    ]);

    return Response.json({
      project,
      layers,
      meters,
      consumption_readings: readings,
      dmas,
      import_logs: importLogs,
      network_nodes: networkNodes,
      network_links: networkLinks,
      map_notes: mapNotes,
      isolated_points: isolatedPoints,
      image_overlays: imageOverlays,
      project_progress: projectProgress,
      stats: {
        layers: layers.length,
        meters: meters.length,
        readings: readings.length,
        dmas: dmas.length,
        import_logs: importLogs.length,
        network_nodes: networkNodes.length,
        network_links: networkLinks.length,
        map_notes: mapNotes.length,
        isolated_points: isolatedPoints.length,
        image_overlays: imageOverlays.length,
        project_progress: projectProgress.length,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});