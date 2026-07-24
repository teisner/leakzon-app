import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { meter_id, latitude, longitude } = body;

    if (!meter_id || latitude == null || longitude == null) {
      return Response.json({ error: 'meter_id, latitude and longitude are required' }, { status: 400 });
    }

    await base44.asServiceRole.entities.Meter.update(meter_id, {
      latitude: Number(latitude),
      longitude: Number(longitude),
      location_source: 'geocoded',
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});