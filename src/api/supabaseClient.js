import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// persistSession/autoRefreshToken: the session comes from auth-login's
// custom PIN flow (see AuthContext, Phase 5), not Supabase's own
// email/password sign-in — but once set via supabase.auth.setSession(), the
// client refreshes it like any other Supabase session.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
