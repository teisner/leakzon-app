// Replaces base44/functions/updateMeterLocation/entry.ts.
// Original had no auth check at all and no project_id in the request; this
// looks up the meter's real project_id and checks access against that.
import { admin, getCallerUser, hasProjectAccess, json, CORS_HEADERS } from '../_shared/authz.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { meter_id, latitude, longitude } = await req.json();
    if (!meter_id || latitude == null || longitude == null) {
      return json({ error: 'meter_id, latitude and longitude are required' }, 400);
    }

    const { data: meter } = await admin.from('meter').select('project_id').eq('id', meter_id).single();
    if (!meter) return json({ error: 'Meter not found' }, 404);

    const user = await getCallerUser(req);
    if (!(await hasProjectAccess(user, meter.project_id))) return json({ error: 'Unauthorized' }, 403);

    await admin
      .from('meter')
      .update({ latitude: Number(latitude), longitude: Number(longitude), location_source: 'geocoded' })
      .eq('id', meter_id);

    return json({ success: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
