// Replaces base44/functions/getMeterConsumption/entry.ts.
// Original took project_id in the request but never used it for anything —
// including auth. This looks up the meter's real project_id itself and
// checks access against that, rather than trusting a client-supplied value.
import { admin, getCallerUser, hasProjectAccess, json, CORS_HEADERS } from '../_shared/authz.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { meter_id } = await req.json();
    if (!meter_id) return json({ error: 'meter_id is required' }, 400);

    const { data: meter } = await admin.from('meter').select('project_id').eq('id', meter_id).single();
    if (!meter) return json({ error: 'Meter not found' }, 404);

    const user = await getCallerUser(req);
    if (!(await hasProjectAccess(user, meter.project_id))) return json({ error: 'Unauthorized' }, 403);

    const allReadings: unknown[] = [];
    const batchSize = 5000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: batch } = await admin
        .from('consumption_reading')
        .select('*')
        .eq('meter_id', meter_id)
        .order('id')
        .range(from, from + batchSize - 1);
      allReadings.push(...(batch || []));
      hasMore = (batch?.length || 0) === batchSize;
      from += batchSize;
    }

    return json({ readings: allReadings, count: allReadings.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
