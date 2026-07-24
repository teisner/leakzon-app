// Replaces base44/functions/manageCustomerViewLinks/entry.ts.
// Original called base44.auth.me().catch(() => null) for list/create/disable
// but proceeded regardless of the result — meaning anyone could mint, list,
// or disable share links for any project with zero real authentication.
// Now requires a real authenticated Admin/Super User for those actions.
// `validate` stays public (it's how a customer's browser would check token
// validity) and reuses the same deny-by-default token check as
// getCustomerModeData.
import { admin, getCallerUser, isAdminOrSuper, json, CORS_HEADERS } from '../_shared/authz.ts';
import { validateCustomerToken } from '../_shared/customerToken.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const body = await req.json();
    const { action, project_id, link_id, token, days } = body;
    if (!action) return json({ error: 'action is required' }, 400);

    if (action === 'validate') {
      if (!project_id || !token) return json({ valid: false, error: 'project_id and token are required' }, 400);
      const result = await validateCustomerToken(project_id, token);
      return json(result.valid ? { valid: true, expires_at: result.expiresAt } : { valid: false, error: result.error });
    }

    const user = await getCallerUser(req);
    if (!isAdminOrSuper(user)) return json({ error: 'Unauthorized' }, 403);

    if (action === 'list') {
      if (!project_id) return json({ error: 'project_id is required' }, 400);
      const { data: links } = await admin
        .from('customer_view_link')
        .select('*')
        .eq('project_id', project_id)
        .order('created_at', { ascending: false });
      const now = new Date();
      const enriched = (links || []).map((l) => ({
        ...l,
        is_expired: new Date(l.expires_at) < now,
        is_valid: l.is_active && new Date(l.expires_at) >= now,
      }));
      return json({ links: enriched });
    }

    if (action === 'create') {
      if (!project_id) return json({ error: 'project_id is required' }, 400);
      const { data: existing } = await admin
        .from('customer_view_link')
        .select('*')
        .eq('project_id', project_id)
        .eq('is_active', true);
      const now = new Date();
      const activeLinks = (existing || []).filter((l) => new Date(l.expires_at) >= now);
      if (activeLinks.length > 0) {
        return json({ error: 'An active link already exists. Disable it before creating a new one.' }, 409);
      }

      const expiryDays = Math.max(1, Math.min(365, parseInt(days) || 7));
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);
      const linkToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

      const { data: link, error } = await admin
        .from('customer_view_link')
        .insert({
          project_id,
          token: linkToken,
          expires_at: expiresAt.toISOString(),
          is_active: true,
          created_by_id: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return json({ link });
    }

    if (action === 'disable') {
      if (!link_id) return json({ error: 'link_id is required' }, 400);
      await admin.from('customer_view_link').update({ is_active: false }).eq('id', link_id);
      return json({ success: true });
    }

    return json({ error: 'Unknown action: ' + action }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
