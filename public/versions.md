# LeakZon — Version History

Every change bumps the version by `0.001` (format `1.NNN`) and adds an entry
here, newest first. Each entry is tagged with what it contains:

- **Bug fix** — something was broken and now works
- **New feature** — something that wasn't there before
- **Updated feature** — an existing feature changed, improved or removed
- Combinations are listed together, e.g. *New feature + Bug fix*

After the tag comes a one-line headline, then the details. The running version
is shown at the bottom of the side menu.

## 1.100 — 2026-07-28 · *Updated feature*
**Version number moved to the left of the bottom strip**
- The version now sits on the **left** of the strip instead of the centre.
- The dividing line above the strip is gone — it shares its background with the
  side menu, so the line only split one surface in two.

## 1.099 — 2026-07-28 · *Updated feature*
**Bottom strip is thinner and matches the side menu**
- The strip is now **28px** instead of 40px.
- It was a lighter shade than the side menu in dark mode. Both now use the same
  background, so the strip and the menu read as one surface. Light mode is
  unchanged — both were already white, which is why it only showed in dark mode.

## 1.098 — 2026-07-28 · *Updated feature*
**Version number moved into the bottom strip**
- "Ver 1.098" now sits **in** the bottom strip, centred, instead of above it at
  the foot of the side menu.
- The update badge moved with it, so a newer version is still flagged in the
  same place and clicking it still offers to refresh.
- The Import / Export page has the same strip now, so the version is in the
  same place throughout a project.

## 1.097 — 2026-07-28 · *Updated feature*
**Bottom strip now matches the other panels**
- The strip added in 1.096 was solid black. It now uses the same background as
  the header and the panels — **white in light mode**, the same dark tone in
  dark mode — with the standard divider line above it.

## 1.096 — 2026-07-28 · *Updated feature*
**Black strip along the bottom of the project page**
- A black band now runs across the bottom of the project page, the same height
  as the version block in the side menu — measured from its divider down to the
  bottom edge (40px).
- The map gives up the space rather than the strip being squeezed, so it stays
  the same height at any window size.

## 1.095 — 2026-07-28 · *Updated feature*
**Custom layer icons removed**
- The **Custom icon** option has been removed from Edit Layer. Layers are styled
  with shape, size, colour and outline colour.
- Two layers in "Woodlawn - Internal" were still using an icon and now show
  their shape instead. Keeping the option hidden while leaving their icon in
  place would have left them stuck — an icon hides the shape controls, so there
  would have been no way to restyle them.

## 1.094 — 2026-07-28 · *Updated feature*
**Edit Layer redesigned into clear sections that fit on screen**
- The panel is now grouped into **Details**, **Colour**, **Shape & size**,
  **Custom icon** and **Pipe widths**, instead of one long list of fields.
- **One colour palette instead of two.** Shape colour and outline colour now
  share a palette with a small Shape / Outline switch. Two stacked palettes made
  the panel taller than the screen, which is what pushed the buttons out of
  view.
- Shapes are compact icon buttons that wrap, so the new octagon fits without
  crowding, and fill style and size sit on single labelled rows.
- The **Save** and **Cancel** buttons are pinned to the bottom and always
  visible; only the middle scrolls.
- The "Apply defaults" prompt is now a small button in the Shape & size header
  rather than a banner taking a full row.

## 1.093 — 2026-07-28 · *New feature*
**Octagon added to the layer shapes**
- **Octagon** joins circle, star, square and triangle in the shape picker, for
  layers and for the dashboard component defaults.
- The shapes were defined separately in four places, so a new one would have
  appeared on the map but not in the picker used to choose it — they now all
  come from one definition.

## 1.092 — 2026-07-28 · *Bug fix*
**The ruler can now be placed anywhere, including on top of components**
- Measuring points could not be placed on a meter, valve, pipe or any other
  component — the click was taken by that component instead, so you had to aim
  at bare map just beside it. Exactly where you most often want a measurement.
- Clicks now reach the map wherever you point while the ruler is active.
- The measurement line, its points and its distance labels now draw **above
  every layer**, so a layer on top can no longer hide what you are measuring.
- Popups still work normally; only measuring mode changes this.

## 1.091 — 2026-07-28 · *Bug fix + Updated feature*
**Sub-meters can now be properly filled, and dark colours are available**
- Choosing **filled** on a sub-meter layer still looked washed out. Sub-meters
  were locked to 45% fill whatever the layer's setting, so they never looked
  filled — worst of all with a dark colour. Filled now means filled, for main
  and sub alike.
- Meters marked **inactive** are still shown faded, so they stay easy to pick
  out.
- **Added 13 dark colours** to the palette — dark green, red, orange, olive,
  emerald, teal, blue, indigo, violet, magenta and pink. Every colour was
  previously a mid or bright tone, so a genuinely dark shade could not be
  chosen at all.
- The new colours appear everywhere the palette is used: layer settings, DMA
  settings and the dashboard component defaults.

## 1.090 — 2026-07-28 · *Bug fix*
**Fixed the black screen when opening a project**
- Opening a project showed a black screen. The meter editor rewritten in 1.089
  used something that was never imported, which crashes the whole page the
  moment it renders.
- Only affected the preview site — the live site was never on that version.
- The project checks now catch this kind of mistake before it can ship. It had
  slipped through twice, because building the app doesn't reveal it; only
  running the page does.

## 1.089 — 2026-07-28 · *Updated feature*
**Meter editor is now a floating panel, and every meter has a status**
- The meter editor is a **floating, draggable panel** instead of a centred
  dialog — drag it by its header and keep working on the map underneath. It
  widens when you open the location picker, and scrolls rather than growing off
  screen.
- **16,371 meters that had no status are now Active.** They showed as "N/A"
  because the file they came from carried no status column. The 1,203 meters
  explicitly marked inactive were left exactly as they were.
- The screen flicker over the map is confirmed fixed. It was caused by Vercel's
  performance tracking, which stays switched off.

## 1.088 — 2026-07-28 · *New feature*
**Edit a meter straight from the map**
- Clicking a meter on the map — main, insertion, ultrasonic or sub — now offers
  **Edit meter details**, opening the same editor as the Meter Data table.
- Everything is editable there as usual: UID, account, address, provider,
  diameter, coordinates, meter type, and the DMA links.
- Saving refreshes the map and the DMA panel straight away, so a changed main
  meter or DMA link shows without leaving the map.
- The button is hidden on locked projects, matching the Meter Data table.

## 1.087 — 2026-07-28 · *Bug fix*
**Dashboard project figures were frozen and are now kept up to date**
- The meter and DMA numbers on the projects dashboard were a stored snapshot
  that **nothing was updating**. Obion TN showed 4 imported meters and 0
  assigned to a DMA, against 599 and 594 actually in the project, and a project
  created since the last manual refresh was **missing from the chart entirely**.
- The scheduled job that keeps these figures current was never set up when the
  platform moved off Base44. It now runs **every 15 minutes**.
- The figures have also been refreshed once now, so the dashboard is already
  correct — Obion TN reads 599 meters and 594 assigned.
- The "force refresh" button still works for an immediate update.

## 1.086 — 2026-07-28 · *Updated feature*
**Imported meters default to Active**
- Meters now come in as **Active** unless the file explicitly says they are not.
- Previously a meter was left as **N/A** whenever the file had no status column,
  or had one that was blank or held something unrecognised — so most imports
  produced meters with no status at all.
- Only a clear inactive value marks a meter out of service: *inactive, no,
  false, 0, not active, disabled, off, dead*. Anything else counts as Active.
- Applies to all three ways meters are created: meter data files, the carbon
  copy import, and meters created from a map layer.
- **Meters already imported keep their current status.** There are 16,371 with
  no status; ask and they can be set to Active in one go.

## 1.085 — 2026-07-28 · *Updated feature + Bug fix*
**Meter table shows Meter ID, Account ID and Endpoint ID**
- The meter table now has **Meter ID**, **Account ID** and **Endpoint ID**
  columns next to the UID. **Comm.** and **Additional IDs** have been removed.
- **Fixed the reason those columns would have been empty:** importing meter data
  only kept *one* extra ID column — whichever became the UID — and threw the
  rest away. The Account ID in your files was being discarded at import, so it
  existed nowhere in the system. All ID columns in the file are now kept.
- **Files imported before this keep only what they kept at the time.** Re-import
  to pick up the Account ID and any other ID columns; the discarded values
  aren't recoverable from what was stored.

## 1.084 — 2026-07-27 · *New feature*
**The project page and the customer view now keep each other up to date**
- When the customer adds an annotation, the **annotation badge appears in the
  project side menu on its own** — no reloading to find out.
- When you send a **Request Design Approval**, the approve button appears in the
  customer's view even if they already had the page open. It has a dark border
  and pulses gently so it is noticed. The pulse stops on hover, and is disabled
  for anyone who has asked their system to reduce motion.
- When the customer approves, the project page **locks itself and tells you**,
  naming who approved and reminding you that unlocking in Project Settings
  withdraws the approval.
- Both sides check every 15 seconds, and immediately whenever you switch back to
  the tab. The check is deliberately tiny — 162 bytes rather than reloading the
  whole project — so it costs nothing on large projects.

## 1.083 — 2026-07-27 · *Updated feature*
**A main meter serving several DMAs is now one row listing them all**
- A main meter that feeds more than one DMA used to show the first DMA only.
  It now stays as **a single row** with every area listed in the DMA column —
  "North DMA, North Central".
- The one case that does add a row: a main meter that is also **metered as a
  sub-meter of another DMA** (the "Sub-Meter in" field). It then appears a
  second time as a **Sub** row for that area, with a copy icon beside it.
- That extra row is a view of the same meter, not another meter — it is **not
  included in any of the counts** and can't be selected for deletion.

## 1.082 — 2026-07-27 · *Updated feature*
**Deleting a layer now asks first, and shows its progress**
- Deleting a layer used to happen the instant you clicked the bin. It now asks
  for confirmation and states plainly that it cannot be undone.
- When the layer has meters, the confirmation says **how many will be deleted**
  along with their consumption history — so a layer with thousands of meters
  can't be removed by a stray click.
- While it runs, a progress bar counts down from **100% to 0%** and names each
  stage: unlinking DMA main meters, removing isolation points, deleting meters
  and readings, removing the layer. Large layers take a while, and it was
  previously impossible to tell whether anything was happening.

## 1.081 — 2026-07-27 · *Bug fix*
**Auto-created DMAs no longer leave the outermost meters unassigned**
- An auto-drawn DMA was traced exactly through the outermost meters, so those
  meters sat precisely *on* the edge and counted as outside it — they showed up
  as unassigned along the rim of every DMA.
- Auto-created DMAs now get **25 m of breathing room** beyond the outermost
  meters, so the meters that define the shape sit inside it.
- On "Obion Oren (test)" this takes the unassigned sub-meters from **26 to 0**,
  without any meter falling into two DMAs.
- **DMAs already created keep their current shape.** Delete and re-create them
  to pick up the margin, or nudge their outline by hand.

## 1.080 — 2026-07-27 · *Bug fix*
**Meter imports keep their DMA names, and land in the right category**
- Importing meters with a DMA column announced "DMA names detected", then
  **"Auto-Create DMAs" reported none**. The names were being thrown away during
  the import: they were only kept when a matching DMA already existed, and on a
  first import none do — which is exactly when you need them.
- The name from the file is now stored with each meter, so Auto-Create DMAs can
  build the areas from it. Once the areas are created, the meters that named
  them are **linked to them automatically**.
- Imported meter layers showed a category of **Other**. They were never given a
  category at all. A split import now creates its layers as **Main Meters** and
  **Sub Meters**, and an unsplit one follows the Main/Sub choice you made.
- **For a file already imported before this fix:** re-import it to pick up the
  DMA names. The layer category can be corrected in the layer's settings
  without re-importing.

## 1.079 — 2026-07-27 · *New feature + Bug fix*
**Valve points can now be moved on the map**
- Any imported point layer — valves, hydrants, structures — now has the same
  **edit points on map** button that manual layers have. Turn it on, drag a
  point to its correct position, and save.
- Useful where a surveyed valve sits a few metres off and you want to correct it
  while reviewing the network.
- **Fixed a data-loss risk found while adding this:** saving a point layer used
  to rebuild each point from a short fixed list of fields, throwing away every
  other attribute. Woodlawn's valve layer carries 21 columns — diameter,
  condition, turns, install date, GPS accuracy and more — and all of them would
  have been wiped by a single point move. Every attribute is now kept; only the
  coordinates change.
- Line layers (water mains) and boundary layers are deliberately not included:
  the line editor rebuilds features from drawn segments and keeps only the
  diameter, and boundaries have their own editor.

## 1.078 — 2026-07-27 · *Bug fix*
**Customer view now shows annotations properly instead of blank "Drawing" entries**
- In the shared customer view, every annotation appeared as an untitled
  **"Drawing"** and none of them were drawn on the map — comments lost their
  text, arrows lost their direction, drawings lost their shape.
- The annotations were being read in a format the database no longer uses (a
  leftover from the Base44 migration), so their contents were silently thrown
  away and only an empty shell remained.
- They now load correctly, keeping their type, text and position. **Existing
  annotations are unaffected and reappear on their own** — nothing was lost,
  only misread.
- The project-side "Customer Annotations" panel was always reading them
  correctly, which is why the same annotations looked fine there.

## 1.077 — 2026-07-27 · *Bug fix*
**Fixes "Project not found" for LeakZon users with an out-of-date sign-in**
- A LeakZon user could open a project and be told it wasn't found, while an
  admin opened the same project fine. Their sign-in token was carrying an
  out-of-date account type, so the database correctly refused rows they were
  actually entitled to.
- The app now notices this and **renews the sign-in automatically**, then loads
  the project. Nothing to do — no signing out and back in.
- It only retries once per project, so a project you genuinely cannot open still
  fails cleanly instead of looping.
- Confirmed the permissions themselves are correct: a freshly signed-in LeakZon
  account sees all 22 projects and opens them normally.

## 1.076 — 2026-07-27 · *Updated feature*
**"Project not found" now tells you which account it refused**
- "Project not found" was shown for two completely different situations: the
  project genuinely not existing, and the database refusing it because the
  account you are signed in as has no access. They looked identical, which made
  the real cause impossible to see.
- The screen now names the account it was signed in as, and points out that
  **each web address keeps its own separate sign-in** — the preview site and the
  live site do not share one, so you can be signed in as different people on
  each without realising.
- The browser console now records exactly why: the database's own error code,
  the signed-in email, that account's user type, and whether its token had
  expired.

## 1.075 — 2026-07-27 · *Bug fix*
**"Forgot password?" now actually sends the email**
- The forgot-password flow generated a temporary PIN and told you to check your
  email, but **no email was ever sent** — the sending step was never finished
  during the migration, so the PIN went nowhere and nobody could reset a PIN
  without an administrator.
- It now emails the temporary PIN, using the same mail service the Mobile
  Locator email already uses. The PIN expires after 30 minutes and works once.
- Requesting a reset does **not** change your current PIN — it keeps working
  until you actually complete the reset.
- The temporary PIN is no longer written to the server logs, where anyone with
  project access could have read it.

## 1.074 — 2026-07-27 · *Updated feature*
**Change-type tags are orange in the changelog**
- The **Bug fix** / **New feature** / **Updated feature** tag on each version
  line is now orange, so it stands apart from the blue version number and date.

## 1.073 — 2026-07-27 · *Updated feature*
**Every changelog entry now says what it is**
- Each version in this changelog is tagged as a **Bug fix**, **New feature** or
  **Updated feature** — or a combination — so you can see at a glance what a
  version contains without reading it.
- Applied to all 73 entries back to 1.000. A short guide to the tags is at the
  top of the changelog.
- The "what's new" heading had drifted into the middle of the file as entries
  were added above it; it's back at the top.

## 1.072 — 2026-07-27 · *Bug fix*
**Opening a project no longer throws you back to the dashboard**
- The bounce was caused by a change of mine in 1.068: if the sign-in had not
  finished being restored within 3 seconds, the app assumed you were signed out
  and sent you back to the dashboard. A slow token refresh looks exactly the
  same as being signed out, so a perfectly valid sign-in got treated as expired.
- The app no longer navigates you anywhere on its own. It waits, and loads the
  project the moment the sign-in is ready — however long that takes.
- If the sign-in really has expired you now get a clear **"Your sign-in has
  expired"** message with a button, instead of being silently bounced.
- The waiting time before giving up went from 3 seconds to 15.

## 1.071 — 2026-07-27 · *Bug fix*
**Fixed being bounced back to the dashboard when opening a project**
- Root cause of this and the last two problems: your sign-in can quietly expire
  on the Supabase side, but the app kept a local record saying you were still
  signed in. It then looked logged in while the database refused every request —
  showing an empty dashboard, "Project not found", or bouncing you back to the
  dashboard after a few seconds.
- The app now notices when the sign-in has ended and takes you to the **sign-in
  screen**, instead of pretending you are still signed in. Signing in again
  restores everything.
- The dashboard no longer keeps showing cached projects once the sign-in has
  gone, which is what made the problem look like it was only about opening a
  project.

## 1.070 — 2026-07-27 · *New feature*
**New "Sub-Meter in" field on main meters, with suggested DMAs**
- Editing a main meter (any type) now has a **Sub-Meter in** field alongside
  **Linked DMA** — for the DMA that meters this meter as one of its consumers.
  A main meter usually supplies one DMA while sitting inside a neighbouring one.
- The DMA already chosen as Linked DMA is not offered under Sub-Meter in, since
  a meter cannot both supply a DMA and be metered by it.
- Both dropdowns now mark a suggestion with **(recommended)**, worked out from
  the network: the Linked DMA suggestion is the DMA the meter sits inside (or
  the closest one), and the Sub-Meter suggestion is the nearest other DMA. The
  Sub-Meter suggestion updates as soon as you change the Linked DMA.
- **Nothing is selected for you** — the suggestion is only a label, the choice
  stays yours.
- Meters with no coordinates get no suggestion rather than a misleading one.

## 1.069 — 2026-07-27 · *Updated feature*
**Turned off Vercel Speed Insights while chasing a screen flicker**
- Investigating a flicker seen when moving the mouse over the map — reported on
  the live site only, never on preview.
- Speed Insights is the one thing that genuinely runs on the live site but not
  on preview (the preview URL is behind a login, so its script never loads),
  and it hooks into every mouse interaction to measure responsiveness. It is
  switched off so we can confirm whether it is the cause.
- Nothing else changes. If the flicker continues, it is not this, and the
  setting goes straight back on.

## 1.068 — 2026-07-27 · *Bug fix*
**Fixed "Project not found" when opening a project**
- Opening a project straight after loading the app could show **"Project not
  found"** even though the project was right there on the dashboard. The page
  asked for the project before your sign-in had finished being restored, so the
  database correctly refused it — and a refused row looks exactly like a
  missing one.
- Same cause as the empty dashboard in 1.066. Every page that loads data on
  open now waits for your sign-in first, through one shared piece of code
  rather than each page handling it separately — so this cannot come back on a
  page nobody thought to check.
- If you really are signed out, you now get sent to the dashboard to sign in
  instead of a misleading "not found" message.
- The upload page had the same fault and is fixed too.

## 1.067 — 2026-07-27 · *Updated feature*
**Version number in the project side menu is green and centred**
- In a project, the "Ver" line at the bottom of the side menu is now green and
  centred, in both the expanded and collapsed states — it was grey and
  left-aligned when the menu was open.

## 1.066 — 2026-07-26 · *Bug fix*
**Fixed the dashboard showing no projects at all**
- After a deploy, the dashboard could come up completely empty and stay that
  way. The project list is loaded as soon as the page opens, but the saved
  sign-in is restored a moment later — so the request went out unauthenticated
  and came back with nothing, which looked exactly like "you have no projects".
- That empty result was then saved to the local cache and reused for an hour,
  so reloading did not help.
- The dashboard now waits for your sign-in before loading, never caches an
  empty list, and reloads by itself the moment the session is restored. No
  action needed — affected browsers recover on the next page load.

## 1.065 — 2026-07-26 · *Bug fix*
**Export analysis no longer counts a DMA as having a main meter it isn't linked to**
- A DMA was treated as having a main meter whenever *any* main happened to sit
  inside its area, even when no main was actually assigned to it. In Obion TN
  that made "Central DMA" look complete — the analysis said 5/5 DMAs had a main
  and no placeholder main was created for it.
- A main meter now counts for a DMA **only when it is actually assigned to it**.
  Main meters sit at inlets and boundaries and are often inside a DMA they do
  not feed, so where they happen to fall says nothing about what they serve.
- **Expect lower numbers here than before, and more placeholder mains.** They
  reflect what is really assigned: Woodlawn has 2 of 5 DMAs with a main meter,
  Pardesiya 0 of 4. Assigning the real main meters is what fixes those — the
  placeholders only keep the export valid.
- A main meter serving **several DMAs** now appears once per DMA in the export,
  each row carrying that DMA's name, so no DMA is left without a main meter row.
- New insight: **main meters not linked to a DMA**. These go to the separate
  no-DMA file, and are usually the reason a DMA is missing its main.

## 1.064 — 2026-07-26 · *Bug fix*
**Removing a DMA's main meter now clears the DMA from that meter's record**
- Unassigning a main meter from a DMA clears the DMA against that meter in the
  Meter Data table, and in the LeakZon export. Previously the meter kept its
  stored DMA, so it still exported under a DMA it was no longer linked to.
- A main meter serving more than one DMA keeps the others — only the link you
  removed is cleared.
- A main meter shows a DMA only when it is actually linked to one. It no longer
  picks one up just for sitting inside its area, which was why the DMA stayed
  visible after unassigning.
- **Fixed:** the DMA column in the Meter Data table was reading a field that no
  longer exists, so **sub meters showed a blank DMA** even when they sat inside
  one. They now show their DMA.
- Saving a DMA now reports a failure instead of closing as if it had worked,
  and the meter list refreshes after the change.

## 1.063 — 2026-07-26 · *New feature + Updated feature*
**Export to LeakZon analyses first, and DMA/boundary export as outlines**
- The export now starts with an **analysis step**. Before anything is
  downloaded you see the DMA count, how many meters are assigned vs not, mains
  vs sub meters, which DMAs have no main meter, and how many meters have no
  coordinates — then choose whether to continue.
- **DMA.shp** and the **boundary** layer now export as outlines rather than
  filled areas, so they sit over the map without hiding what is beneath.
  DMA outlines are **black**, boundary outlines **red dashed** — carried both
  as the shape geometry and as `color` / `style` attributes.
- After the export finishes, the insights are shown **first**, with a
  **Continue to LeakZon platform** button. The confetti now fires on that step
  rather than interrupting the summary.

## 1.062 — 2026-07-26 · *New feature + Updated feature + Bug fix*
**Export to LeakZon now analyses the meters first, and reports what it found**
- Meters **not assigned to any DMA** are written to their own
  `meters_no_dma.xls` instead of being mixed into the main file. Nothing is
  dropped — every meter still appears in one file or the other.
- New **DMA Name** column. A meter's DMA comes from its explicit assignment,
  or from which DMA polygon it falls inside — the same test the dashboard's
  DMA counts use, so the numbers agree.
- The **Type** column ("Main"/"Sub") is replaced by **Is Main**, with `TRUE`
  for main, insertion and ultrasonic meters and `FALSE` for sub meters.
- If a DMA has **no main meter**, a placeholder main is added for it: a numeric
  UID that continues past the highest one already in the project, account name
  `<DMA name>_Fic`, placed at the centre of the DMA.
- Column headers are always English, whatever language the app is set to.
- The finished dialog now shows **export insights**: meters assigned vs not,
  mains vs subs, DMAs with a main meter, placeholder mains added (and for which
  DMAs), and meters with no coordinates.
- **Fixed a misclassification:** a layer named "Sub Main Meters" contains the
  text "Main Meter", so its meters were being treated as mains — in Woodlawn
  that was all 5,122 sub meters. Sub-meter layers are no longer promoted.

## 1.061 — 2026-07-26 · *New feature*
**Each user can have a default country for the projects dashboard**
- The user list has a new **Country View** column showing which country that
  user's projects dashboard opens on — **All Countries** unless set.
- Editing a user offers the same choices as the dashboard's country menu (the
  countries actually in use by projects) plus **All Countries**.
- The dashboard now opens on that country. It is only a starting point: the
  country menu still works exactly as before, and switching there does not
  overwrite the saved preference.

## 1.060 — 2026-07-26 · *New feature*
**Preview refreshes itself as soon as a new build is deployed**
- On the preview site the tab now checks for a new build every 30 seconds and
  reloads itself the moment one lands — no prompt, no manual refresh. Caches are
  cleared first so it genuinely picks up the new build.
- This runs on every screen, not only the ones showing the version number.
- Production is unchanged: it still checks hourly and asks before reloading, so
  nobody loses work mid-task.
- Note: on preview an auto-reload will discard anything unsaved, which is the
  trade for always looking at the newest build.

## 1.059 — 2026-07-26 · *Bug fix*
**Import dialogs are readable in dark mode**
- The meter data import dialog was built with fixed light colours and no dark
  variants at all — dark grey text on dark panels, and white blocks where a
  tinted note should be. It now follows the theme like the rest of the app.
- Same fix applied across the whole import flow: the upload dialog itself, the
  meter column-mapping step, the consumption upload step and the undo import
  dialog.
- The blue / green / amber / red note boxes now use translucent tints that sit
  correctly on either background, with lighter text in dark mode.

## 1.058 — 2026-07-26 · *Bug fix*
**Fixed meter data imports silently creating no meters at all**
- Importing meter data from a CSV/Excel file created the layer but **not a
  single meter** — no points on the map, nothing in the Meter Data table — and
  still reported success. The import was sending a `DMA / Zone Name` field that
  is no longer a column on the meter record, so the database rejected every
  batch and the app never noticed.
- The DMA name from the file is now matched to the project's DMAs (ignoring
  case and spacing) and stored as a proper link, so importing meters with a DMA
  column assigns them to that DMA.
- Batch imports now stop and show the real error instead of reporting rows they
  never saved. This applies to every bulk import, not just meters.
- The "carbon copy" optimized importer was unaffected and worked throughout.

## 1.057 — 2026-07-26 · *New feature*
**Preview builds are marked with a red PREVIEW label**
- A small red **PREVIEW** appears under the LeakZon logo on the projects
  dashboard and inside a project, plus under the logo on the login screen — so
  a preview build is never mistaken for the live site.
- Production (`ob.leakzon.app`) never shows it. Anything else — the Vercel
  preview link, a local build — does.

## 1.056 — 2026-07-26 · *Updated feature*
**The imported file decides which meters are mains — no field means sub meters**
- When an imported meter layer has an **"Is Main"** field, that field now decides
  it, meter by meter. Recognised names: `is_main`, `IsMain`, `Is Main`,
  `main_meter`. Values `yes / true / 1 / Y / main / primary / master` mean main.
- When the file has **no such field**, meters are imported as **sub meters**.
  The one exception: layers that are explicitly a main type by category or name
  (Main Meters, Insertion Meters, Ultrasonic Meters) — those still come in as
  mains, since the layer itself already says so.
- Unrelated attribute columns like `MAIN_ID` or `MAIN SIZE` are ignored, so a
  pipe-diameter column can't silently mark a whole layer as mains.
- **Removed the plain "Meters" category** — it was confusing next to Main
  Meters / Sub Meters. Meter-named layers now auto-detect as **Sub Meters**.
  Added **Ultrasonic Meters** as a real category (it was landing under Sub
  Meters while still behaving as a main). Layers already saved under the old
  "Meters" category keep working as sub meters.

## 1.055 — 2026-07-26 · *Bug fix + Updated feature*
**Uploaded meter layers now create meter records, and the category is detected automatically**
- Uploading a single shapefile/GeoJSON no longer defaults the layer category to
  **Other** — it is now auto-detected from the layer name, the same way a
  multi-layer ZIP already did. A file with "meter" in the name lands under
  **Meters**.
- Because the category was wrong, meter layers were created as a display layer
  only: the layer showed a feature count but **0 meters**, with nothing on the
  map or in the Meter Data table. Meter layers now always create the matching
  meter records — main/insertion/ultrasonic layers as **mains**, plain
  meter/connection/service layers as **sub meters**.
- **Repair for a layer already uploaded this way:** open the layer's settings
  and set its category to **Meters** (or Main/Sub/Insertion Meters). Saving now
  creates the missing meter records from the layer's own points. It only does
  this when the layer has no meter records yet, so re-saving can't duplicate
  them.
- A name like "Water_Mains_Meters" was read as a Water Lines layer; an explicit
  "meter" in the name now wins over the pipe keywords. "Service line" style
  names still classify as pipes.

## 1.054 — 2026-07-26 · *New feature*
**Admins can sign in as a user to reproduce their view**
- On the login screen, an admin can enter a **user's email with their own PIN**
  and be signed in as that user — useful for checking what a user actually sees.
  Only works for accounts that have already been activated.
- Only Admin / Super User / LeakZon PINs are accepted; a regular user's PIN can
  never open someone else's account.
- An amber "Support login — viewing as …" bar stays visible for the whole
  session, with an End button, so a support session can't be mistaken for your
  own. Every use is recorded, and it doesn't touch the user's own "last login".

## 1.053 — 2026-07-26 · *Bug fix*
**Fixed empty dashboard after setting or resetting your PIN**
- Setting a PIN for the first time, or resetting it via "forgot password", signed
  you in without actually creating a session — so the app treated you as not
  logged in and the dashboard showed no projects at all, whatever your user type.
  Both paths now sign you in properly, exactly like a normal login.
- Only affected first-time sign-in and password reset; ordinary logins were fine.

## 1.052 — 2026-07-26 · *Updated feature*
**"Find border valves" skips valves already marked as isolation points**
- Valves you've already marked as isolation points are no longer highlighted —
  only the ones still needing attention show up, so the results shrink as you
  work through them.
- They're still used when pairing, so a valve on the other side of the same
  border is still found.

## 1.051 — 2026-07-26 · *Bug fix + Updated feature*
**Fixed the frozen customer approval dialog; changelog colours**
- Clicking "Approve this design" in the customer view appeared to do nothing and
  froze the page — the confirmation opened *underneath* the map while its
  backdrop still swallowed clicks. It now opens above the map.
- Renamed the project-side button to **Request Design Approval**.
- Changelog: version and date in blue, the headline in green, details unchanged.

## 1.050 — 2026-07-26 · *New feature*
**Refresh button on the changelog**
- A small refresh icon next to the Changelog heading in Version Updates pulls
  the newest changelog from the live site — the panel otherwise shows the copy
  that shipped with your tab, so new entries wouldn't appear until you reloaded.
- The same click checks the version: if a newer one is out you get the same
  "refresh to update" prompt as the badge in the project menu. If you're already
  up to date, the icon briefly turns into a tick.

## 1.049 — 2026-07-26 · *New feature*
**Customers can approve the network design from the shared view**
- Customer View dialog: a green **Approve Network Design** button asks the
  customer to sign off (available once a share link exists, and can be
  cancelled).
- Shared customer view: a large **Approve this design** button appears at the
  bottom centre. The customer confirms and enters their name — the dialog spells
  out that approving locks the project.
- On approval the project is locked in the customer's name with a timestamp, a
  green banner appears at the top of the project page, and every onboarding
  wizard step is marked done except "Export to LeakZon".
- Unlocking the project in Project Settings withdraws the approval and removes
  the steps the approval ticked — steps you marked yourself are kept.

## 1.048 — 2026-07-26 · *New feature*
**Notifies you when a newer version has been deployed**
- The app now checks hourly (and whenever you return to the tab) whether a newer
  version has been released. When it has, an amber badge appears next to the
  version number in the project side menu.
- Clicking the badge explains which version you're on, which is available, and
  offers to refresh — with a warning that unsaved work is lost, so you can
  choose "Later".

## 1.047 — 2026-07-26 · *Updated feature*
**Version Updates moved to the side menu footer**
- On the projects dashboard, Version Updates now sits at the bottom of the side
  menu directly above Settings, instead of in the main list with Projects,
  Archive and Users.

## 1.046 — 2026-07-26 · *Updated feature*
**Version number shown on the login screen**
- The login box now shows "Ver 1.046" in its bottom-right corner, below the
  Continue button, so the running version is visible before signing in.

## 1.045 — 2026-07-26 · *Updated feature*
**Locked projects are tinted on the dashboard**
- A locked project's card now has a warm amber tint and border instead of the
  normal card colour, matching its lock badge — so locked projects stand out
  across the grid, not just by the small icon.

## 1.044 — 2026-07-26 · *New feature*
**Added Vercel Speed Insights**
- Installed `@vercel/speed-insights` and mounted it at the app root, so real
  page-load performance shows up in the Vercel dashboard's Speed Insights tab.

## 1.043 — 2026-07-26 · *Bug fix*
**Fixed the Mobile Locator link from the email**
- Opening the emailed Mobile Locator link failed with "Failed to load meters"
  (or bounced to the login screen). The link is meant to be used in the field
  without logging in, but the meter endpoints required a logged-in user.
- The emailed link now carries a secure access token, valid for 30 days, which
  the app presents when loading meters and saving a location — the same
  mechanism the customer view already uses. Requests without a valid token are
  still refused.
- Links sent before this fix won't work; send a fresh one from the project.

## 1.042 — 2026-07-26 · *Updated feature*
**"Find border valves" now finds single valves sitting on a DMA border**
- It previously only flagged a valve when a *second* valve from the neighbouring
  DMA sat right next to it. Shared borders are very often isolated by one valve,
  so those DMAs returned nothing even though the boundary valve was there. A
  valve within range of two different DMA boundaries is now flagged on its own.
- Checked against a real 9-DMA project with 6,324 valves: findings went from 28
  to 173 and DMA coverage from 5 to 7 of 9 at a 60 m distance.
- Reminder: the search distance is the "Isolation Valve Distance" slider in
  Project Settings — raise it if a border is still missed.

## 1.041 — 2026-07-26 · *Updated feature*
**DMA settings is now a floating, draggable panel**
- The DMA configuration dialog (name, colour, transparency, boundary align) is
  no longer a blocking modal — it's a floating panel you can drag by its header,
  so the map and the polygon you just drew stay visible while you set it up.
  Sized to its content and capped to the viewport, with the body scrolling.

## 1.040 — 2026-07-26 · *Updated feature*
**Consumption charts colour-coded: main blue, sub-meters green**
- Meter consumption chart: the line is blue for main and insertion meters, green
  for sub-meters.
- DMA consumption chart: the main meter series is now blue and the sub-meters
  series green (the main series was amber).
- Applies to the line, bar and monthly views, including axis labels.

## 1.039 — 2026-07-26 · *Updated feature*
**Distance settings are now drag sliders (0–500 ft, default 100 ft)**
- "Boundary Deviation Distance" (DMA Focus) and "Isolation Valve Distance"
  (Isolation Points) are now sliders you drag with the mouse, with the value
  shown live beside them, instead of typed number boxes.
- Range 0–500 ft, default 100 ft. Metric projects show the isolation slider in
  metres over the equivalent 0–150 m range, defaulting to 30 m (the same
  distance as 100 ft).
- Existing projects keep whatever distance they were already set to — only the
  default for new projects changed.

## 1.038 — 2026-07-26 · *Updated feature*
**Removed the zero-value / spike shading from the consumption chart**
- The amber "Zero values" and purple "high spikes" shaded areas (and their
  legend) are gone from the consumption chart. They were the remaining part of
  Data Completion, kept back in 1.034.

## 1.037 — 2026-07-25 · *New feature*
**Pull a layer's style from the dashboard component defaults**
- When editing a layer that matches a component type configured in dashboard
  Settings (Main, Sub Main, Insertion Meters, Ultrasonic Meter, Valves), the
  layer settings now offer an **Apply** button that pulls that type's shape,
  size, fill and colours in, overwriting the layer's current style. Nothing is
  saved until you press Save, so you can still adjust or cancel.
- The prompt follows the layer's current name/category, so changing the category
  in the dialog updates which defaults are offered.

## 1.036 — 2026-07-25 · *Updated feature*
**Version number moved to the bottom of the side menu**
- The version now sits at the bottom of the side menu, below the lock control
  and separated by a divider, shown as "Ver 1.036" — instead of under the logo.
  Applied to both the dashboard and project side menus, and it stays readable
  when the menu is collapsed.

## 1.035 — 2026-07-25 · *Updated feature*
**Layer reordering is disabled on locked projects**
- Layers can no longer be dragged to change their map z-order while a project is
  locked. Previously the drag still ran and simply did nothing on drop; now the
  row isn't draggable at all and the handle is dimmed with a tooltip explaining
  why.

## 1.034 — 2026-07-25 · *Updated feature*
**Removed the Data Completion feature**
- Removed Data Completion everywhere: the wand button and estimated-values line
  on the meter consumption chart, its results panel, and the "Data Completion →
  Nearby Meter Radius" project setting. The `calculateConsumptionCompletion`
  Edge Function was deleted from the repo too.
- Kept the chart's data-quality highlighting (blank readings, and zero values
  followed by a spike) — those markers stand on their own and aren't part of
  the removed feature.

## 1.033 — 2026-07-25 · *Updated feature*
**Map legend renamed to "Legend" and rolls up smoothly when closed**
- The map legend panel is now titled **Legend** (was "Map Layers").
- Collapsing it now rolls up with a smooth animation instead of vanishing, and
  the header tightens as it closes. Applied to both the project map and the
  customer view.

## 1.032 — 2026-07-25 · *Bug fix*
**Fixed layer category dropdown not opening (regression from 1.029)**
- The category dropdown in layer settings appeared not to open. Making that
  dialog a floating panel in 1.029 put it above the dropdown's own layer, so the
  menu was opening behind the panel. It now opens on top again.

## 1.031 — 2026-07-25 · *Updated feature*
**Dashboard "Projects" icon now matches the project page**
- The Projects item in the dashboard sidebar uses the same grid icon as the
  "back to projects" button inside a project, so one glyph means "projects"
  throughout the app (was a folder icon).

## 1.030 — 2026-07-25 · *Updated feature*
**Project loading shows the LeakZon logo filling with water**
- Opening a project now shows the LeakZon wordmark slowly filling with water
  instead of a spinning circle. The logo's own transparency is used as a mask,
  so the water is clipped to the letters and it works on light and dark
  backgrounds. Honours "reduce motion" and keeps a screen-reader label.

## 1.029 — 2026-07-25 · *Updated feature*
**Layer settings is now a floating, draggable panel**
- The layer settings dialog is no longer a blocking modal — it's a floating
  panel you can drag by its header (same behaviour as the onboarding wizard), so
  the map stays visible and usable while you restyle a layer.
- The frame now fits its content: sized to the widest element (the colour
  palette) instead of a fixed modal width, capped to the viewport, with the body
  scrolling and the header/footer pinned — so nothing is clipped.

## 1.028 — 2026-07-25 · *Bug fix*
**Fixed black screen when turning point numbering on (regression from 1.025)**
- Turning on point numbering crashed the app to a blank screen. The 1.025
  numbering rewrite accidentally removed three helper functions that the
  point-building code still called (`isMeterLayerVisible`,
  `extractUltrasonicPoints`, `isUltrasonicLayer`), so it threw immediately.
  Restored them; numbering order from 1.025 is unchanged.
- Also fixed a second crash found while verifying this: the latitude range was
  computed with `Math.max(...lats)`, which overflows the call stack on layers
  contributing a lot of points. Now uses a plain loop (verified with 200k points).

## 1.027 — 2026-07-25 · *New feature*
**Configurable isolation valve distance for "Find border valves"**
- New **Isolation Points → Isolation Valve Distance** setting in Project
  Settings: how close two valves on opposite sides of a DMA boundary must be to
  count as a candidate isolation point. It drives the DMA panel's "Find border
  valves" highlight, so you can widen or tighten the search per project.
- Shown in the project's own distance unit and defaults accordingly —
  **60 m** for metric projects, **200 ft** for imperial ones. Stored in metres,
  so switching the project's distance unit re-labels the value without changing
  the actual distance.

## 1.026 — 2026-07-25 · *New feature*
**White & black shape colors, plus a separate outline color**
- Added **white** and **black** to the color palette, and unified it: the same
  palette is now used by the project layer settings and the dashboard component
  defaults (Settings).
- Shapes can now have **one color for the shape and a different color for the
  outline** — e.g. a white shape with a dark outline so it stays visible on any
  basemap. Set it in the layer settings ("Outline color") and per component type
  in dashboard Settings; "Same as shape" clears it. Leaving it unset keeps the
  previous single-color behavior, so existing layers look unchanged.
- The outline color is honored everywhere a point is drawn: the map, the layers
  panel swatch, the map legend, and the customer view.

## 1.025 — 2026-07-25 · *Bug fix*
**Fixed point numbering running right-to-left**
- Numbering now genuinely reads left-to-right, top-to-bottom. The row grouping
  capped its band at 60 m, so on real projects spanning kilometres every point
  became its own "row" and the order collapsed to pure north-south, ignoring
  left-to-right entirely. Rows are now fixed horizontal stripes (about √n of
  them), ordered north-first and left-to-right within each stripe — verified
  against real project data and against horizontal-line, vertical-line and grid
  layouts.
- Badges in a tight cluster now also read left-to-right: the lower number takes
  the left slot instead of being nudged right (which read as "2 1").

## 1.024 — 2026-07-25 · *Updated feature*
**Focused-DMA numbering keeps each point's global number**
- Point numbers stay numbered across all points (as if every DMA were visible),
  so a point keeps the same number whether or not a DMA is focused — focusing a
  DMA only hides the numbers that don't belong to it, instead of renumbering the
  remainder 1..N.

## 1.023 — 2026-07-25 · *New feature*
**Point numbers limited to the focused DMA when zooming to a DMA**
- With a DMA focused ("Zoom DMA on map"), point numbering now shows only the
  points belonging to that DMA — inside its polygon or within the project's
  boundary-deviation proximity, plus the DMA's linked main meter even if it sits
  further out. All other numbers are hidden. Clearing the focus restores the
  full set.

## 1.022 — 2026-07-25 · *Updated feature*
**Map layer z-order now follows the panel exactly; DMAs always at the bottom**
- DMA polygons now always render **beneath every layer** (they previously drew on
  top, shading the layers above them). DMA name labels stay on top so they remain
  readable.
- Map z-order now matches the layers panel exactly, top to bottom. Previously
  meter (data) layers were forced above all shapefile layers, which silently
  overrode manual ordering — dragging a shapefile layer above a meter layer had
  no effect and the panel re-grouped after the drop.
- **Dragging a layer in the panel now really changes its z-order**, and
  **hide/unhide only changes visibility, never the order** — unhiding a layer no
  longer makes it jump to the top. Each layer draws into its own dedicated
  Leaflet pane, so stacking is explicit instead of depending on load order.

## 1.021 — 2026-07-25 · *Bug fix*
**Fixed "LeakZon" users seeing no projects (global-access authorization)**
- The RLS/authorization rules only granted global project access to "Admin" and
  "Super User", not "LeakZon" — so LeakZon users (the platform-owner type, and
  the default) saw "No Projects yet." Added LeakZon to the privileged set in
  both the database RLS function and the Edge Function auth helper (backend
  migration + Edge Function redeploy). Affected users should log out and back
  in to pick up the change.

## 1.020 — 2026-07-25 · *New feature*
**Sort projects on the dashboard (name / last used / progress, both directions)**
- Added a sort control to the projects dashboard: sort by name (A–Z / Z–A),
  last used (newest / oldest), or progress % — the assigned-meters percentage
  from the card gauge — high→low or low→high. Defaults to last used (newest).

## 1.019 — 2026-07-25 · *New feature + Updated feature*
**DMA panel: "Find border valves" highlight; removed "Isolation DMA View"**
- Removed the "Isolation DMA View" toggle from the DMA panel.
- Added "Find border valves" in the isolation-points section: it highlights
  valves sitting at borders between two DMAs (pairs of valves close to each
  other but on opposite sides of a shared boundary) — the likely isolation
  valves — to speed up marking them as isolated points. Needs at least two DMAs
  and a valve layer.

## 1.018 — 2026-07-25 · *New feature*
**Prompt to mark "Design Network Flow" done when leaving the view after changes**
- If you make changes in the Network Design view and then switch to another view
  while the onboarding wizard's "Design Network Flow" step isn't marked done yet,
  a dialog now asks whether you're finished and offers to mark that step as done.
  Choosing "Not yet" won't nag again until you make further changes.

## 1.017 — 2026-07-25 · *Updated feature*
**Changelog now has a one-line headline per version**
- versions.md entries now begin with a bold headline that sums up the main
  change, followed by the detailed bullets (same details as before). Existing
  entries were updated to the new format.

## 1.016 — 2026-07-25 · *Bug fix*
**Fixed project lock/unlock not saving**
- Fixed project lock/unlock not working: the toggle wrote a `locked_by_name`
  field that isn't a real column (the schema uses `locked_by_id`), so the whole
  update was rejected and the lock never saved. Now writes `locked_by_id`,
  resolves the locker's name via a join for the "Locked by …" label, and shows
  an error if a project update fails instead of silently doing nothing.

## 1.015 — 2026-07-25 · *Updated feature*
**Dashboard: Settings moved to sidebar bottom; lock icon by the DMA count**
- Dashboard: moved Settings to the bottom of the sidebar (just above the lock
  control) and switched it to the standard gear icon.
- Project cards: the "locked" indicator now appears inline just before the
  "N DMAs" count (instead of the top-left corner), shown to everyone.

## 1.014 — 2026-07-25 · *New feature*
**Default shape / size / color per component type (dashboard Settings)**
- New **Settings** area in the main dashboard (admins): set the default shape,
  size and color for each component type — Main, Sub Main, Insertion Meters,
  Ultrasonic Meter, and Valves. These defaults are applied automatically to new
  layers when you import them (single or ZIP) or create them manually. Existing
  layers aren't changed; settings are saved per browser.

## 1.013 — 2026-07-25 · *Updated feature*
**A main meter can serve more than one DMA**
- A main meter (any type) can now be assigned to **more than one DMA** — e.g.
  one meter serving both "North" and "North Central". Assigning a main meter to
  a DMA no longer unlinks it from other DMAs, and the insertion-meter list /
  network inventory now show all DMAs a shared meter serves.

## 1.012 — 2026-07-25 · *Updated feature*
**New application icon**
- New application icon (favicon, browser tab, apple-touch-icon, and PWA/
  home-screen icon) using the LeakZon map-pin logo.

## 1.011 — 2026-07-24 · *New feature + Updated feature*
**Extend share links, in-app changelog, faster carbon-copy upload**
- Customer view links can now be **extended**: a calendar-plus button on each
  active (or expired) link adds the chosen number of days to its expiry —
  extending an expired link reactivates it.
- Added a **Changelog ("What's New")** panel at the top of Version Updates that
  shows this file, so you can see recent changes and the current version.
- **Carbon copy uploads are much faster**: large overlay images are downscaled
  and compressed client-side before upload (no visible difference on the map).

## 1.010 — 2026-07-24 · *Updated feature*
**Project export/import now includes customer annotations**
- Project export/import now includes **customer annotations** (customer-view
  comments/arrows/drawings) — previously they were left out of export, restore,
  and duplicate, and weren't cleared on an overwrite-import. Applies to the
  exportProjectData and importProjectData Edge Functions (requires an Edge
  Function deploy, separate from the Vercel frontend deploy).

## 1.009 — 2026-07-24 · *Updated feature*
**Point-number default color is now red**
- Point numbering default color is now red (#ef4444) with white text. Saved
  styles still on the old default are migrated to red (users who explicitly
  chose another color keep theirs).

## 1.008 — 2026-07-24 · *Bug fix + New feature*
**Point-number ordering fix + size/color controls**
- Point numbering: order now reads cleanly left-to-right, top-to-bottom — rows
  are grouped by comparing each point to the previous one (rolling reference),
  so a row with gradual vertical spread stays together instead of splitting.
- Added a "Number Style" control (palette icon in the map toolbar, shown when
  numbering is on): change badge size (slider) and color (16 colors), applied
  to all numbers or only selected ones. Click a number on the map to select it.
  Settings persist per project and also apply in the customer view.

## 1.007 — 2026-07-24 · *Bug fix*
**Meter-type shapefile imports now create meter rows**
- Importing a meter-type layer (Main / Insertion / Ultrasonic Meters) as a
  shapefile/GeoJSON now also creates `is_main` meter rows from its point
  features — previously the shapefile import only created a display layer, so
  those meters never appeared in the meter table, network inventory, DMA
  main-meter linking, or point numbering. Applied to both the single-layer and
  multi-layer (ZIP) import paths in UploadData and UploadLayerDialog.

## 1.006 — 2026-07-24 · *Updated feature*
**Faster layer deletion**
- Made layer deletion much faster: removed an explicit consumption_reading
  delete that scanned all of a project's readings (by source_file_url) on every
  layer delete — even boundary/shp layers with no meters. Readings are already
  removed via the ON DELETE CASCADE on consumption_reading.meter_id when the
  layer's meters are deleted, so the extra scan was redundant and slow.

## 1.005 — 2026-07-24 · *Bug fix*
**Fixed data loss when deleting a layer that shares a file**
- Fixed a data-loss bug in layer deletion: deleting a layer removed meters by
  `source_file_url`, but two layers imported from the same file (e.g. a "Main"
  and a "Sub" meters layer from one CSV) share that URL, so deleting one wiped
  the other's meters too. Meters are now deleted by `layer_id` (precise), and
  by `source_file_url` only when no other layer shares that file.

## 1.004 — 2026-07-24 · *Bug fix*
**Fixed layer deletion failing on layers with >1000 meters**
- Fixed layer deletion still failing on layers with many meters
  ("violates foreign key constraint meter_layer_id_fkey"): the previous fix
  collected meter ids via a read that PostgREST caps at 1000 rows, so layers
  with >1000 meters left rows behind and stayed undeletable. Now deletes
  meters by filter in a loop until none remain, and unlinks affected DMAs from
  the DMA side so it's never limited by the meter read cap.

## 1.003 — 2026-07-24 · *Bug fix*
**Fixed silent layer-delete failures (foreign-key references)**
- Fixed deleting a layer silently failing (e.g. the Ultrasonic layer): a layer
  can't be deleted while `meter.layer_id` or `isolated_point.layer_id` rows
  reference it, and its meters may be referenced by `dma.main_meter_id`. Delete
  now unwinds those references first (unlink DMAs, remove isolated points and
  meters) regardless of layer type, then deletes the layer and surfaces any
  error. Previously it deleted the layer first and only cleaned up meters for
  `data`-type layers, so manual meter layers (type `shp`) never deleted.

## 1.002 — 2026-07-24 · *Bug fix*
**Fixed "No DMAs with a valid polygon to export"**
- Fixed "No DMAs with a valid polygon to export" on the SHP/JSON export page:
  `parsePolygon` only checked `dma.polygon`, but the export page loads DMAs
  straight from the table where the column is `polygon_json` — so every DMA
  was wrongly filtered out. Now reads `polygon_json` (falling back to
  `polygon`), which also corrects the polygon data in the JSON export.

## 1.001 — 2026-07-24 · *Bug fix*
**Fixed meter duplication on save + silent SHP export**
- Fixed manual meter layers (Insertion/Ultrasonic) duplicating points on save:
  the delete was blocked by the `dma.main_meter_id` foreign key when a DMA
  referenced one of the meters. Now unlinks affected DMAs, deletes, re-inserts,
  and re-links each DMA to its recreated main meter.
- Fixed the "Export SHP" button silently doing nothing: added error surfacing
  (it previously swallowed Edge Function errors) and made the download robust
  for the after-`await` case that some browsers block.

## 1.000 — 2026-07-24 · *New feature*
**Introduced the version number and this changelog**
- Introduced the version number (shown in small text under the logo, upper-left)
  and this changelog.
