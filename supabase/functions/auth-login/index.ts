// Replaces base44/functions/systemUserAuth/entry.ts.
//
// Security hardening applied per the migration plan (Phase 1):
//  - bcrypt (salted per-user) instead of a single hardcoded static salt +
//    SHA-256.
//  - The admin master-password backdoor ("any Admin's PIN logs in as
//    anyone") from the original function is REMOVED — a user can only log
//    in with their own password hash.
//  - On successful PIN verification, mints a REAL Supabase session (not a
//    hand-signed token) by mirroring the system_user into auth.users and
//    using the Admin API, because this project uses asymmetric (ES256) JWT
//    signing keys whose private key Supabase does not expose. `user_type` is
//    attached to every issued token via the custom_access_token_hook
//    Postgres function (migration 20260723100007), not by this function.
//
// TODO(Phase 4): forgotPassword currently only logs the temp PIN
// (visible via `supabase functions logs auth-login`) instead of emailing it —
// real delivery via Microsoft Graph / Outlook is wired up when the
// connectors are ported.

import { createClient } from 'npm:@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

function generateTempPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isSixDigitPin(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}

async function findUser(identifier: string | undefined) {
  if (!identifier) return null;
  const { data: byUsername } = await admin
    .from('system_user')
    .select('*')
    .eq('username', identifier)
    .limit(1);
  if (byUsername && byUsername.length > 0) return byUsername[0];

  const { data: byEmail } = await admin
    .from('system_user')
    .select('*')
    .ilike('email', identifier)
    .limit(1);
  return byEmail && byEmail.length > 0 ? byEmail[0] : null;
}

// Ensures a real auth.users row exists with the same id as the system_user
// row, so auth.uid() on every future request equals system_user.id.
async function ensureAuthUser(user: { id: string; email: string; user_type: string }) {
  const { error } = await admin.auth.admin.createUser({
    id: user.id,
    email: user.email,
    email_confirm: true,
    app_metadata: { user_type: user.user_type },
  });
  // Ignore "already exists" — every subsequent login hits this path.
  if (error && !/already been registered|already exists/i.test(error.message)) {
    throw error;
  }
}

// Builds the full login payload — auth user, real session, last_login. Used by
// `login` and, crucially, by `setPassword` / `resetPassword`: those complete a
// login too, and returning without a session left the user "signed in" client
// side with no JWT, so RLS saw an anonymous request and every project list came
// back empty.
async function loginPayload(user: { id: string; email: string; full_name: string; user_type: string }) {
  await ensureAuthUser(user);
  const session = await mintSession(user.email);
  await admin.from('system_user').update({ last_login: new Date().toISOString() }).eq('id', user.id);
  return {
    success: true,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    user_id: user.id,
    full_name: user.full_name,
    email: user.email,
    user_type: user.user_type,
  };
}

// Converts the verified PIN login into a real Supabase session (access +
// refresh token), signed by Supabase's own managed key.
async function mintSession(email: string) {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError) throw linkError;
  const tokenHash = linkData.properties?.hashed_token;
  if (!tokenHash) throw new Error('Failed to generate session token');

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
  });
  if (!verifyRes.ok) {
    throw new Error(`Session verification failed (${verifyRes.status}): ${await verifyRes.text()}`);
  }
  return await verifyRes.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const body = await req.json();
    const { action, identifier, password, tempPassword, newPassword } = body ?? {};

    if (action === 'check') {
      const user = await findUser(identifier);
      if (!user) return json({ error: 'User not found' }, 404);
      return json({
        user_id: user.id,
        full_name: user.full_name,
        has_password: !!user.password_hash,
      });
    }

    if (action === 'login') {
      const user = await findUser(identifier);
      if (!user) return json({ error: 'User not found' }, 404);
      if (!user.password_hash) {
        return json({ error: 'No password set. Please set your password first.' }, 400);
      }
      const matches = await bcrypt.compare(password ?? '', user.password_hash);
      if (!matches) return json({ error: 'Invalid password' }, 401);

      await ensureAuthUser(user);
      const session = await mintSession(user.email);
      await admin.from('system_user').update({ last_login: new Date().toISOString() }).eq('id', user.id);

      return json({
        success: true,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        user_id: user.id,
        full_name: user.full_name,
        email: user.email,
        user_type: user.user_type,
      });
    }

    if (action === 'setPassword') {
      const user = await findUser(identifier);
      if (!user) return json({ error: 'User not found' }, 404);
      if (user.password_hash) {
        return json({ error: 'Password already set. Use forgot password to reset.' }, 400);
      }
      if (!isSixDigitPin(password)) {
        return json({ error: 'Password must be exactly 6 digits' }, 400);
      }
      const hash = await bcrypt.hash(password, 10);
      await admin
        .from('system_user')
        .update({ password_hash: hash, temp_password_hash: null, temp_password_expires: null })
        .eq('id', user.id);
      return json(await loginPayload(user));
    }

    if (action === 'forgotPassword') {
      const user = await findUser(identifier);
      // Always return success, regardless of whether the user exists, to
      // avoid leaking which identifiers are registered.
      if (!user) return json({ success: true });

      const tempPin = generateTempPin();
      const tempHash = await bcrypt.hash(tempPin, 10);
      const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await admin
        .from('system_user')
        .update({ temp_password_hash: tempHash, temp_password_expires: expires })
        .eq('id', user.id);

      // TODO(Phase 4): send via Microsoft Graph once the Outlook connector
      // is ported. Logged for now so it's retrievable during local testing.
      console.log(`[auth-login] forgotPassword temp PIN for ${user.email}: ${tempPin}`);
      return json({ success: true });
    }

    if (action === 'resetPassword') {
      const user = await findUser(identifier);
      if (!user) return json({ error: 'User not found' }, 404);
      if (!user.temp_password_hash) {
        return json({ error: 'No password reset requested. Please use forgot password first.' }, 400);
      }
      if (new Date(user.temp_password_expires) < new Date()) {
        return json({ error: 'Temporary password has expired. Please request a new one.' }, 401);
      }
      const tempMatches = await bcrypt.compare(tempPassword ?? '', user.temp_password_hash);
      if (!tempMatches) return json({ error: 'Invalid temporary password' }, 401);
      if (!isSixDigitPin(newPassword)) {
        return json({ error: 'New password must be exactly 6 digits' }, 400);
      }
      const newHash = await bcrypt.hash(newPassword, 10);
      await admin
        .from('system_user')
        .update({ password_hash: newHash, temp_password_hash: null, temp_password_expires: null })
        .eq('id', user.id);
      return json(await loginPayload(user));
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('[auth-login] error:', error);
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
