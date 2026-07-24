import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { project_id } = body;

    if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });

    const project = await base44.asServiceRole.entities.Project.get(project_id);

    // Fetch all layers for the project
    const layers = await base44.asServiceRole.entities.ProjectLayer.filter(
      { project_id, visible: true },
      'sort_order',
      5000,
      0
    );

    const simpleLayers = layers.map((l) => ({
      id: l.id,
      name: l.name,
      category: l.category || null,
      layer_type: l.layer_type,
      file_url: l.file_url,
      color: l.color || "#3388ff",
      geometry_types: l.geometry_types || [],
      pipe_config: l.pipe_config || null,
    }));

    // Fetch all located meters
    const meters = [];
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.Meter.filter(
        { project_id, latitude: { $ne: null }, longitude: { $ne: null } },
        'uid',
        5000,
        skip
      );
      meters.push(...batch);
      hasMore = batch.length === 5000;
      skip += batch.length;
    }

    const simpleMeters = meters.map((m) => ({
      id: m.id,
      uid: m.uid,
      is_main: m.is_main || false,
      latitude: m.latitude,
      longitude: m.longitude,
    }));

    return Response.json({
      project: {
        name: project.name,
        latitude: project.latitude,
        longitude: project.longitude,
      },
      layers: simpleLayers,
      meters: simpleMeters,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});