# Route validation

Two Playwright scripts that load every route of the built app in a real browser
and report anything that would show a user a broken screen. Written for the
Phase 6 route-by-route validation of the Base44 migration; kept because the
recurring failure in this codebase is a page that builds fine and then throws at
render (a missing import), which no amount of `npm run build` will catch.

## Running them

    npm run build
    npx vite preview --port 4319 --strictPort &

    node scripts/validation/routes.mjs      # renders every route, reports node count + console errors
    node scripts/validation/i18n-scan.mjs   # finds translation keys leaking to the screen as raw text

Both need a signed-in session. They read three files from a scratch directory:

- `session.json` — a Supabase session, minted with the admin API
  (`POST /auth/v1/admin/generate_link` then `POST /auth/v1/verify`)
- `user.json`    — the matching `system_user` row
- `projects.json` — the project list, to pick real projects to open

Set `SCR` at the top of each script to wherever those live. The scripts seed the
session into `localStorage` under the client's `sb-<ref>-auth-token` key plus
`loggedInUser`, which is exactly what `auth-login` does at sign-in.

## Notes

- They point at a **local** preview build but the **production** Supabase
  project, so every read is real data. They only navigate and read — no clicks,
  nothing written.
- `routes.mjs` flags a page as BLANK below 40 DOM nodes. The customer view
  without a token and the 404 page are legitimately that small; read the text
  column before believing a BLANK.
