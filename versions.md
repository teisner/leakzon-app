# LeakZon — Version History

Version format: `1.NNN` (three digits after the dot). Every change bumps the
version by `0.001` and adds an entry here (newest first). Each entry starts with
a one-line **headline** summarizing the main change, followed by the detailed
notes. The current version is defined in `src/lib/version.js` and shown under
the logo in the app.

## 1.039 — 2026-07-26
**Distance settings are now drag sliders (0–500 ft, default 100 ft)**
- "Boundary Deviation Distance" (DMA Focus) and "Isolation Valve Distance"
  (Isolation Points) are now sliders you drag with the mouse, with the value
  shown live beside them, instead of typed number boxes.
- Range 0–500 ft, default 100 ft. Metric projects show the isolation slider in
  metres over the equivalent 0–150 m range, defaulting to 30 m (the same
  distance as 100 ft).
- Existing projects keep whatever distance they were already set to — only the
  default for new projects changed.

## 1.038 — 2026-07-26
**Removed the zero-value / spike shading from the consumption chart**
- The amber "Zero values" and purple "high spikes" shaded areas (and their
  legend) are gone from the consumption chart. They were the remaining part of
  Data Completion, kept back in 1.034.

## 1.037 — 2026-07-25
**Pull a layer's style from the dashboard component defaults**
- When editing a layer that matches a component type configured in dashboard
  Settings (Main, Sub Main, Insertion Meters, Ultrasonic Meter, Valves), the
  layer settings now offer an **Apply** button that pulls that type's shape,
  size, fill and colours in, overwriting the layer's current style. Nothing is
  saved until you press Save, so you can still adjust or cancel.
- The prompt follows the layer's current name/category, so changing the category
  in the dialog updates which defaults are offered.

## 1.036 — 2026-07-25
**Version number moved to the bottom of the side menu**
- The version now sits at the bottom of the side menu, below the lock control
  and separated by a divider, shown as "Ver 1.036" — instead of under the logo.
  Applied to both the dashboard and project side menus, and it stays readable
  when the menu is collapsed.

## 1.035 — 2026-07-25
**Layer reordering is disabled on locked projects**
- Layers can no longer be dragged to change their map z-order while a project is
  locked. Previously the drag still ran and simply did nothing on drop; now the
  row isn't draggable at all and the handle is dimmed with a tooltip explaining
  why.

## 1.034 — 2026-07-25
**Removed the Data Completion feature**
- Removed Data Completion everywhere: the wand button and estimated-values line
  on the meter consumption chart, its results panel, and the "Data Completion →
  Nearby Meter Radius" project setting. The `calculateConsumptionCompletion`
  Edge Function was deleted from the repo too.
- Kept the chart's data-quality highlighting (blank readings, and zero values
  followed by a spike) — those markers stand on their own and aren't part of
  the removed feature.

## 1.033 — 2026-07-25
**Map legend renamed to "Legend" and rolls up smoothly when closed**
- The map legend panel is now titled **Legend** (was "Map Layers").
- Collapsing it now rolls up with a smooth animation instead of vanishing, and
  the header tightens as it closes. Applied to both the project map and the
  customer view.

## 1.032 — 2026-07-25
**Fixed layer category dropdown not opening (regression from 1.029)**
- The category dropdown in layer settings appeared not to open. Making that
  dialog a floating panel in 1.029 put it above the dropdown's own layer, so the
  menu was opening behind the panel. It now opens on top again.

## 1.031 — 2026-07-25
**Dashboard "Projects" icon now matches the project page**
- The Projects item in the dashboard sidebar uses the same grid icon as the
  "back to projects" button inside a project, so one glyph means "projects"
  throughout the app (was a folder icon).

## 1.030 — 2026-07-25
**Project loading shows the LeakZon logo filling with water**
- Opening a project now shows the LeakZon wordmark slowly filling with water
  instead of a spinning circle. The logo's own transparency is used as a mask,
  so the water is clipped to the letters and it works on light and dark
  backgrounds. Honours "reduce motion" and keeps a screen-reader label.

## 1.029 — 2026-07-25
**Layer settings is now a floating, draggable panel**
- The layer settings dialog is no longer a blocking modal — it's a floating
  panel you can drag by its header (same behaviour as the onboarding wizard), so
  the map stays visible and usable while you restyle a layer.
- The frame now fits its content: sized to the widest element (the colour
  palette) instead of a fixed modal width, capped to the viewport, with the body
  scrolling and the header/footer pinned — so nothing is clipped.

## 1.028 — 2026-07-25
**Fixed black screen when turning point numbering on (regression from 1.025)**
- Turning on point numbering crashed the app to a blank screen. The 1.025
  numbering rewrite accidentally removed three helper functions that the
  point-building code still called (`isMeterLayerVisible`,
  `extractUltrasonicPoints`, `isUltrasonicLayer`), so it threw immediately.
  Restored them; numbering order from 1.025 is unchanged.
- Also fixed a second crash found while verifying this: the latitude range was
  computed with `Math.max(...lats)`, which overflows the call stack on layers
  contributing a lot of points. Now uses a plain loop (verified with 200k points).

## 1.027 — 2026-07-25
**Configurable isolation valve distance for "Find border valves"**
- New **Isolation Points → Isolation Valve Distance** setting in Project
  Settings: how close two valves on opposite sides of a DMA boundary must be to
  count as a candidate isolation point. It drives the DMA panel's "Find border
  valves" highlight, so you can widen or tighten the search per project.
- Shown in the project's own distance unit and defaults accordingly —
  **60 m** for metric projects, **200 ft** for imperial ones. Stored in metres,
  so switching the project's distance unit re-labels the value without changing
  the actual distance.

## 1.026 — 2026-07-25
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

## 1.025 — 2026-07-25
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

## 1.024 — 2026-07-25
**Focused-DMA numbering keeps each point's global number**
- Point numbers stay numbered across all points (as if every DMA were visible),
  so a point keeps the same number whether or not a DMA is focused — focusing a
  DMA only hides the numbers that don't belong to it, instead of renumbering the
  remainder 1..N.

## 1.023 — 2026-07-25
**Point numbers limited to the focused DMA when zooming to a DMA**
- With a DMA focused ("Zoom DMA on map"), point numbering now shows only the
  points belonging to that DMA — inside its polygon or within the project's
  boundary-deviation proximity, plus the DMA's linked main meter even if it sits
  further out. All other numbers are hidden. Clearing the focus restores the
  full set.

## 1.022 — 2026-07-25
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

## 1.021 — 2026-07-25
**Fixed "LeakZon" users seeing no projects (global-access authorization)**
- The RLS/authorization rules only granted global project access to "Admin" and
  "Super User", not "LeakZon" — so LeakZon users (the platform-owner type, and
  the default) saw "No Projects yet." Added LeakZon to the privileged set in
  both the database RLS function and the Edge Function auth helper (backend
  migration + Edge Function redeploy). Affected users should log out and back
  in to pick up the change.

## 1.020 — 2026-07-25
**Sort projects on the dashboard (name / last used / progress, both directions)**
- Added a sort control to the projects dashboard: sort by name (A–Z / Z–A),
  last used (newest / oldest), or progress % — the assigned-meters percentage
  from the card gauge — high→low or low→high. Defaults to last used (newest).

## 1.019 — 2026-07-25
**DMA panel: "Find border valves" highlight; removed "Isolation DMA View"**
- Removed the "Isolation DMA View" toggle from the DMA panel.
- Added "Find border valves" in the isolation-points section: it highlights
  valves sitting at borders between two DMAs (pairs of valves close to each
  other but on opposite sides of a shared boundary) — the likely isolation
  valves — to speed up marking them as isolated points. Needs at least two DMAs
  and a valve layer.

## 1.018 — 2026-07-25
**Prompt to mark "Design Network Flow" done when leaving the view after changes**
- If you make changes in the Network Design view and then switch to another view
  while the onboarding wizard's "Design Network Flow" step isn't marked done yet,
  a dialog now asks whether you're finished and offers to mark that step as done.
  Choosing "Not yet" won't nag again until you make further changes.

## 1.017 — 2026-07-25
**Changelog now has a one-line headline per version**
- versions.md entries now begin with a bold headline that sums up the main
  change, followed by the detailed bullets (same details as before). Existing
  entries were updated to the new format.

## 1.016 — 2026-07-25
**Fixed project lock/unlock not saving**
- Fixed project lock/unlock not working: the toggle wrote a `locked_by_name`
  field that isn't a real column (the schema uses `locked_by_id`), so the whole
  update was rejected and the lock never saved. Now writes `locked_by_id`,
  resolves the locker's name via a join for the "Locked by …" label, and shows
  an error if a project update fails instead of silently doing nothing.

## 1.015 — 2026-07-25
**Dashboard: Settings moved to sidebar bottom; lock icon by the DMA count**
- Dashboard: moved Settings to the bottom of the sidebar (just above the lock
  control) and switched it to the standard gear icon.
- Project cards: the "locked" indicator now appears inline just before the
  "N DMAs" count (instead of the top-left corner), shown to everyone.

## 1.014 — 2026-07-25
**Default shape / size / color per component type (dashboard Settings)**
- New **Settings** area in the main dashboard (admins): set the default shape,
  size and color for each component type — Main, Sub Main, Insertion Meters,
  Ultrasonic Meter, and Valves. These defaults are applied automatically to new
  layers when you import them (single or ZIP) or create them manually. Existing
  layers aren't changed; settings are saved per browser.

## 1.013 — 2026-07-25
**A main meter can serve more than one DMA**
- A main meter (any type) can now be assigned to **more than one DMA** — e.g.
  one meter serving both "North" and "North Central". Assigning a main meter to
  a DMA no longer unlinks it from other DMAs, and the insertion-meter list /
  network inventory now show all DMAs a shared meter serves.

## 1.012 — 2026-07-25
**New application icon**
- New application icon (favicon, browser tab, apple-touch-icon, and PWA/
  home-screen icon) using the LeakZon map-pin logo.

## 1.011 — 2026-07-24
**Extend share links, in-app changelog, faster carbon-copy upload**
- Customer view links can now be **extended**: a calendar-plus button on each
  active (or expired) link adds the chosen number of days to its expiry —
  extending an expired link reactivates it.
- Added a **Changelog ("What's New")** panel at the top of Version Updates that
  shows this file, so you can see recent changes and the current version.
- **Carbon copy uploads are much faster**: large overlay images are downscaled
  and compressed client-side before upload (no visible difference on the map).

## 1.010 — 2026-07-24
**Project export/import now includes customer annotations**
- Project export/import now includes **customer annotations** (customer-view
  comments/arrows/drawings) — previously they were left out of export, restore,
  and duplicate, and weren't cleared on an overwrite-import. Applies to the
  exportProjectData and importProjectData Edge Functions (requires an Edge
  Function deploy, separate from the Vercel frontend deploy).

## 1.009 — 2026-07-24
**Point-number default color is now red**
- Point numbering default color is now red (#ef4444) with white text. Saved
  styles still on the old default are migrated to red (users who explicitly
  chose another color keep theirs).

## 1.008 — 2026-07-24
**Point-number ordering fix + size/color controls**
- Point numbering: order now reads cleanly left-to-right, top-to-bottom — rows
  are grouped by comparing each point to the previous one (rolling reference),
  so a row with gradual vertical spread stays together instead of splitting.
- Added a "Number Style" control (palette icon in the map toolbar, shown when
  numbering is on): change badge size (slider) and color (16 colors), applied
  to all numbers or only selected ones. Click a number on the map to select it.
  Settings persist per project and also apply in the customer view.

## 1.007 — 2026-07-24
**Meter-type shapefile imports now create meter rows**
- Importing a meter-type layer (Main / Insertion / Ultrasonic Meters) as a
  shapefile/GeoJSON now also creates `is_main` meter rows from its point
  features — previously the shapefile import only created a display layer, so
  those meters never appeared in the meter table, network inventory, DMA
  main-meter linking, or point numbering. Applied to both the single-layer and
  multi-layer (ZIP) import paths in UploadData and UploadLayerDialog.

## 1.006 — 2026-07-24
**Faster layer deletion**
- Made layer deletion much faster: removed an explicit consumption_reading
  delete that scanned all of a project's readings (by source_file_url) on every
  layer delete — even boundary/shp layers with no meters. Readings are already
  removed via the ON DELETE CASCADE on consumption_reading.meter_id when the
  layer's meters are deleted, so the extra scan was redundant and slow.

## 1.005 — 2026-07-24
**Fixed data loss when deleting a layer that shares a file**
- Fixed a data-loss bug in layer deletion: deleting a layer removed meters by
  `source_file_url`, but two layers imported from the same file (e.g. a "Main"
  and a "Sub" meters layer from one CSV) share that URL, so deleting one wiped
  the other's meters too. Meters are now deleted by `layer_id` (precise), and
  by `source_file_url` only when no other layer shares that file.

## 1.004 — 2026-07-24
**Fixed layer deletion failing on layers with >1000 meters**
- Fixed layer deletion still failing on layers with many meters
  ("violates foreign key constraint meter_layer_id_fkey"): the previous fix
  collected meter ids via a read that PostgREST caps at 1000 rows, so layers
  with >1000 meters left rows behind and stayed undeletable. Now deletes
  meters by filter in a loop until none remain, and unlinks affected DMAs from
  the DMA side so it's never limited by the meter read cap.

## 1.003 — 2026-07-24
**Fixed silent layer-delete failures (foreign-key references)**
- Fixed deleting a layer silently failing (e.g. the Ultrasonic layer): a layer
  can't be deleted while `meter.layer_id` or `isolated_point.layer_id` rows
  reference it, and its meters may be referenced by `dma.main_meter_id`. Delete
  now unwinds those references first (unlink DMAs, remove isolated points and
  meters) regardless of layer type, then deletes the layer and surfaces any
  error. Previously it deleted the layer first and only cleaned up meters for
  `data`-type layers, so manual meter layers (type `shp`) never deleted.

## 1.002 — 2026-07-24
**Fixed "No DMAs with a valid polygon to export"**
- Fixed "No DMAs with a valid polygon to export" on the SHP/JSON export page:
  `parsePolygon` only checked `dma.polygon`, but the export page loads DMAs
  straight from the table where the column is `polygon_json` — so every DMA
  was wrongly filtered out. Now reads `polygon_json` (falling back to
  `polygon`), which also corrects the polygon data in the JSON export.

## 1.001 — 2026-07-24
**Fixed meter duplication on save + silent SHP export**
- Fixed manual meter layers (Insertion/Ultrasonic) duplicating points on save:
  the delete was blocked by the `dma.main_meter_id` foreign key when a DMA
  referenced one of the meters. Now unlinks affected DMAs, deletes, re-inserts,
  and re-links each DMA to its recreated main meter.
- Fixed the "Export SHP" button silently doing nothing: added error surfacing
  (it previously swallowed Edge Function errors) and made the download robust
  for the after-`await` case that some browsers block.

## 1.000 — 2026-07-24
**Introduced the version number and this changelog**
- Introduced the version number (shown in small text under the logo, upper-left)
  and this changelog.
