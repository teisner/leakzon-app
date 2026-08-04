// Customer-facing (anonymous) endpoint for the Meter Data Permission Request
// page — same share-token gate as manageCustomerAnnotations/getCustomerModeData
// (see _shared/customerToken.ts).
import { admin, json, CORS_HEADERS } from '../_shared/authz.ts';
import { validateCustomerToken } from '../_shared/customerToken.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const body = await req.json();
    const {
      action, project_id, token,
      provider_name, customer_official_name, signer_name, signer_title,
      signature_data, pdf_data,
    } = body;

    if (!project_id) return json({ error: 'project_id is required' }, 400);

    const tokenCheck = await validateCustomerToken(project_id, token);
    if (!tokenCheck.valid) return json({ error: tokenCheck.error }, 403);

    const { data: project } = await admin
      .from('project')
      .select('id, name, signature_page_enabled')
      .eq('id', project_id)
      .single();

    if (!project?.signature_page_enabled) {
      return json({ error: 'The permission request page is not enabled for this project' }, 403);
    }

    if (action === 'load') {
      return json({ project: { id: project.id, name: project.name } });
    }

    if (action === 'submit') {
      const required = { provider_name, customer_official_name, signer_name, signer_title, signature_data };
      const missing = Object.entries(required).filter(([, v]) => !String(v || '').trim()).map(([k]) => k);
      if (missing.length) return json({ error: `Missing required field(s): ${missing.join(', ')}` }, 400);

      const { error } = await admin.from('customer_signature').insert({
        project_id,
        provider_name: provider_name.trim(),
        customer_official_name: customer_official_name.trim(),
        signer_name: signer_name.trim(),
        signer_title: signer_title.trim(),
        signature_data,
        pdf_data: pdf_data || null,
      });
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
