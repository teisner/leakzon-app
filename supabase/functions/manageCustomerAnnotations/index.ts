// Replaces base44/functions/manageCustomerAnnotations/entry.ts.
// Customer-facing (anonymous) endpoint — original had NO check at all beyond
// requiring a project_id, meaning anyone who knew/guessed a project_id could
// read/create/update/delete another customer's annotations. Now requires the
// same share-token validation as getCustomerModeData (see _shared/customerToken.ts).
// The frontend (CustomerMode.jsx -> CustomerModeMap.jsx) was updated to pass
// the token through on every call.
import { admin, json, CORS_HEADERS } from '../_shared/authz.ts';
import { validateCustomerToken } from '../_shared/customerToken.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const body = await req.json();
    const { action, project_id, token, annotation_id, annotation } = body;

    if (!project_id) return json({ error: 'project_id is required' }, 400);

    const tokenCheck = await validateCustomerToken(project_id, token);
    if (!tokenCheck.valid) return json({ error: tokenCheck.error }, 403);

    if (action === 'list') {
      const { data } = await admin
        .from('customer_annotation')
        .select('*')
        .eq('project_id', project_id)
        .order('created_at', { ascending: false });
      return json({ annotations: data || [] });
    }

    if (action === 'create') {
      if (!annotation || !annotation.type) {
        return json({ error: 'annotation with type is required' }, 400);
      }
      const { data: created, error } = await admin
        .from('customer_annotation')
        .insert({
          project_id,
          annotation_type: annotation.type,
          data: annotation,
          viewed: false,
        })
        .select()
        .single();
      if (error) throw error;
      return json({ id: created.id });
    }

    if (action === 'update') {
      if (!annotation_id) return json({ error: 'annotation_id is required' }, 400);
      await admin.from('customer_annotation').update({ data: annotation }).eq('id', annotation_id).eq('project_id', project_id);
      return json({ success: true });
    }

    if (action === 'delete') {
      if (!annotation_id) return json({ error: 'annotation_id is required' }, 400);
      await admin.from('customer_annotation').delete().eq('id', annotation_id).eq('project_id', project_id);
      return json({ success: true });
    }

    if (action === 'mark_viewed') {
      await admin.from('customer_annotation').update({ viewed: true }).eq('project_id', project_id).eq('viewed', false);
      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
