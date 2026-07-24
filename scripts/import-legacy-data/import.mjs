// One-time import of Base44's per-entity CSV exports into the new Supabase
// schema (Phase 1 of the migration plan). Run once against a fresh schema:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run import
//
// Notes on deliberate choices:
//  - Base44 ids are 24-char hex strings, not uuids, and every entity in this
//    schema uses uuid primary keys — so every row gets a freshly generated
//    uuid, and an in-memory old-id -> new-uuid map (namespaced per entity
//    type) resolves foreign keys as later entities are imported.
//  - SystemUser.password_hash from Base44 is a static-salt SHA-256 hash, not
//    a bcrypt hash — it is NOT carried over (would never match
//    bcrypt.compare regardless). Every imported user starts with
//    password_hash = null and must set a fresh PIN via the setPassword
//    action on first login. This is intentional, not an oversight: it's the
//    same hardening decision that removed the admin master-password
//    backdoor from auth-login.
//  - Meter and ConsumptionReading are not imported here (exports weren't
//    available yet) — Dma.main_meter_id is left null and backfilled once
//    those are imported.
//  - Denormalized text-only references (Project.locked_by_name,
//    CustomerViewLink.created_by_name, ProjectProgress.user_name) are
//    resolved best-effort by exact match against system_user.full_name.

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars before running.');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data_export');

function loadCsv(name) {
  const file = path.join(DATA_DIR, `${name}_export.csv`);
  const content = readFileSync(file, 'utf-8');
  return parse(content, { columns: true, skip_empty_lines: true });
}

const idMap = {};
function newId(entityName, oldId) {
  if (!idMap[entityName]) idMap[entityName] = new Map();
  const id = randomUUID();
  idMap[entityName].set(oldId, id);
  return id;
}
function mapId(entityName, oldId) {
  if (!oldId) return null;
  const m = idMap[entityName];
  const v = m ? m.get(oldId) : undefined;
  if (!v) console.warn(`  ! unresolved ${entityName} id referenced: ${oldId}`);
  return v ?? null;
}

// Project references are resolved quietly (no per-row warning) because a
// large, expected chunk of every entity's rows belong to projects that were
// deleted in Base44 at some point but never had their child rows cleaned up
// (confirmed with the user 2026-07-23 — Project_export.csv re-exported
// byte-identical, so it genuinely is the full current project list). Rows
// that don't resolve to a live project are dropped; resolveProjectId's
// caller is responsible for filtering them out and reporting a count.
function resolveProjectId(oldProjectId) {
  return idMap.Project.get(oldProjectId) ?? null;
}
function reportSkipped(label, total, kept) {
  const skipped = total - kept;
  if (skipped > 0) {
    console.log(`  (skipped ${skipped} of ${total} ${label} rows — belong to deleted projects)`);
  }
}

function toBool(v) {
  return v === 'true' || v === true;
}
function toNum(v) {
  return v === '' || v === undefined || v === null ? null : Number(v);
}
function toNullable(v) {
  return v === '' || v === undefined ? null : v;
}
function parseJsonOrNull(v) {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

async function insertBatch(table, rows, batchSize = 500) {
  if (rows.length === 0) {
    console.log(`  (skip) ${table}: no rows`);
    return;
  }
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
  }
  console.log(`  inserted ${rows.length} rows into ${table}`);
}

async function run() {
  console.log('=== LayerType ===');
  const layerTypes = loadCsv('LayerType');
  const layerTypeRows = layerTypes.map((r) => ({
    id: newId('LayerType', r.id),
    name: r.name,
    is_default: toBool(r.is_default),
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('layer_type', layerTypeRows);
  const layerTypeByName = new Map(layerTypeRows.map((r) => [r.name, r.id]));

  console.log('=== Owner ===');
  const owners = loadCsv('Owner');
  const ownerRows = owners.map((r) => ({
    id: newId('Owner', r.id),
    full_name: r.full_name,
    email: r.email,
    phone: toNullable(r.phone),
    role: toNullable(r.role),
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('owner', ownerRows);

  // Reconcile orphaned owner_id references on Project rows: Base44 is a
  // schema-less document DB and never enforced this FK, so several old
  // Owner records were deleted/merged over time while Projects kept
  // pointing at the stale ids. Mapping confirmed with the user 2026-07-23:
  //  - 6a479269ad1a3f1bd055210d ("Oren Haimov") no longer exists as an
  //    Owner at all -> create a new Owner record for him.
  //  - The other three orphaned ids are duplicates of existing owners,
  //    created before Base44's owner list was deduplicated -> alias them
  //    to the real, surviving Owner id instead of creating new rows.
  const OREN_HAIMOV_OLD_ID = '6a479269ad1a3f1bd055210d';
  const orenHaimovId = randomUUID();
  await insertBatch('owner', [
    {
      id: orenHaimovId,
      full_name: 'Oren Haimov',
      // Placeholder — the real Owner record for this id was deleted in
      // Base44 before export, so no email/phone survived. Update this once
      // the real contact info is known.
      email: 'oren.haimov@unknown.leakzon-migration.local',
      phone: null,
      role: null,
    },
  ]);
  idMap.Owner.set(OREN_HAIMOV_OLD_ID, orenHaimovId);

  const REAL_TOMER_EISNER_OLD_ID = '6a46685a7b4da131c91be918';
  const REAL_DAN_WINTER_OLD_ID = '6a46edcba5b20a0ec19acd5b';
  for (const duplicateOldId of [
    '6a4791f1446188eacce59257', // Tomer Eisner duplicate
    '6a479d24c473ec97acdcd1ad', // "Tomer 2" duplicate
    '6a479347b4813984360b7345', // blank/"Village of Robbins" -> confirmed Tomer Eisner
  ]) {
    idMap.Owner.set(duplicateOldId, idMap.Owner.get(REAL_TOMER_EISNER_OLD_ID));
  }
  idMap.Owner.set(
    '6a479224b52dc5ca8405fd47', // Dan Winter duplicate
    idMap.Owner.get(REAL_DAN_WINTER_OLD_ID)
  );

  console.log('=== SystemUser ===');
  const systemUsers = loadCsv('SystemUser');
  const systemUserRows = systemUsers.map((r) => ({
    id: newId('SystemUser', r.id),
    full_name: r.full_name,
    email: r.email,
    phone: toNullable(r.phone),
    country_code: r.country_code || '972',
    country_iso: toNullable(r.country_iso),
    username: r.username,
    user_type: r.user_type || 'LeakZon',
    password_hash: null,
    temp_password_hash: null,
    temp_password_expires: null,
    last_login: toNullable(r.last_login),
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('system_user', systemUserRows);
  const systemUserByName = new Map(systemUserRows.map((r) => [r.full_name, r.id]));

  console.log('=== Project ===');
  const projects = loadCsv('Project');
  const projectRows = projects.map((r) => ({
    id: newId('Project', r.id),
    name: r.name,
    owner_id: mapId('Owner', r.owner_id),
    utility_name: r.utility_name,
    country: r.country,
    city: r.city,
    state: toNullable(r.state),
    latitude: toNum(r.latitude),
    longitude: toNum(r.longitude),
    water_unit: r.water_unit || 'm3',
    distance_unit: r.distance_unit || 'Km',
    date_format: r.date_format || 'EU',
    service_connections: toNum(r.service_connections) ?? 0,
    anomaly_reports_exported: toBool(r.anomaly_reports_exported),
    onboarding_complete: toBool(r.onboarding_complete),
    locked: toBool(r.locked),
    locked_by_id: r.locked_by_name ? (systemUserByName.get(r.locked_by_name) ?? null) : null,
    locked_date: toNullable(r.locked_date),
    archived: toBool(r.archived),
    boundary_deviation_feet: toNum(r.boundary_deviation_feet) ?? 60,
    completion_radius_yards: toNum(r.completion_radius_yards) ?? 500,
    parent_project_name: toNullable(r.parent_project_name),
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('project', projectRows);

  console.log('=== project_assignment (from Project.assigned_user_ids) ===');
  const assignmentRows = [];
  for (const r of projects) {
    const newProjectId = idMap.Project.get(r.id);
    let ids = [];
    try {
      ids = JSON.parse(r.assigned_user_ids || '[]');
    } catch {
      /* ignore malformed */
    }
    for (const oldUserId of ids) {
      const newUserId = mapId('SystemUser', oldUserId);
      if (newUserId) assignmentRows.push({ project_id: newProjectId, system_user_id: newUserId });
    }
  }
  await insertBatch('project_assignment', assignmentRows);

  console.log('=== ProjectLayer ===');
  const projectLayersAll = loadCsv('ProjectLayer');
  const projectLayers = projectLayersAll.filter((r) => resolveProjectId(r.project_id));
  reportSkipped('ProjectLayer', projectLayersAll.length, projectLayers.length);
  const projectLayerRows = projectLayers.map((r) => ({
    id: newId('ProjectLayer', r.id),
    project_id: resolveProjectId(r.project_id),
    name: r.name,
    layer_type_id: r.category ? (layerTypeByName.get(r.category) ?? null) : null,
    layer_type: r.layer_type,
    file_url: r.file_url,
    color: toNullable(r.color),
    icon_url: toNullable(r.icon_url),
    is_manual: toBool(r.is_manual),
    visible: r.visible === '' ? true : toBool(r.visible),
    sort_order: toNum(r.sort_order) ?? 0,
    feature_count: toNum(r.feature_count) ?? 0,
    geometry_types: parseJsonOrNull(r.geometry_types) ?? [],
    properties: parseJsonOrNull(r.properties) ?? [],
    bounds: parseJsonOrNull(r.bounds),
    altitude_field: toNullable(r.altitude_field),
    altitude_source: toNullable(r.altitude_source) || null,
    altitude_unit: toNullable(r.altitude_unit) || null,
    pipe_config: parseJsonOrNull(r.pipe_config),
    point_config: parseJsonOrNull(r.point_config),
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('project_layer', projectLayerRows);

  console.log('=== Dma ===');
  const dmasAll = loadCsv('Dma');
  const dmas = dmasAll.filter((r) => resolveProjectId(r.project_id));
  reportSkipped('Dma', dmasAll.length, dmas.length);
  const dmaRows = dmas.map((r) => ({
    id: newId('Dma', r.id),
    project_id: resolveProjectId(r.project_id),
    name: r.name,
    color: toNullable(r.color),
    transparency: toNum(r.transparency) ?? 0.3,
    polygon_json: parseJsonOrNull(r.polygon) ?? [],
    main_meter_id: null,
    visible: r.visible === '' ? true : toBool(r.visible),
    sort_order: toNum(r.sort_order) ?? 0,
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('dma', dmaRows);
  const dmaByProjectAndName = new Map(dmaRows.map((r) => [`${r.project_id}::${r.name}`, r.id]));

  console.log('=== Meter ===');
  // ConsumptionReading is intentionally skipped (export not available yet —
  // reminder: come back and import it once Meter is confirmed correct).
  // Base44's Meter export has no dma_id column, only the denormalized
  // dma_name text — resolved here against the Dma rows just inserted, keyed
  // by (project, name) since dma names aren't globally unique across
  // projects. `assigned_number` (a per-project meter display number) exists
  // in this export but isn't part of the ported schema — dropped for now.
  const metersAll = loadCsv('Meter');
  const meters = metersAll.filter((r) => resolveProjectId(r.project_id));
  reportSkipped('Meter', metersAll.length, meters.length);
  const meterRows = meters.map((r) => {
    const newProjectId = resolveProjectId(r.project_id);
    const dmaId = r.dma_name ? (dmaByProjectAndName.get(`${newProjectId}::${r.dma_name}`) ?? null) : null;
    return {
      id: newId('Meter', r.id),
      project_id: newProjectId,
      uid: r.uid,
      endpoint_id: toNullable(r.endpoint_id),
      additional_ids: parseJsonOrNull(r.additional_ids) ?? [],
      is_main: toBool(r.is_main),
      payer_name: toNullable(r.payer_name),
      address: toNullable(r.address),
      city: toNullable(r.city),
      state: toNullable(r.state),
      country: toNullable(r.country),
      provider: toNullable(r.provider),
      communication_type: toNullable(r.communication_type),
      diameter: toNum(r.diameter),
      is_active: r.is_active === '' ? null : toBool(r.is_active),
      latitude: toNum(r.latitude),
      longitude: toNum(r.longitude),
      altitude: toNum(r.altitude),
      location_source: toNullable(r.location_source) || null,
      source_file_url: toNullable(r.source_file_url),
      layer_id: mapId('ProjectLayer', r.layer_id),
      dma_id: dmaId,
      created_at: r.created_date,
      updated_at: r.updated_date,
    };
  });
  await insertBatch('meter', meterRows, 2000);

  console.log('=== Backfilling Dma.main_meter_id ===');
  const mainMeterUpdates = dmas
    .map((r) => ({
      dmaId: idMap.Dma.get(r.id),
      mainMeterId: r.main_meter_id ? mapId('Meter', r.main_meter_id) : null,
    }))
    .filter((r) => r.mainMeterId);
  for (const { dmaId, mainMeterId } of mainMeterUpdates) {
    const { error } = await supabase.from('dma').update({ main_meter_id: mainMeterId }).eq('id', dmaId);
    if (error) console.warn(`  ! failed to backfill main_meter_id for dma ${dmaId}: ${error.message}`);
  }
  console.log(`  backfilled main_meter_id on ${mainMeterUpdates.length} dma rows`);

  console.log('=== NetworkNode ===');
  const networkNodesAll = loadCsv('NetworkNode');
  const networkNodes = networkNodesAll.filter((r) => resolveProjectId(r.project_id));
  reportSkipped('NetworkNode', networkNodesAll.length, networkNodes.length);
  const networkNodeRows = networkNodes.map((r) => ({
    id: newId('NetworkNode', r.id),
    project_id: resolveProjectId(r.project_id),
    node_type: r.node_type,
    dma_id: mapId('Dma', r.dma_id),
    name: r.name,
    pos_x: toNum(r.pos_x) ?? 0,
    pos_y: toNum(r.pos_y) ?? 0,
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('network_node', networkNodeRows);

  console.log('=== NetworkLink ===');
  const networkLinksAll = loadCsv('NetworkLink');
  const networkLinkRows = networkLinksAll
    .map((r) => ({
      id: newId('NetworkLink', r.id),
      project_id: resolveProjectId(r.project_id),
      from_node_id: mapId('NetworkNode', r.from_node_id),
      to_node_id: mapId('NetworkNode', r.to_node_id),
      port_config: parseJsonOrNull(r.port_config),
      created_at: r.created_date,
      updated_at: r.updated_date,
    }))
    .filter((r) => r.project_id && r.from_node_id && r.to_node_id);
  reportSkipped('NetworkLink', networkLinksAll.length, networkLinkRows.length);
  await insertBatch('network_link', networkLinkRows);

  console.log('=== IsolatedPoint ===');
  const isolatedPointsAll = loadCsv('IsolatedPoint');
  const isolatedPointRows = isolatedPointsAll
    .map((r) => ({
      id: newId('IsolatedPoint', r.id),
      project_id: resolveProjectId(r.project_id),
      layer_id: mapId('ProjectLayer', r.layer_id),
      latitude: toNum(r.latitude),
      longitude: toNum(r.longitude),
      dma1_id: mapId('Dma', r.dma1_id),
      dma2_id: mapId('Dma', r.dma2_id),
      feature_properties: parseJsonOrNull(r.feature_properties),
      color: r.color || '#92c141',
      created_at: r.created_date,
      updated_at: r.updated_date,
    }))
    .filter((r) => r.project_id && r.layer_id && r.dma1_id && r.dma2_id);
  reportSkipped('IsolatedPoint', isolatedPointsAll.length, isolatedPointRows.length);
  await insertBatch('isolated_point', isolatedPointRows);

  console.log('=== MapNote ===');
  const mapNotesAll = loadCsv('MapNote');
  const mapNotes = mapNotesAll.filter((r) => resolveProjectId(r.project_id));
  reportSkipped('MapNote', mapNotesAll.length, mapNotes.length);
  const mapNoteRows = mapNotes.map((r) => ({
    id: newId('MapNote', r.id),
    project_id: resolveProjectId(r.project_id),
    note_type: r.note_type,
    text: toNullable(r.text),
    start_lat: toNum(r.start_lat),
    start_lng: toNum(r.start_lng),
    end_lat: toNum(r.end_lat),
    end_lng: toNum(r.end_lng),
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('map_note', mapNoteRows);

  console.log('=== CustomerAnnotation ===');
  const customerAnnotationsAll = loadCsv('CustomerAnnotation');
  const customerAnnotations = customerAnnotationsAll.filter((r) => resolveProjectId(r.project_id));
  reportSkipped('CustomerAnnotation', customerAnnotationsAll.length, customerAnnotations.length);
  const customerAnnotationRows = customerAnnotations.map((r) => ({
    id: newId('CustomerAnnotation', r.id),
    project_id: resolveProjectId(r.project_id),
    annotation_type: r.annotation_type,
    data: parseJsonOrNull(r.data) ?? {},
    viewed: toBool(r.viewed),
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('customer_annotation', customerAnnotationRows);

  console.log('=== CustomerViewLink ===');
  const customerViewLinksAll = loadCsv('CustomerViewLink');
  const customerViewLinks = customerViewLinksAll.filter((r) => resolveProjectId(r.project_id));
  reportSkipped('CustomerViewLink', customerViewLinksAll.length, customerViewLinks.length);
  const customerViewLinkRows = customerViewLinks.map((r) => ({
    id: newId('CustomerViewLink', r.id),
    project_id: resolveProjectId(r.project_id),
    token: r.token,
    expires_at: r.expires_at,
    is_active: r.is_active === '' ? true : toBool(r.is_active),
    created_by_id: r.created_by_name ? (systemUserByName.get(r.created_by_name) ?? null) : null,
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('customer_view_link', customerViewLinkRows);

  console.log('=== ImageOverlay ===');
  const imageOverlaysAll = loadCsv('ImageOverlay');
  const imageOverlays = imageOverlaysAll.filter((r) => resolveProjectId(r.project_id));
  reportSkipped('ImageOverlay', imageOverlaysAll.length, imageOverlays.length);
  const imageOverlayRows = imageOverlays.map((r) => ({
    id: newId('ImageOverlay', r.id),
    project_id: resolveProjectId(r.project_id),
    name: r.name,
    file_url: r.file_url,
    bounds: parseJsonOrNull(r.bounds),
    opacity: toNum(r.opacity) ?? 0.7,
    visible: r.visible === '' ? true : toBool(r.visible),
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('image_overlay', imageOverlayRows);

  console.log('=== ProjectProgress ===');
  const projectProgressAll = loadCsv('ProjectProgress');
  const projectProgress = projectProgressAll.filter((r) => resolveProjectId(r.project_id));
  reportSkipped('ProjectProgress', projectProgressAll.length, projectProgress.length);
  const projectProgressRows = projectProgress.map((r) => ({
    id: newId('ProjectProgress', r.id),
    project_id: resolveProjectId(r.project_id),
    activity_type: r.activity_type,
    title: r.title,
    description: toNullable(r.description),
    user_id: r.user_name ? (systemUserByName.get(r.user_name) ?? null) : null,
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('project_progress', projectProgressRows);

  console.log('=== ImportLog ===');
  const importLogsAll = loadCsv('ImportLog');
  const importLogs = importLogsAll.filter((r) => resolveProjectId(r.project_id));
  reportSkipped('ImportLog', importLogsAll.length, importLogs.length);
  const importLogRows = importLogs.map((r) => ({
    id: newId('ImportLog', r.id),
    project_id: resolveProjectId(r.project_id),
    import_type: r.import_type || 'consumption',
    uid_value: r.uid_value,
    row_data: parseJsonOrNull(r.row_data),
    source_file_url: toNullable(r.source_file_url),
    source_file_name: toNullable(r.source_file_name),
    error_message: r.error_message,
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('import_log', importLogRows);

  console.log('=== VersionUpdate ===');
  const versionUpdates = loadCsv('VersionUpdate');
  const versionUpdateRows = versionUpdates.map((r) => ({
    id: newId('VersionUpdate', r.id),
    project_id: r.project_id ? mapId('Project', r.project_id) : null,
    request_type: r.request_type,
    title: r.title,
    description: r.description,
    screenshot_url: toNullable(r.screenshot_url),
    submitted_by_id: mapId('SystemUser', r.submitted_by_id),
    status: r.status || 'open',
    created_at: r.created_date,
    updated_at: r.updated_date,
  }));
  await insertBatch('version_update', versionUpdateRows);

  console.log('=== Refreshing project_stats materialized view ===');
  const { error: refreshError } = await supabase.rpc('refresh_project_stats');
  if (refreshError) console.warn(`  ! refresh_project_stats failed: ${refreshError.message}`);

  console.log('\n=== Done ===');
  console.log(
    'REMINDER: ConsumptionReading was NOT imported (skipped for now, per instruction) — ' +
      'come back and import ConsumptionReading_export.csv once it is available.'
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
