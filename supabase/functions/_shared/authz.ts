// Shared auth/authorization helper for every ported Base44 function.
//
// Base44's originals almost all ran via `base44.asServiceRole.entities.*`
// (a full DB bypass) with little or no per-endpoint check — several had none
// at all. Every port here requires a real caller identity and, where the
// action is project-scoped, real project access — the hardening decision
// confirmed for this migration (Phase 1).
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

// Server-side client with the service role — bypasses RLS. Every function
// uses this for its actual data access (matching the scale/batching the
// original functions needed), gated by the explicit checks below rather than
// by RLS at the query layer.
export const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export interface CallerUser {
  id: string;
  full_name: string;
  email: string;
  user_type: string;
}

// Resolves the calling system_user from the request's bearer token, or null
// if missing/invalid. Every function must check this before doing anything.
export async function getCallerUser(req: Request): Promise<CallerUser | null> {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: sysUser } = await admin
    .from('system_user')
    .select('id, full_name, email, user_type')
    .eq('id', data.user.id)
    .single();

  return sysUser ?? null;
}

export function isAdminOrSuper(user: CallerUser | null): boolean {
  return user?.user_type === 'Admin' || user?.user_type === 'Super User';
}

// Mirrors the has_project_access() Postgres function used by RLS, for
// service-role code paths that need the same rule explicitly.
export async function hasProjectAccess(user: CallerUser | null, projectId: string): Promise<boolean> {
  if (!user) return false;
  if (isAdminOrSuper(user)) return true;
  const { data } = await admin
    .from('project_assignment')
    .select('project_id')
    .eq('project_id', projectId)
    .eq('system_user_id', user.id)
    .maybeSingle();
  return !!data;
}
