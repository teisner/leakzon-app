// Replaces base44/functions/getProjectMapData/entry.ts.
import { admin, getCallerUser, hasProjectAccess, json, CORS_HEADERS } from '../_shared/authz.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { project_id } = await req.json();
    if (!project_id) return json({ error: 'project_id is required' }, 400);

    const user = await getCallerUser(req);
    if (!(await hasProjectAccess(user, project_id))) return json({ error: 'Unauthorized' }, 403);

    const { data: project } = await admin.from('project').select('*').eq('id', project_id).single();
    if (!project) return json({ error: 'Project not found' }, 404);

    // Aliased to layer_type_ref: project_layer already has its own flat
    // `layer_type` column (shp/data) — embedding under the matching table
    // name `layer_type` would silently overwrite it in the response.
    const { data: layers } = await admin
      .from('project_layer')
      .select('*, layer_type_ref:layer_type(name)')
      .eq('project_id', project_id)
      .eq('visible', true)
      .order('sort_order')
      .limit(5000);

    const simpleLayers = (layers || []).map((l) => ({
      id: l.id,
      name: l.name,
      category: l.layer_type_ref?.name || null,
      layer_type: l.layer_type,
      file_url: l.file_url,
      color: l.color || '#3388ff',
      geometry_types: l.geometry_types || [],
      pipe_config: l.pipe_config || null,
    }));

    const meters: unknown[] = [];
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: batch } = await admin
        .from('meter')
        .select('id, uid, is_main, latitude, longitude')
        .eq('project_id', project_id)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('uid')
        .range(skip, skip + 4999);
      meters.push(...(batch || []));
      hasMore = (batch?.length || 0) === 5000;
      skip += 5000;
    }

    const simpleMeters = meters.map((m: any) => ({
      id: m.id,
      uid: m.uid,
      is_main: m.is_main || false,
      latitude: m.latitude,
      longitude: m.longitude,
    }));

    return json({
      project: { name: project.name, latitude: project.latitude, longitude: project.longitude },
      layers: simpleLayers,
      meters: simpleMeters,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
