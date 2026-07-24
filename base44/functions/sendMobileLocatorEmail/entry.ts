import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { project_id, email, origin: clientOrigin } = body;

    if (!project_id || !email) {
      return Response.json({ error: 'project_id and email are required' }, { status: 400 });
    }

    const project = await base44.asServiceRole.entities.Project.get(project_id);

    // Count unlocated meters
    let count = 0;
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.Meter.filter(
        { project_id, $or: [{ latitude: null }, { longitude: null }] },
        'id',
        5000,
        skip
      );
      count += batch.length;
      hasMore = batch.length === 5000;
      skip += batch.length;
    }

    // Use the app's frontend origin (passed from the browser) to build the link.
    // req.url resolves to the API server, not the app's domain.
    const origin = clientOrigin || new URL(req.url).origin;
    const link = `${origin}/mobile-locator/${project_id}`;

    const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <div style="background: linear-gradient(135deg, #2563eb, #1e40af); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 20px;">
    <h1 style="color: white; font-size: 20px; margin: 0 0 8px;">📍 Mobile Locator</h1>
    <p style="color: #bfdbfe; font-size: 14px; margin: 0;">${project.name}</p>
  </div>
  <p style="color: #334155; font-size: 15px; line-height: 1.5;">
    You've been assigned to locate <strong style="color: #1e40af;">${count} meter${count !== 1 ? 's' : ''}</strong> that need GPS coordinates in the field.
  </p>
  <p style="color: #334155; font-size: 15px; line-height: 1.5;">
    Tap the button below to open the Mobile Locator on your phone:
  </p>
  <div style="text-align: center; margin: 24px 0;">
    <a href="${link}" style="display: inline-block; background: #2563eb; color: white; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">
      Open Mobile Locator
    </a>
  </div>
  <div style="background: #f1f5f9; border-radius: 8px; padding: 12px 16px; margin-top: 16px;">
    <p style="color: #64748b; font-size: 12px; margin: 0;">
      📱 This link works best on a mobile device with GPS enabled.<br/>
      You can pin each meter's location on the map.
    </p>
  </div>
  <p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 24px;">
    If you didn't expect this email, you can safely ignore it.
  </p>
</div>`;

    // Send via Outlook connector (Microsoft Graph API) for reliable delivery
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('outlook');
    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: `Mobile Locator — ${project.name} (${count} meter${count !== 1 ? 's' : ''})`,
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: email } }],
        },
        saveToSentItems: true,
      }),
    });
    if (!graphRes.ok) {
      const errText = await graphRes.text();
      throw new Error(`Outlook send failed (${graphRes.status}): ${errText}`);
    }

    return Response.json({ success: true, count });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});