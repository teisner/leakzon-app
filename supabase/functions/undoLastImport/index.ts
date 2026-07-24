// Replaces base44/functions/undoLastImport/entry.ts.
import { admin, getCallerUser, hasProjectAccess, json, CORS_HEADERS } from '../_shared/authz.ts';

async function countAll(table: string, projectId: string, fileUrl: string) {
  let count = 0;
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data: batch } = await admin
      .from(table)
      .select('id')
      .eq('project_id', projectId)
      .eq('source_file_url', fileUrl)
      .range(from, from + 4999);
    count += batch?.length || 0;
    hasMore = (batch?.length || 0) === 5000;
    from += 5000;
  }
  return count;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { project_id, preview } = await req.json();
    if (!project_id) return json({ error: 'project_id is required' }, 400);

    const user = await getCallerUser(req);
    if (!(await hasProjectAccess(user, project_id))) return json({ error: 'Unauthorized' }, 403);

    const { data: layers } = await admin
      .from('project_layer')
      .select('*')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false })
      .limit(50);
    const latestLayer = (layers || []).find((l) => !/boundary/i.test(l.name) && l.file_url);

    const { data: latestMeters } = await admin
      .from('meter')
      .select('*')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false })
      .limit(1);
    const latestMeter = latestMeters?.[0];

    const { data: latestReadings } = await admin
      .from('consumption_reading')
      .select('*')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false })
      .limit(1);
    const latestReading = latestReadings?.[0];

    const { data: latestLogs } = await admin
      .from('import_log')
      .select('*')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false })
      .limit(1);
    const latestLog = latestLogs?.[0];

    const candidates: { url: string; date: Date }[] = [];
    if (latestLayer) candidates.push({ url: latestLayer.file_url, date: new Date(latestLayer.created_at) });
    if (latestMeter?.source_file_url) candidates.push({ url: latestMeter.source_file_url, date: new Date(latestMeter.created_at) });
    if (latestReading?.source_file_url) candidates.push({ url: latestReading.source_file_url, date: new Date(latestReading.created_at) });
    if (latestLog?.source_file_url) candidates.push({ url: latestLog.source_file_url, date: new Date(latestLog.created_at) });

    if (candidates.length === 0) return json({ error: 'No imports found to undo' }, 404);

    candidates.sort((a, b) => b.date.getTime() - a.date.getTime());
    const fileUrl = candidates[0].url;
    if (!fileUrl) return json({ error: 'Could not determine import file URL' }, 400);

    const meterCount = await countAll('meter', project_id, fileUrl);
    const readingCount = await countAll('consumption_reading', project_id, fileUrl);
    const logCount = await countAll('import_log', project_id, fileUrl);
    const { data: matchingLayersRaw } = await admin
      .from('project_layer')
      .select('*')
      .eq('project_id', project_id)
      .eq('file_url', fileUrl);
    const matchingLayers = (matchingLayersRaw || []).filter((l) => !/boundary/i.test(l.name));
    const layerNames = matchingLayers.map((l) => l.name);

    const summary = { fileUrl, layerCount: matchingLayers.length, layerNames, meterCount, readingCount, logCount };

    if (preview) return json(summary);

    if (meterCount > 0) await admin.from('meter').delete().eq('project_id', project_id).eq('source_file_url', fileUrl);
    if (readingCount > 0) await admin.from('consumption_reading').delete().eq('project_id', project_id).eq('source_file_url', fileUrl);
    if (logCount > 0) await admin.from('import_log').delete().eq('project_id', project_id).eq('source_file_url', fileUrl);
    for (const layer of matchingLayers) {
      await admin.from('project_layer').delete().eq('id', layer.id);
    }

    return json({ ...summary, deleted: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
