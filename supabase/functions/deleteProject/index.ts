// Replaces base44/functions/deleteProject/entry.ts.
// Original had NO auth check at all (any caller could wipe any project) —
// this is destructive and project-wide, so it requires Admin/Super User.
import { admin, getCallerUser, isAdminOrSuper, json, CORS_HEADERS } from '../_shared/authz.ts';

const VALID_STEPS = ['consumption_readings', 'meters', 'layers', 'import_logs', 'project'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const user = await getCallerUser(req);
    if (!isAdminOrSuper(user)) return json({ error: 'Unauthorized' }, 403);

    const { project_id, step } = await req.json();
    if (!project_id) return json({ error: 'project_id is required' }, 400);
    if (!step || !VALID_STEPS.includes(step)) {
      return json({ error: 'Valid step is required', valid_steps: VALID_STEPS }, 400);
    }

    const tableForStep: Record<string, string> = {
      consumption_readings: 'consumption_reading',
      meters: 'meter',
      layers: 'project_layer',
      import_logs: 'import_log',
    };

    let deleted_count = 0;
    if (step === 'project') {
      await admin.from('project').delete().eq('id', project_id);
      deleted_count = 1;
    } else {
      const { count } = await admin
        .from(tableForStep[step])
        .delete({ count: 'exact' })
        .eq('project_id', project_id);
      deleted_count = count || 0;
    }

    return json({ success: true, step, deleted_count });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
