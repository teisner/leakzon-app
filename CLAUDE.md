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

## Deploy workflow: preview first, publish on approval

**Ship every change to the `preview` branch first — never straight to `main`.**
The user reviews it on the stable Vercel preview URL, then says "publish" (or
similar) and only then does it go live.

- `preview` branch  → Vercel preview build (stable URL, same every time)
- `main` branch     → production, `ob.leakzon.app`

Do not merge to `main` until the user explicitly approves. When they do:
`git checkout main && git merge preview && git push origin main && git checkout preview`.

Caveat to remember and state when relevant: **only frontend changes are really
previewed.** Supabase migrations and Edge Functions deploy straight to the one
Supabase project, so they go live the moment they're pushed regardless of
branch — and the preview shares the production database, so data changes made
in a preview are real.

The standard flow for every change:

1. Make the edit(s).
2. **Bump the version**: increment `APP_VERSION` in `src/lib/version.js` by
   `0.001` (format `1.NNN`, three digits after the dot — e.g. 1.000 → 1.001)
   and add a matching dated entry to `versions.md` (newest first). Each entry
   is: `## <version> — <date>`, then a **bold one-line headline** summarizing
   the main change, then the detailed bullets. The version shows in small text
   under the logo (dashboard + project header).
3. `npm run build` to confirm it compiles.
4. `git add` the changed files, `git commit` with a clear message, then
   `git push origin preview`.
5. Tell the user it's on the preview URL and ask them to review.
6. **Send a push notification** (PushNotification, status "proactive") when the
   change reaches the user — on preview ("ready to review") and again on
   publish. Message = version number + changelog headline, e.g.
   `LeakZon v1.017 on preview — "<headline>". Ready to review.` (The tool
   auto-skips when the user is at the terminal — expected.) One per push; if
   several happen while they're away, one for the latest is fine.

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
