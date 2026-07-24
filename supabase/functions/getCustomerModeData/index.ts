// Replaces base44/functions/getCustomerModeData/entry.ts.
// Original had a real bug: when no token was provided, it only denied access
// if an active CustomerViewLink already existed for the project — a project
// that never had a link created (or whose links were all disabled/expired)
// fell through to fully open, unauthenticated access. Fixed by always
// requiring a valid token via the shared validator (deny-by-default).
import { admin, json, CORS_HEADERS } from '../_shared/authz.ts';
import { validateCustomerToken } from '../_shared/customerToken.ts';

const METER_PAGE_SIZE = 5000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { project_id, token } = await req.json();
    if (!project_id) return json({ error: 'project_id is required' }, 400);

    const tokenCheck = await validateCustomerToken(project_id, token);
    if (!tokenCheck.valid) return json({ error: tokenCheck.error }, 403);

    const { data: project } = await admin.from('project').select('*').eq('id', project_id).single();
    if (!project) return json({ error: 'Project not found' }, 404);

    const [{ data: layers }, { data: dmas }, { data: isolatedPoints }] = await Promise.all([
      admin.from('project_layer').select('*').eq('project_id', project_id).order('sort_order'),
      admin.from('dma_enriched').select('*').eq('project_id', project_id).order('sort_order'),
      admin.from('isolated_point').select('*').eq('project_id', project_id),
    ]);

    const meters: any[] = [];
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: batch } = await admin
        .from('meter')
        .select('*')
        .eq('project_id', project_id)
        .order('id')
        .range(skip, skip + METER_PAGE_SIZE - 1);
      meters.push(...(batch || []));
      hasMore = (batch?.length || 0) === METER_PAGE_SIZE;
      skip += METER_PAGE_SIZE;
    }

    return json({
      project,
      layers: layers || [],
      dmas: (dmas || []).map((d) => ({ ...d, polygon: d.polygon_json })),
      meters,
      isolated_points: isolatedPoints || [],
      link_expires_at: tokenCheck.expiresAt,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
