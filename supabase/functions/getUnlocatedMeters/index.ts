// Replaces base44/functions/getUnlocatedMeters/entry.ts.
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

    const unlocated: unknown[] = [];
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: batch } = await admin
        .from('meter')
        .select('id, uid, address, payer_name, is_main')
        .eq('project_id', project_id)
        .or('latitude.is.null,longitude.is.null')
        .order('uid')
        .range(skip, skip + 4999);
      unlocated.push(...(batch || []));
      hasMore = (batch?.length || 0) === 5000;
      skip += 5000;
    }

    const meters = unlocated.map((m: any) => ({
      id: m.id,
      uid: m.uid,
      address: m.address || null,
      payer_name: m.payer_name || null,
      is_main: m.is_main || false,
    }));

    return json({
      meters,
      count: meters.length,
      project: { name: project.name, latitude: project.latitude, longitude: project.longitude },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
