// Replaces base44/functions/sendMobileLocatorEmail/entry.ts. Original had
// zero auth check at all (any caller could email anyone about any project) —
// now requires real project access. Also replaces the Outlook/Microsoft
// Graph connector with Resend (HTTP API, no OAuth/SMTP needed — see
// project_base44_migration memory for why raw SMTP and Gmail OAuth were
// both ruled out for this migration).
import { admin, getCallerUser, hasProjectAccess, json, CORS_HEADERS } from '../_shared/authz.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'info@leakzon.app';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { project_id, email, origin: clientOrigin } = await req.json();
    if (!project_id || !email) {
      return json({ error: 'project_id and email are required' }, 400);
    }

    const user = await getCallerUser(req);
    if (!(await hasProjectAccess(user, project_id))) return json({ error: 'Unauthorized' }, 403);

    if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY is not configured' }, 500);

    const { data: project } = await admin.from('project').select('id, name').eq('id', project_id).single();
    if (!project) return json({ error: 'Project not found' }, 404);

    // Count unlocated meters (same query as getUnlocatedMeters)
    let count = 0;
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: batch } = await admin
        .from('meter')
        .select('id')
        .eq('project_id', project_id)
        .or('latitude.is.null,longitude.is.null')
        .range(skip, skip + 4999);
      count += batch?.length || 0;
      hasMore = (batch?.length || 0) === 5000;
      skip += 5000;
    }

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

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `LeakZon <${FROM_EMAIL}>`,
        to: [email],
        subject: `Mobile Locator — ${project.name} (${count} meter${count !== 1 ? 's' : ''})`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      return json({ error: `Resend send failed (${resendRes.status}): ${errText}` }, 502);
    }

    return json({ success: true, count });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
