import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const VALID_STEPS = ['consumption_readings', 'meters', 'layers', 'import_logs', 'project'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { project_id, step } = await req.json();

    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }
    if (!step || !VALID_STEPS.includes(step)) {
      return Response.json({ error: 'Valid step is required', valid_steps: VALID_STEPS }, { status: 400 });
    }

    let deleted_count = 0;

    const deleteAll = async (entityName) => {
      let count = 0;
      let hasMore = true;
      while (hasMore) {
        const res = await base44.asServiceRole.entities[entityName].deleteMany({ project_id });
        count += res.deleted_count || 0;
        hasMore = res.has_more === true;
      }
      return count;
    };

    if (step === 'consumption_readings') {
      deleted_count = await deleteAll('ConsumptionReading');
    } else if (step === 'meters') {
      deleted_count = await deleteAll('Meter');
    } else if (step === 'layers') {
      deleted_count = await deleteAll('ProjectLayer');
    } else if (step === 'import_logs') {
      deleted_count = await deleteAll('ImportLog');
    } else if (step === 'project') {
      await base44.asServiceRole.entities.Project.delete(project_id);
      deleted_count = 1;
    }

    return Response.json({ success: true, step, deleted_count });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});