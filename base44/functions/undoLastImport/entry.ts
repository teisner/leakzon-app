import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { project_id, preview } = body;

    if (!project_id) return Response.json({ error: 'project_id is required' }, { status: 400 });

    // Gather the most recent record from each import-related entity
    const layers = await base44.asServiceRole.entities.ProjectLayer.filter({ project_id }, '-created_date', 50);
    const latestLayer = layers.find((l) => !/boundary/i.test(l.name) && l.file_url);

    const latestMeters = await base44.asServiceRole.entities.Meter.filter({ project_id }, '-created_date', 1);
    const latestMeter = latestMeters[0];

    const latestReadings = await base44.asServiceRole.entities.ConsumptionReading.filter({ project_id }, '-created_date', 1);
    const latestReading = latestReadings[0];

    const latestLogs = await base44.asServiceRole.entities.ImportLog.filter({ project_id }, '-created_date', 1);
    const latestLog = latestLogs[0];

    // Determine the file URL of the absolute latest import
    const candidates = [];
    if (latestLayer) candidates.push({ url: latestLayer.file_url, date: new Date(latestLayer.created_date), name: latestLayer.name });
    if (latestMeter && latestMeter.source_file_url) candidates.push({ url: latestMeter.source_file_url, date: new Date(latestMeter.created_date) });
    if (latestReading && latestReading.source_file_url) candidates.push({ url: latestReading.source_file_url, date: new Date(latestReading.created_date) });
    if (latestLog && latestLog.source_file_url) candidates.push({ url: latestLog.source_file_url, date: new Date(latestLog.created_date) });

    if (candidates.length === 0) {
      return Response.json({ error: 'No imports found to undo' }, { status: 404 });
    }

    candidates.sort((a, b) => b.date - a.date);
    const fileUrl = candidates[0].url;

    if (!fileUrl) {
      return Response.json({ error: 'Could not determine import file URL' }, { status: 400 });
    }

    // Count what will be / was affected
    const meterCount = await countAll(base44, 'Meter', { project_id, source_file_url: fileUrl });
    const readingCount = await countAll(base44, 'ConsumptionReading', { project_id, source_file_url: fileUrl });
    const logCount = await countAll(base44, 'ImportLog', { project_id, source_file_url: fileUrl });
    const matchingLayers = (await base44.asServiceRole.entities.ProjectLayer.filter({ project_id, file_url: fileUrl }))
      .filter((l) => !/boundary/i.test(l.name));
    const layerNames = matchingLayers.map((l) => l.name);

    const summary = {
      fileUrl,
      layerCount: matchingLayers.length,
      layerNames,
      meterCount,
      readingCount,
      logCount,
    };

    // Preview mode — return summary without deleting
    if (preview) {
      return Response.json(summary);
    }

    // Delete meters
    if (meterCount > 0) {
      await base44.asServiceRole.entities.Meter.deleteMany({ project_id, source_file_url: fileUrl });
    }
    // Delete consumption readings
    if (readingCount > 0) {
      await base44.asServiceRole.entities.ConsumptionReading.deleteMany({ project_id, source_file_url: fileUrl });
    }
    // Delete import logs
    if (logCount > 0) {
      await base44.asServiceRole.entities.ImportLog.deleteMany({ project_id, source_file_url: fileUrl });
    }
    // Delete non-boundary project layers
    for (const layer of matchingLayers) {
      await base44.asServiceRole.entities.ProjectLayer.delete(layer.id);
    }

    return Response.json({ ...summary, deleted: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function countAll(base44, entityName, query) {
  let count = 0;
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    const batch = await base44.asServiceRole.entities[entityName].filter(query, 'id', 5000, skip);
    count += batch.length;
    hasMore = batch.length === 5000;
    skip += batch.length;
  }
  return count;
}