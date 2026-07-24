import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, project_id, annotation_id, annotation } = body;

    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }

    if (action === 'list') {
      const annotations = await base44.asServiceRole.entities.CustomerAnnotation.filter(
        { project_id }, '-created_date'
      );
      return Response.json({ annotations });
    }

    if (action === 'create') {
      if (!annotation || !annotation.type) {
        return Response.json({ error: 'annotation with type is required' }, { status: 400 });
      }
      const created = await base44.asServiceRole.entities.CustomerAnnotation.create({
        project_id,
        annotation_type: annotation.type,
        data: JSON.stringify(annotation),
        viewed: false,
      });
      return Response.json({ id: created.id });
    }

    if (action === 'update') {
      if (!annotation_id) {
        return Response.json({ error: 'annotation_id is required' }, { status: 400 });
      }
      await base44.asServiceRole.entities.CustomerAnnotation.update(annotation_id, {
        data: JSON.stringify(annotation),
      });
      return Response.json({ success: true });
    }

    if (action === 'delete') {
      if (!annotation_id) {
        return Response.json({ error: 'annotation_id is required' }, { status: 400 });
      }
      await base44.asServiceRole.entities.CustomerAnnotation.delete(annotation_id);
      return Response.json({ success: true });
    }

    if (action === 'mark_viewed') {
      await base44.asServiceRole.entities.CustomerAnnotation.updateMany(
        { project_id, viewed: false },
        { $set: { viewed: true } }
      );
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});