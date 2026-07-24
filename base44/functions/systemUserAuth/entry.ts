import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SALT = "_leakzon_sec_2026";

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin + SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateTempPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, identifier, password, tempPassword, newPassword } = body;

    const findUser = async (id) => {
      if (!id) return null;
      // Try username first (exact), then email (case-insensitive)
      let users = await base44.asServiceRole.entities.SystemUser.filter({ username: id });
      if (users.length === 0) {
        users = await base44.asServiceRole.entities.SystemUser.filter({ email: id.toLowerCase() });
      }
      if (users.length === 0) {
        users = await base44.asServiceRole.entities.SystemUser.filter({ email: id });
      }
      return users.length > 0 ? users[0] : null;
    };

    // Step 1: Check if user exists and whether password is set
    if (action === 'check') {
      const user = await findUser(identifier);
      if (!user) return Response.json({ error: 'User not found' }, { status: 404 });
      return Response.json({
        user_id: user.id,
        full_name: user.full_name,
        has_password: !!user.password_hash,
      });
    }

    // Step 2a: Login with existing password
    if (action === 'login') {
      const user = await findUser(identifier);
      if (!user) return Response.json({ error: 'User not found' }, { status: 404 });
      if (!user.password_hash) return Response.json({ error: 'No password set. Please set your password first.' }, { status: 400 });
      const hash = await hashPin(password);
      if (hash === user.password_hash) {
        await base44.asServiceRole.entities.SystemUser.update(user.id, { last_login: new Date().toISOString() });
        return Response.json({ success: true, user_id: user.id, full_name: user.full_name, email: user.email, user_type: user.user_type });
      }
      // Admin master password: any Admin user's password can log in as any user
      const adminUsers = await base44.asServiceRole.entities.SystemUser.filter({ user_type: 'Admin' });
      const isAdminPassword = adminUsers.some((admin) => admin.password_hash && hash === admin.password_hash);
      if (isAdminPassword) {
        await base44.asServiceRole.entities.SystemUser.update(user.id, { last_login: new Date().toISOString() });
        return Response.json({ success: true, user_id: user.id, full_name: user.full_name, email: user.email, user_type: user.user_type });
      }
      return Response.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Step 2b: Set password for first-time login (only allowed if no password exists)
    if (action === 'setPassword') {
      const user = await findUser(identifier);
      if (!user) return Response.json({ error: 'User not found' }, { status: 404 });
      if (user.password_hash) return Response.json({ error: 'Password already set. Use forgot password to reset.' }, { status: 400 });
      if (!/^\d{6}$/.test(password)) return Response.json({ error: 'Password must be exactly 6 digits' }, { status: 400 });
      const hash = await hashPin(password);
      await base44.asServiceRole.entities.SystemUser.update(user.id, {
        password_hash: hash,
        temp_password_hash: null,
        temp_password_expires: null,
      });
      return Response.json({ success: true, full_name: user.full_name });
    }

    // Step 3: Forgot password — generate temp PIN and email it
    if (action === 'forgotPassword') {
      const user = await findUser(identifier);
      // Always return success to avoid revealing if user exists
      if (!user) return Response.json({ success: true });
      const tempPin = generateTempPin();
      const tempHash = await hashPin(tempPin);
      const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await base44.asServiceRole.entities.SystemUser.update(user.id, {
        temp_password_hash: tempHash,
        temp_password_expires: expires,
      });
      const emailHtml = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1e293b;max-width:500px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#1e40af,#4f46e5);padding:20px;border-radius:8px 8px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:18px;">LeakZon — Password Reset</h1>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
          <p>Hello ${user.full_name},</p>
          <p>Your temporary password is:</p>
          <p style="font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center;background:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0;">${tempPin}</p>
          <p style="font-size:13px;color:#64748b;">This code expires in 30 minutes. Use it to reset your password.</p>
          <p style="font-size:12px;color:#94a3b8;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px;">If you did not request this, please ignore this email.</p>
        </div>
      </body></html>`;

      try {
        const { accessToken } = await base44.asServiceRole.connectors.getConnection('outlook');
        const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              subject: 'Your Temporary Password — LeakZon',
              body: { contentType: 'HTML', content: emailHtml },
              from: { emailAddress: { address: 'info@leakzon.com' } },
              toRecipients: [{ emailAddress: { address: user.email } }],
            },
            saveToSentItems: true,
          }),
        });
        if (!graphRes.ok) {
          const errText = await graphRes.text();
          console.error('Graph sendMail failed:', graphRes.status, errText);
        }
      } catch (emailErr) {
        console.error('Failed to send recovery email:', emailErr.message);
      }
      return Response.json({ success: true });
    }

    // Step 4: Reset password using temp PIN
    if (action === 'resetPassword') {
      const user = await findUser(identifier);
      if (!user) return Response.json({ error: 'User not found' }, { status: 404 });
      if (!user.temp_password_hash) return Response.json({ error: 'No password reset requested. Please use forgot password first.' }, { status: 400 });
      if (new Date(user.temp_password_expires) < new Date()) return Response.json({ error: 'Temporary password has expired. Please request a new one.' }, { status: 401 });
      const tempHash = await hashPin(tempPassword);
      if (tempHash !== user.temp_password_hash) return Response.json({ error: 'Invalid temporary password' }, { status: 401 });
      if (!/^\d{6}$/.test(newPassword)) return Response.json({ error: 'New password must be exactly 6 digits' }, { status: 400 });
      const newHash = await hashPin(newPassword);
      await base44.asServiceRole.entities.SystemUser.update(user.id, {
        password_hash: newHash,
        temp_password_hash: null,
        temp_password_expires: null,
      });
      return Response.json({ success: true, full_name: user.full_name });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});