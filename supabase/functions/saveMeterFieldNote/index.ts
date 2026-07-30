// Lets the field technician say why a meter could not be located.
//
// Reached from the Mobile Locator, which is opened from an emailed link with no
// login — so authorisation is the project's share token, the same as
// getUnlocatedMeters and updateMeterLocation. Also callable by a signed-in
// operator, which is how the note is cleared once it has been dealt with.
import { admin, getCallerUser, hasProjectAccess, json, CORS_HEADERS } from '../_shared/authz.ts';
import { validateCustomerToken } from '../_shared/customerToken.ts';

const MAX_NOTE = 2000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { meter_id, note, token } = await req.json();
    if (!meter_id) return json({ error: 'meter_id is required' }, 400);

    // The meter decides which project's token is required — a token for one
    // project must not be usable to annotate another's meters.
    const { data: meter } = await admin
      .from('meter')
      .select('id, project_id')
      .eq('id', meter_id)
      .maybeSingle();
    if (!meter) return json({ error: 'Meter not found' }, 404);

    const user = await getCallerUser(req);
    const allowed = (await hasProjectAccess(user, meter.project_id))
      || (await validateCustomerToken(meter.project_id, token)).valid;
    if (!allowed) return json({ error: 'Unauthorized' }, 403);

    // An empty note clears it: that is how the office marks an issue resolved.
    const text = typeof note === 'string' ? note.trim().slice(0, MAX_NOTE) : '';
    const { error } = await admin
      .from('meter')
      .update({
        field_note: text || null,
        field_note_at: text ? new Date().toISOString() : null,
      })
      .eq('id', meter_id);
    if (error) return json({ error: error.message }, 500);

    return json({ success: true, cleared: !text });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
