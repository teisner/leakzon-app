import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { meter_id, project_id } = await req.json();
    if (!meter_id) return Response.json({ error: 'meter_id is required' }, { status: 400 });

    const allReadings = [];
    const batchSize = 5000;
    let lastId = null;
    let hasMore = true;

    while (hasMore) {
      const query = lastId
        ? { meter_id, _id: { $gt: lastId } }
        : { meter_id };
      const batch = await base44.asServiceRole.entities.ConsumptionReading.filter(query, '_id', batchSize);
      allReadings.push(...batch);
      hasMore = batch.length === batchSize;
      if (batch.length > 0) lastId = batch[batch.length - 1].id;
    }

    return Response.json({ readings: allReadings, count: allReadings.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});