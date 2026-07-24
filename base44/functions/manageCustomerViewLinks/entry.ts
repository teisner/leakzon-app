import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, project_id, link_id, token, days, created_by_name } = body;

    if (!action) {
      return Response.json({ error: 'action is required' }, { status: 400 });
    }

    // Public action: validate a token
    if (action === 'validate') {
      if (!project_id || !token) {
        return Response.json({ valid: false, error: 'project_id and token are required' }, { status: 400 });
      }
      const links = await base44.asServiceRole.entities.CustomerViewLink.filter({ project_id, token, is_active: true });
      if (links.length === 0) {
        return Response.json({ valid: false, error: 'Invalid or disabled link' });
      }
      const link = links[0];
      if (new Date(link.expires_at) < new Date()) {
        return Response.json({ valid: false, error: 'This link has expired' });
      }
      return Response.json({ valid: true, expires_at: link.expires_at });
    }

    // Admin-only actions — use service role (app uses custom SystemUser auth, not platform auth)
    const user = await base44.auth.me().catch(() => null);
    const creatorName = created_by_name || user?.full_name || 'Admin';

    if (action === 'list') {
      if (!project_id) {
        return Response.json({ error: 'project_id is required' }, { status: 400 });
      }
      const links = await base44.asServiceRole.entities.CustomerViewLink.filter(
        { project_id }, '-created_date'
      );
      // Compute status for each link
      const now = new Date();
      const enriched = links.map((l) => ({
        ...l,
        is_expired: new Date(l.expires_at) < now,
        is_valid: l.is_active && new Date(l.expires_at) >= now,
      }));
      return Response.json({ links: enriched });
    }

    if (action === 'create') {
      if (!project_id) {
        return Response.json({ error: 'project_id is required' }, { status: 400 });
      }
      // Check if there's already an active, non-expired link
      const existing = await base44.asServiceRole.entities.CustomerViewLink.filter(
        { project_id, is_active: true }
      );
      const now = new Date();
      const activeLinks = existing.filter((l) => new Date(l.expires_at) >= now);
      if (activeLinks.length > 0) {
        return Response.json({
          error: 'An active link already exists. Disable it before creating a new one.',
        }, { status: 409 });
      }

      const expiryDays = Math.max(1, Math.min(365, parseInt(days) || 7));
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);

      const linkToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

      const link = await base44.asServiceRole.entities.CustomerViewLink.create({
        project_id,
        token: linkToken,
        expires_at: expiresAt.toISOString(),
        is_active: true,
        created_by_name: creatorName,
      });

      return Response.json({ link });
    }

    if (action === 'disable') {
      if (!link_id) {
        return Response.json({ error: 'link_id is required' }, { status: 400 });
      }
      await base44.asServiceRole.entities.CustomerViewLink.update(link_id, { is_active: false });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});