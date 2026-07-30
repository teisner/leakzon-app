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
    // supabase-js hands back a plain object, not an Error, so `throw error`
    // landed in the catch below and was reported as a bare "Internal error" —
    // the actual Postgres message was thrown away. Report it.
    if (error) {
      return json({ error: error.message || 'Could not refresh the statistics', code: error.code ?? null }, 500);
    }

    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : (typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : 'Internal error');
    return json({ error: message }, 500);
  }
});
