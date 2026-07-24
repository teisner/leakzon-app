import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const METER_PAGE_SIZE = 5000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { project_id, token } = body;

    if (!project_id) {
      return Response.json({ error: 'project_id is required' }, { status: 400 });
    }

    let linkExpiresAt = null;
    // Validate customer view link token
    if (token) {
      const links = await base44.asServiceRole.entities.CustomerViewLink.filter({
        project_id, token, is_active: true
      });
      if (links.length === 0) {
        return Response.json({ error: 'Invalid or disabled link' }, { status: 403 });
      }
      if (new Date(links[0].expires_at) < new Date()) {
        return Response.json({ error: 'This link has expired' }, { status: 403 });
      }
      linkExpiresAt = links[0].expires_at;
    } else {
      // No token provided — check if any active link exists for this project
      const allLinks = await base44.asServiceRole.entities.CustomerViewLink.filter({
        project_id, is_active: true
      });
      const now = new Date();
      const hasActiveLink = allLinks.some((l) => new Date(l.expires_at) >= now);
      if (hasActiveLink) {
        return Response.json({ error: 'A valid link token is required to access this view' }, { status: 403 });
      }
    }

    const project = await base44.asServiceRole.entities.Project.get(project_id);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const [layers, dmas, isolatedPoints] = await Promise.all([
      base44.asServiceRole.entities.ProjectLayer.filter({ project_id }, 'sort_order'),
      base44.asServiceRole.entities.Dma.filter({ project_id }, 'sort_order'),
      base44.asServiceRole.entities.IsolatedPoint.filter({ project_id }),
    ]);

    // Fetch all meters with pagination (can be 40K+ records)
    const meters = [];
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.Meter.filter(
        { project_id }, 'id', METER_PAGE_SIZE, skip
      );
      meters.push(...batch);
      hasMore = batch.length === METER_PAGE_SIZE;
      skip += batch.length;
    }

    return Response.json({
      project,
      layers,
      dmas,
      meters,
      isolated_points: isolatedPoints,
      link_expires_at: linkExpiresAt,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});