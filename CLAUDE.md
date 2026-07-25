# LeakZon — working instructions

This app has been fully migrated **off Base44** to a self-hosted stack:
Supabase (Postgres + PostGIS, Auth, Storage, Edge Functions) + a Vite/React
frontend deployed on **Vercel**. Ignore the Base44-specific guidance in
`AGENTS.md` (it predates the migration).

## Always use caveman mode

**Respond in caveman mode (the `caveman` skill) by default, every response, at
the default `full` intensity** — terse, fragments, no filler or pleasantries,
while keeping all technical substance. Do not announce the mode or add a
"normal" recap alongside it. Stays active across turns; the user turns it off
with "stop caveman" / "normal mode", or changes level with
`/caveman lite|full|ultra`.

Keep the skill's own Auto-Clarity exceptions — write normally for:
security warnings, confirmations of irreversible/destructive actions (data
loss, deletes, deploys that can't be rolled back), multi-step sequences where
dropped articles/conjunctions could be misread, and anywhere compression makes
something ambiguous. Code, commands, commit messages, PR text, and exact error
strings are always verbatim and uncompressed. If the user asks a follow-up
because something was unclear, answer that one normally.

Installed via: `claude plugin install caveman@caveman`
(marketplace `JuliusBrussee/caveman`). Uninstall:
`npx -y github:JuliusBrussee/caveman -- --uninstall`.

## Auto-deploy after every change

**After making any code change the user asked for, deploy it automatically —
do not wait to be told "please deploy".** Deploy = commit the change and
`git push origin main`; Vercel auto-builds `main` and publishes to
`ob.leakzon.app`. The standard flow for every change:

1. Make the edit(s).
2. **Bump the version**: increment `APP_VERSION` in `src/lib/version.js` by
   `0.001` (format `1.NNN`, three digits after the dot — e.g. 1.000 → 1.001)
   and add a matching dated entry to `versions.md` (newest first). Each entry
   is: `## <version> — <date>`, then a **bold one-line headline** summarizing
   the main change, then the detailed bullets. The version shows in small text
   under the logo (dashboard + project header).
3. `npm run build` to confirm it compiles.
4. `git add` the changed files, `git commit` with a clear message, `git push origin main`.
5. Tell the user it's pushed and Vercel is deploying.
6. **Send a push notification** (PushNotification, status "proactive") so the
   user is pinged on their phone (via Remote Control) to refresh. Message =
   the version number + the changelog headline, e.g.
   `LeakZon v1.017 deployed — "<headline>". Refresh to update.` (The tool
   auto-skips when the user is actively at the terminal — that's expected.)
   Send one per deploy; if several deploys happen in a row while they're away,
   a single notification for the latest is fine.

Only skip the push if the change is incomplete/experimental, or the user
explicitly says not to deploy yet. If a build fails, fix it before pushing —
never push a broken build.

## Key facts

- Frontend Supabase client: `src/api/supabaseClient.js` (anon key + a JWT
  minted by the `auth-login` Edge Function via `supabase.auth.setSession`).
- Edge Functions live in `supabase/functions/`; SQL schema in
  `supabase/migrations/`.
- Every table has RLS keyed on `has_project_access(project_id)`; `authenticated`
  has full CRUD grants, `anon` has SELECT only. A momentarily-expired session
  drops to `anon`, so **always check the `error` on destructive writes**
  (delete/update) from the browser client before proceeding.
- Run `npm run build` before finishing any code change.
