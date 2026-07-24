// Replaces base44/functions/refreshProjectStats/entry.ts.
// Drastically simplified: ProjectStats is now the project_stats materialized
// view (migration 20260723100005), computed live from meter/dma tables, so
// there's no per-project create/update/delete bookkeeping to do anymore —
// just tell Postgres to refresh the view. The RefreshDashboardStats cron
// workflow (Phase 4) calls the underlying SQL function directly; this
// endpoint exists for the UI's manual "force refresh" button, which is why
// it requires a logged-in caller (the original had no auth check at all).
import { admin, getCallerUser, json, CORS_HEADERS } from '../_shared/authz.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const user = await getCallerUser(req);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { error } = await admin.rpc('refresh_project_stats');
    if (error) throw error;

    return json({ success: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
