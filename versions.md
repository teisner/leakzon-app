# LeakZon — Version History

Version format: `1.NNN` (three digits after the dot). Every change bumps the
version by `0.001` and adds an entry here (newest first). The current version
is defined in `src/lib/version.js` and shown under the logo in the app.

## 1.001 — 2026-07-24
- Fixed manual meter layers (Insertion/Ultrasonic) duplicating points on save:
  the delete was blocked by the `dma.main_meter_id` foreign key when a DMA
  referenced one of the meters. Now unlinks affected DMAs, deletes, re-inserts,
  and re-links each DMA to its recreated main meter.
- Fixed the "Export SHP" button silently doing nothing: added error surfacing
  (it previously swallowed Edge Function errors) and made the download robust
  for the after-`await` case that some browsers block.

## 1.000 — 2026-07-24
- Introduced the version number (shown in small text under the logo, upper-left)
  and this changelog.
