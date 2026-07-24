import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { project_id } = body;

    if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });

    const project = await base44.asServiceRole.entities.Project.get(project_id);

    // Fetch all meters where latitude OR longitude is missing
    const unlocated = [];
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.Meter.filter(
        { project_id, $or: [{ latitude: null }, { longitude: null }] },
        'uid',
        5000,
        skip
      );
      unlocated.push(...batch);
      hasMore = batch.length === 5000;
      skip += batch.length;
    }

    const meters = unlocated.map((m) => ({
      id: m.id,
      uid: m.uid,
      address: m.address || null,
      payer_name: m.payer_name || null,
      is_main: m.is_main || false,
    }));

    return Response.json({
      meters,
      count: meters.length,
      project: {
        name: project.name,
        latitude: project.latitude,
        longitude: project.longitude,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});