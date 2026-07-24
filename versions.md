# LeakZon — Version History

Version format: `1.NNN` (three digits after the dot). Every change bumps the
version by `0.001` and adds an entry here (newest first). The current version
is defined in `src/lib/version.js` and shown under the logo in the app.

## 1.008 — 2026-07-24
- Point numbering: order now reads cleanly left-to-right, top-to-bottom — rows
  are grouped by comparing each point to the previous one (rolling reference),
  so a row with gradual vertical spread stays together instead of splitting.
- Added a "Number Style" control (palette icon in the map toolbar, shown when
  numbering is on): change badge size (slider) and color (16 colors), applied
  to all numbers or only selected ones. Click a number on the map to select it.
  Settings persist per project and also apply in the customer view.

## 1.007 — 2026-07-24
- Importing a meter-type layer (Main / Insertion / Ultrasonic Meters) as a
  shapefile/GeoJSON now also creates `is_main` meter rows from its point
  features — previously the shapefile import only created a display layer, so
  those meters never appeared in the meter table, network inventory, DMA
  main-meter linking, or point numbering. Applied to both the single-layer and
  multi-layer (ZIP) import paths in UploadData and UploadLayerDialog.

## 1.006 — 2026-07-24
- Made layer deletion much faster: removed an explicit consumption_reading
  delete that scanned all of a project's readings (by source_file_url) on every
  layer delete — even boundary/shp layers with no meters. Readings are already
  removed via the ON DELETE CASCADE on consumption_reading.meter_id when the
  layer's meters are deleted, so the extra scan was redundant and slow.

## 1.005 — 2026-07-24
- Fixed a data-loss bug in layer deletion: deleting a layer removed meters by
  `source_file_url`, but two layers imported from the same file (e.g. a "Main"
  and a "Sub" meters layer from one CSV) share that URL, so deleting one wiped
  the other's meters too. Meters are now deleted by `layer_id` (precise), and
  by `source_file_url` only when no other layer shares that file.

## 1.004 — 2026-07-24
- Fixed layer deletion still failing on layers with many meters
  ("violates foreign key constraint meter_layer_id_fkey"): the previous fix
  collected meter ids via a read that PostgREST caps at 1000 rows, so layers
  with >1000 meters left rows behind and stayed undeletable. Now deletes
  meters by filter in a loop until none remain, and unlinks affected DMAs from
  the DMA side so it's never limited by the meter read cap.

## 1.003 — 2026-07-24
- Fixed deleting a layer silently failing (e.g. the Ultrasonic layer): a layer
  can't be deleted while `meter.layer_id` or `isolated_point.layer_id` rows
  reference it, and its meters may be referenced by `dma.main_meter_id`. Delete
  now unwinds those references first (unlink DMAs, remove isolated points and
  meters) regardless of layer type, then deletes the layer and surfaces any
  error. Previously it deleted the layer first and only cleaned up meters for
  `data`-type layers, so manual meter layers (type `shp`) never deleted.

## 1.002 — 2026-07-24
- Fixed "No DMAs with a valid polygon to export" on the SHP/JSON export page:
  `parsePolygon` only checked `dma.polygon`, but the export page loads DMAs
  straight from the table where the column is `polygon_json` — so every DMA
  was wrongly filtered out. Now reads `polygon_json` (falling back to
  `polygon`), which also corrects the polygon data in the JSON export.

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
