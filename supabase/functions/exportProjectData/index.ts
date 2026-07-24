// Replaces base44/functions/exportProjectData/entry.ts.
import { admin, getCallerUser, hasProjectAccess, json, CORS_HEADERS } from '../_shared/authz.ts';

const PAGE_SIZE = 5000;

async function fetchAll(table: string, projectId: string, orderCol = 'id') {
  const all: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data: batch } = await admin
      .from(table)
      .select('*')
      .eq('project_id', projectId)
      .order(orderCol)
      .range(from, from + PAGE_SIZE - 1);
    all.push(...(batch || []));
    hasMore = (batch?.length || 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { project_id } = await req.json();
    if (!project_id) return json({ error: 'project_id is required' }, 400);

    const user = await getCallerUser(req);
    if (!(await hasProjectAccess(user, project_id))) return json({ error: 'Unauthorized' }, 403);

    const { data: project } = await admin.from('project').select('*').eq('id', project_id).single();
    if (!project) return json({ error: 'Project not found' }, 404);

    const [layers, meters, readings, dmas, importLogs, networkNodes, networkLinks, mapNotes, isolatedPoints, imageOverlays, projectProgress] =
      await Promise.all([
        fetchAll('project_layer', project_id, 'sort_order'),
        fetchAll('meter', project_id),
        fetchAll('consumption_reading', project_id),
        fetchAll('dma', project_id, 'sort_order'),
        fetchAll('import_log', project_id),
        fetchAll('network_node', project_id),
        fetchAll('network_link', project_id),
        fetchAll('map_note', project_id),
        fetchAll('isolated_point', project_id),
        fetchAll('image_overlay', project_id),
        fetchAll('project_progress', project_id),
      ]);

    return json({
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
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
