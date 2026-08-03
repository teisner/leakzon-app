// Customer-facing (anonymous) endpoint for the signature test page — same
// share-token gate as manageCustomerAnnotations/getCustomerModeData
// (see _shared/customerToken.ts).
import { admin, json, CORS_HEADERS } from '../_shared/authz.ts';
import { validateCustomerToken } from '../_shared/customerToken.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const body = await req.json();
    const { action, project_id, token, signature_data } = body;

    if (!project_id) return json({ error: 'project_id is required' }, 400);

    const tokenCheck = await validateCustomerToken(project_id, token);
    if (!tokenCheck.valid) return json({ error: tokenCheck.error }, 403);

    const { data: project } = await admin
      .from('project')
      .select('id, name, signature_page_enabled')
      .eq('id', project_id)
      .single();

    if (!project?.signature_page_enabled) {
      return json({ error: 'The signature page is not enabled for this project' }, 403);
    }

    if (action === 'load') {
      return json({ project: { id: project.id, name: project.name } });
    }

    if (action === 'submit') {
      if (!signature_data) return json({ error: 'signature_data is required' }, 400);
      const { error } = await admin
        .from('customer_signature')
        .insert({ project_id, signature_data });
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
