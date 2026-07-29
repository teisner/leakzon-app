// Both of these are loaded at the top rather than inside the handler on
// purpose. A dynamic `await import('npm:...')` runs during the request, so
// compiling them (xlsx is close to a megabyte of JavaScript) is charged to that
// request's CPU budget — and the export was already near the 2s ceiling, which
// is what killed it on a large project with HTTP 546 (WORKER_LIMIT). At the top
// they are compiled once while the worker boots, which is accounted separately.
import * as XLSX from 'npm:xlsx@0.18.5';
import JSZip from 'npm:jszip@3.10.1';
function buildNoDmaRows(meters: any[]) {
  return meters.map((m) => ({
    'UID': m.uid || '',
    'Is Main': m.__is_main ? 'TRUE' : 'FALSE',
    'DMA Name': m.__dma_name || '',
    'Account Name': m.payer_name || '',
    'Address': m.address || '',
    'Provider': m.provider || '',
    'Communication': m.communication_type || '',
    'Diameter (mm)': m.diameter ?? '',
    'Status': m.is_active === false ? 'Inactive' : 'Active',
    'Latitude': m.latitude ?? '',
    'Longitude': m.longitude ?? '',
    'Location Source': m.location_source || (m.latitude != null ? 'imported' : ''),
    'Additional IDs': (m.additional_ids || []).map((id: any) => `${id.label}: ${id.value}`).join('; '),
  }));
}

// Replaces base44/functions/exportToLeakZon/entry.ts. The hand-rolled
// Shapefile writer (generalized for Point/Polyline/Polygon) and the hand-
// rolled Excel SpreadsheetML writer are portable as-is — plain binary/XML
// generation, not Base44-specific. Only the entity fetches changed.
import { admin, getCallerUser, hasProjectAccess, json, CORS_HEADERS } from '../_shared/authz.ts';

function setDouble(view: DataView, offset: number, value: number) {
  view.setFloat64(offset, value, true);
}
function setInt32(view: DataView, offset: number, value: number) {
  view.setInt32(offset, value, true);
}
function setInt32BE(view: DataView, offset: number, value: number) {
  view.setInt32(offset, value, false);
}

function getCoords(geometry: any): number[][] {
  if (!geometry) return [];
  const { type, coordinates } = geometry;
  switch (type) {
    case 'Point':
      return [coordinates];
    case 'MultiPoint':
    case 'LineString':
      return coordinates;
    case 'MultiLineString':
    case 'Polygon':
      return coordinates.flat();
    case 'MultiPolygon':
      return coordinates.flat(2);
    default:
      return [];
  }
}

function getShapeType(geometryType: string | undefined): number {
  switch (geometryType) {
    case 'Point':
    case 'MultiPoint':
      return 1;
    case 'LineString':
    case 'MultiLineString':
      return 3;
    case 'Polygon':
    case 'MultiPolygon':
      return 5;
    default:
      return 1;
  }
}

function getPartsAndPoints(geometry: any) {
  if (!geometry) return { parts: [0], points: [] as number[][] };
  const { type, coordinates } = geometry;
  let rings: number[][][] = [];
  switch (type) {
    case 'LineString':
      rings = [coordinates];
      break;
    case 'MultiLineString':
      rings = coordinates;
      break;
    case 'Polygon':
      rings = coordinates;
      break;
    case 'MultiPolygon':
      rings = coordinates.flat();
      break;
    case 'Point':
      rings = [[coordinates]];
      break;
    case 'MultiPoint':
      rings = [coordinates.map((c: number[]) => [c[0], c[1]])];
      break;
    default:
      rings = [];
  }
  const parts: number[] = [];
  const points: number[][] = [];
  let idx = 0;
  for (const ring of rings) {
    parts.push(idx);
    for (const pt of ring) {
      points.push([pt[0], pt[1]]);
      idx++;
    }
  }
  return { parts, points };
}

function buildShpFile(features: any[]) {
  const headerSize = 100;
  const shapeType = features.length > 0 ? getShapeType(features[0].geometry?.type) : 1;

  let contentBytes = 0;
  const records = features.map((f) => {
    const { parts, points } = getPartsAndPoints(f.geometry);
    const numParts = parts.length;
    const numPoints = points.length;
    let recContent: number;
    if (shapeType === 1) {
      recContent = 4 + 16;
    } else {
      recContent = 4 + 32 + 4 + 4 + 4 * numParts + 16 * numPoints;
    }
    contentBytes += 8 + recContent;

    if (shapeType === 1) {
      const c = f.geometry?.type === 'Point' ? f.geometry.coordinates : getCoords(f.geometry)[0] || [0, 0];
      return { pt: c, recContent };
    } else {
      let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
      for (const [x, y] of points) {
        if (x < xmin) xmin = x;
        if (y < ymin) ymin = y;
        if (x > xmax) xmax = x;
        if (y > ymax) ymax = y;
      }
      return { parts, points, numParts, numPoints, recContent, xmin, ymin, xmax, ymax };
    }
  });

  const totalBytes = headerSize + contentBytes;
  const buf = new ArrayBuffer(totalBytes);
  const v = new DataView(buf);

  setInt32BE(v, 0, 9994);
  setInt32BE(v, 24, totalBytes / 2);
  setInt32(v, 28, 1000);
  setInt32(v, 32, shapeType);

  const allPts = features.flatMap((f) => getCoords(f.geometry));
  if (allPts.length > 0) {
    setDouble(v, 36, Math.min(...allPts.map((c) => c[0])));
    setDouble(v, 44, Math.min(...allPts.map((c) => c[1])));
    setDouble(v, 52, Math.max(...allPts.map((c) => c[0])));
    setDouble(v, 60, Math.max(...allPts.map((c) => c[1])));
  }
  setDouble(v, 68, 0); setDouble(v, 76, 0); setDouble(v, 84, 0); setDouble(v, 92, 0);

  let off = headerSize;
  records.forEach((r: any, i) => {
    setInt32BE(v, off, i + 1);
    setInt32BE(v, off + 4, r.recContent / 2);
    off += 8;
    setInt32(v, off, shapeType);

    if (shapeType === 1) {
      setDouble(v, off + 4, r.pt[0]);
      setDouble(v, off + 12, r.pt[1]);
      off += r.recContent;
    } else {
      setDouble(v, off + 4, r.xmin);
      setDouble(v, off + 12, r.ymin);
      setDouble(v, off + 20, r.xmax);
      setDouble(v, off + 28, r.ymax);
      setInt32(v, off + 36, r.numParts);
      setInt32(v, off + 40, r.numPoints);
      let ptOff = off + 44;
      for (const p of r.parts) {
        setInt32(v, ptOff, p);
        ptOff += 4;
      }
      for (const [x, y] of r.points) {
        setDouble(v, ptOff, x);
        setDouble(v, ptOff + 8, y);
        ptOff += 16;
      }
      off += r.recContent;
    }
  });

  return new Uint8Array(buf);
}

function buildShxFile(features: any[]) {
  const headerSize = 100;
  const shapeType = features.length > 0 ? getShapeType(features[0].geometry?.type) : 1;
  const totalBytes = headerSize + features.length * 8;
  const buf = new ArrayBuffer(totalBytes);
  const v = new DataView(buf);

  setInt32BE(v, 0, 9994);
  setInt32BE(v, 24, totalBytes / 2);
  setInt32(v, 28, 1000);
  setInt32(v, 32, shapeType);

  const allPts = features.flatMap((f) => getCoords(f.geometry));
  if (allPts.length > 0) {
    setDouble(v, 36, Math.min(...allPts.map((c) => c[0])));
    setDouble(v, 44, Math.min(...allPts.map((c) => c[1])));
    setDouble(v, 52, Math.max(...allPts.map((c) => c[0])));
    setDouble(v, 60, Math.max(...allPts.map((c) => c[1])));
  }
  setDouble(v, 68, 0); setDouble(v, 76, 0); setDouble(v, 84, 0); setDouble(v, 92, 0);

  let shpOffset = headerSize / 2;
  let off = headerSize;
  for (const f of features) {
    const { parts, points } = getPartsAndPoints(f.geometry);
    const numParts = parts.length;
    const numPoints = points.length;
    let recContent: number;
    if (shapeType === 1) recContent = 4 + 16;
    else recContent = 4 + 32 + 4 + 4 + 4 * numParts + 16 * numPoints;
    setInt32BE(v, off, shpOffset);
    setInt32BE(v, off + 4, recContent / 2);
    off += 8;
    shpOffset += (8 + recContent) / 2;
  }

  return new Uint8Array(buf);
}

// The attribute table for a shapefile set.
//
// Two things were wrong here and both showed up as "every water line has the
// same diameter":
//
//  1. The dBASE header was malformed. Bytes 8-9 hold the header length and
//     10-11 the record length, both 16-bit. Writing the header length as a
//     32-bit value overwrote the record length with zero, so a reader that
//     trusts the header — which most GIS software does — walked every record
//     from the same offset and repeated the first row 402 times. The bytes
//     were right; the map to them was not.
//  2. Only five attributes were carried. Everything the utility actually
//     surveyed — installation date, material, condition, notes, the source
//     feature id — was dropped at export.
//
// So: correct header, and every source attribute carried through.

const DBF_MAX_FIELDS = 128;      // dBASE III limit
const DBF_MAX_RECORD = 3900;     // and its practical record-length ceiling
const DBF_MAX_FIELD_SIZE = 254;

// dBASE field names: at most 10 bytes, and unique. Anything else a GIS reader
// will either reject or silently rename.
function dbfFieldName(raw: string, taken: Set<string>) {
  let base = String(raw || 'field')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^_+/, '')
    .slice(0, 10) || 'field';
  let name = base;
  let n = 1;
  while (taken.has(name.toUpperCase())) {
    const suffix = String(n++);
    name = base.slice(0, 10 - suffix.length) + suffix;
  }
  taken.add(name.toUpperCase());
  return name;
}

// Truncates to a byte budget without splitting a multi-byte character — the
// meter addresses are Hebrew, and half a character is a corrupt field.
function encodeFixed(enc: TextEncoder, value: string, size: number) {
  const bytes = enc.encode(value);
  if (bytes.length <= size) return bytes;
  let cut = size;
  while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) cut--;
  return bytes.subarray(0, cut);
}

function dbfFields(features: any[]) {
  // The platform's own attributes first, in a fixed order, so a consumer can
  // rely on them being there whatever the source file carried.
  const taken = new Set<string>();
  const fields: { name: string; key: string; size: number }[] = [
    { name: dbfFieldName('name', taken), key: 'name', size: 50 },
    { name: dbfFieldName('type', taken), key: 'type', size: 15 },
    { name: dbfFieldName('color', taken), key: 'color', size: 10 },
    { name: dbfFieldName('diameter', taken), key: 'diameter', size: 20 },
    { name: dbfFieldName('style', taken), key: 'style', size: 10 },
  ];
  const platform = new Set(fields.map((f) => f.key));

  // Then every attribute present on any feature, sized to the widest value
  // actually in the data.
  const widths = new Map<string, number>();
  const enc = new TextEncoder();
  for (const f of features) {
    for (const [key, value] of Object.entries(f.properties || {})) {
      if (platform.has(key)) continue;
      if (value === null || value === undefined) continue;
      const len = enc.encode(String(value)).length;
      widths.set(key, Math.max(widths.get(key) ?? 1, Math.min(len, DBF_MAX_FIELD_SIZE)));
    }
  }

  let record = 1 + fields.reduce((sum, f) => sum + f.size, 0);
  for (const [key, width] of widths) {
    if (fields.length >= DBF_MAX_FIELDS || record + width > DBF_MAX_RECORD) break;
    fields.push({ name: dbfFieldName(key, taken), key, size: width });
    record += width;
  }
  return fields;
}

function buildDbfFile(features: any[]) {
  const fields = dbfFields(features);
  const headerSize = 32 + fields.length * 32 + 1;
  const recordSize = 1 + fields.reduce((s, f) => s + f.size, 0);
  const totalBytes = headerSize + features.length * recordSize + 1;

  const buf = new ArrayBuffer(totalBytes);
  const v = new DataView(buf);
  const enc = new TextEncoder();

  v.setUint8(0, 0x03);
  const now = new Date();
  v.setUint8(1, now.getFullYear() - 1900);
  v.setUint8(2, now.getMonth() + 1);
  v.setUint8(3, now.getDate());
  setInt32(v, 4, features.length);
  // 16-bit, and adjacent — see the note above.
  v.setUint16(8, headerSize, true);
  v.setUint16(10, recordSize, true);
  // Bytes 12-31 are reserved and must stay zero.

  let off = 32;
  for (const field of fields) {
    const nameBytes = enc.encode(field.name);
    for (let i = 0; i < 11; i++) v.setUint8(off + i, nameBytes[i] || 0);
    v.setUint8(off + 11, 0x43); // 'C' — every field is text
    setInt32(v, off + 12, 0);   // field data address, unused
    v.setUint8(off + 16, field.size);
    v.setUint8(off + 17, 0);    // decimal count
    off += 32;
  }
  v.setUint8(off, 0x0d);

  off = headerSize;
  for (const f of features) {
    v.setUint8(off, 0x20); // not deleted
    off += 1;
    const p = f.properties || {};
    for (const field of fields) {
      const raw = p[field.key];
      const text = raw === null || raw === undefined ? '' : String(raw);
      const bytes = encodeFixed(enc, field.key === 'style' && !text ? 'solid' : text, field.size);
      for (let j = 0; j < field.size; j++) v.setUint8(off + j, bytes[j] ?? 0x20);
      off += field.size;
    }
  }
  v.setUint8(off, 0x1a);

  return new Uint8Array(buf);
}

const PRJ_WKT = `GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]`;

function sanitizeFileName(name: string | undefined) {
  return (
    String(name || 'layer')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 60)
      .replace(/^_+|_+$/g, '') || 'layer'
  );
}

// Re-types a polygon feature as lines so it exports as an outline only —
// a shapefile polygon renders filled in most viewers, and DMA/boundary
// outlines have to sit over the map without hiding what is under them.
function toOutline(feature: any, color: string, style: string) {
  const g = feature.geometry || {};
  let rings: number[][][] = [];
  if (g.type === 'Polygon') rings = g.coordinates || [];
  else if (g.type === 'MultiPolygon') rings = (g.coordinates || []).flat();
  else return { ...feature, properties: { ...feature.properties, color, style } };
  return {
    geometry: { type: 'MultiLineString', coordinates: rings },
    properties: { ...feature.properties, type: 'MultiLineString', color, style },
  };
}

// Boundary layers get the red dashed treatment; matched by name because that
// is how they are labelled ("Obion Boundary", "woodlawn Boundary").
function isBoundaryLayer(name: string | undefined) {
  return /boundar|border|\u05d2\u05d1\u05d5\u05dc/i.test(String(name || ''));
}

const DMA_OUTLINE_COLOR = '#000000';
const BOUNDARY_OUTLINE_COLOR = '#FF0000';

function buildShapefileSet(features: any[]) {
  const enc = new TextEncoder();
  return {
    shp: buildShpFile(features),
    shx: buildShxFile(features),
    dbf: buildDbfFile(features),
    prj: enc.encode(PRJ_WKT),
    // Declares the .dbf encoding. Without it a reader assumes a legacy code
    // page and the Hebrew addresses come out as mojibake.
    cpg: enc.encode('UTF-8'),
  };
}

function groupByGeometryType(features: any[]) {
  const groups: Record<string, any[]> = {};
  for (const f of features) {
    const gtype = f.geometry?.type || 'Point';
    const shapeCategory = getShapeType(gtype) === 1 ? 'point' : getShapeType(gtype) === 3 ? 'line' : 'polygon';
    (groups[shapeCategory] ||= []).push(f);
  }
  return groups;
}

// Point-in-polygon over dma.polygon_json ([lat, lng] pairs) — the same test
// dma_enriched/project_stats use in SQL, so the export agrees with the DMA
// counts shown in the app.
function pointInPolygon(lat: number, lng: number, polygon: [number, number][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lati, lngi] = polygon[i];
    const [latj, lngj] = polygon[j];
    const intersect = lati > lat !== latj > lat && lng < ((lngj - lngi) * (lat - lati)) / (latj - lati) + lngi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// A meter counts as a main when the record says so, or when it sits on a layer
// that is by definition a main-type meter (insertion / ultrasonic / main).
// Mirrors src/lib/meterLayerDetection.js.
function isMainMeter(meter: any, layerNameById: Map<string, string>) {
  if (meter.is_main) return true;
  const layerName = meter.layer_id ? layerNameById.get(meter.layer_id) || '' : '';
  // "Sub Main Meters" contains "Main Meter" — a sub-meter layer must never be
  // promoted to main, so the sub check wins.
  if (/\bsub\b|^sub[\s_-]/i.test(layerName)) return false;
  return /insertion|ultrasonic|main[\s_-]?meter/i.test(layerName);
}

function parsePolygon(dma: any): [number, number][] | null {
  const raw = dma.polygon_json ?? dma.polygon;
  let poly: any;
  try {
    poly = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!Array.isArray(poly) || poly.length < 3) return null;
  return poly as [number, number][];
}

function polygonCentroid(poly: [number, number][]): [number, number] {
  const lat = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const lng = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return [lat, lng];
}

// Headers are intentionally hardcoded English literals and never routed through
// i18n — the receiving LeakZon system parses them by name, so they must not
// change with the UI language.
// ── LeakZon Main import format ───────────────────────────────────────────────
// Column names, order and constant values are dictated by the receiving system,
// so they are literals here and never translated.

function additionalId(m: any, patterns: RegExp[]) {
  for (const id of m?.additional_ids || []) {
    if (patterns.some((re) => re.test(String(id?.label || "")))) return String(id?.value ?? "");
  }
  return "";
}

// Any value the operator can nominate for the Identifier / Meter Number columns.
export function meterFieldValue(m: any, field: string) {
  switch (field) {
    case "uid": return m.uid ?? "";
    case "meter_id": return additionalId(m, [/^meter.?id$/i, /^meter$/i, /meter/i]);
    case "account_id": return additionalId(m, [/account.?id/i, /^account$/i, /account/i]);
    case "endpoint_id": return m.endpoint_id ?? "";
    case "address": return m.address ?? "";
    case "payer_name": return m.payer_name ?? "";
    case "city": return m.city ?? "";
    case "provider": return m.provider ?? "";
    default: return "";
  }
}

// The operator picks which fields make up the Identifier; they are joined with
// commas, e.g. address + meter id -> "12 Main St,854796".
function buildIdentifier(m: any, fields: string[]) {
  return (fields || [])
    .map((f) => String(meterFieldValue(m, f) ?? "").trim())
    .filter(Boolean)
    .join(",");
}

function unitLabel(waterUnit: string | undefined) {
  return waterUnit === "Gallons" ? "US gallons" : "m3";
}

function communicationFor(meter: any, project: any) {
  // Mains of every type report over AMI; sub-meters vary by utility and are
  // configured per project (Project Settings → Sub-meter communication).
  return meter.__is_main ? "AMI" : (project?.sub_meter_communication || "");
}

// Fields the operator can choose from for Identifier and Meter Number.
export const SELECTABLE_FIELDS = [
  'uid', 'meter_id', 'account_id', 'endpoint_id', 'address', 'payer_name', 'city', 'provider',
];

// How many meters actually carry each field. Without this the dialog would
// happily recommend "Meter ID" on a project whose meters have none — Obion's
// were imported before ID columns were retained, so that column would export
// empty for every row.
export function fieldCoverage(meters: any[]) {
  const out: Record<string, number> = {};
  for (const f of SELECTABLE_FIELDS) {
    out[f] = meters.reduce((n, m) => n + (String(meterFieldValue(m, f) ?? '').trim() ? 1 : 0), 0);
  }
  return out;
}

const METER_DATA_COLUMNS = [
  "Identifier", "Meter Number", "Address", "Usage type", "Diameter", "Location",
  "Status", "Zone", "transmitterid", "User", "Users Number", "Installation Date",
  "Unit", "multiplier", "Provider", "Description", "Isactive", "ufr",
  "Communication", "METER TYPE", "new identifier", "new meter number",
];

// One row per physical meter.
//
// analyzeMeters emits a copy of a main meter for each DMA it serves, which is
// what the Groups file needs — a membership row per DMA. Meter Data describes
// the meters themselves, so those copies collapse back to one. Deduped on the
// Identifier, since that is the key the receiving system matches on and two
// rows sharing one would collide on import regardless of why.
function dedupeMeterRows(rows: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const r of rows) {
    // An empty Identifier carries no identity, so those rows are kept as they
    // are rather than being collapsed into a single row.
    const key = String(r['Identifier'] ?? '').trim();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(r);
  }
  return out;
}

export function buildMeterDataRows(meters: any[], project: any, opts: any) {
  const installed = new Date().toISOString().slice(0, 10);
  const unit = unitLabel(project?.water_unit);
  return dedupeMeterRows(meters.map((m) => ({
    "Identifier": buildIdentifier(m, opts.identifierFields),
    "Meter Number": String(meterFieldValue(m, opts.meterNumberField) ?? ""),
    "Address": m.address ?? "",
    "Usage type": "",
    "Diameter": m.diameter ?? "",
    // Single field, comma separated, as the receiving system expects.
    "Location": m.latitude != null && m.longitude != null ? `${m.latitude},${m.longitude}` : "",
    "Status": "",
    "Zone": "",
    "transmitterid": m.endpoint_id ?? "",
    "User": m.payer_name ?? "",
    "Users Number": meterFieldValue(m, "account_id"),
    "Installation Date": installed,
    "Unit": unit,
    "multiplier": "1",
    "Provider": m.provider ?? "",
    "Description": "",
    "Isactive": "TRUE",
    "ufr": "FALSE",
    "Communication": communicationFor(m, project),
    "METER TYPE": "water",
    "new identifier": "",
    "new meter number": "",
  })));
}

const GROUPS_COLUMNS = [
  "Identifier", "Is Main?", "Group name", "Is Root?", "Type", "Communication type",
];

export function buildGroupsRows(meters: any[], project: any, opts: any) {
  return meters.map((m) => ({
    "Identifier": buildIdentifier(m, opts.identifierFields),
    "Is Main?": m.__is_main ? "True" : "False",
    "Group name": m.__dma_name || "",
    // Blank unless the meter is actually flagged as a root.
    "Is Root?": m.is_root ? "True" : "",
    "Type": "REGULAR",
    "Communication type": communicationFor(m, project),
  }));
}

// Writes a genuine .xlsx workbook.
//
// These were SpreadsheetML 2003 (an XML dialect) saved as .xls. Excel inspects
// the content, sees XML where the binary .xls format is claimed, and warns that
// the file "could be corrupted or unsafe" before it will open — on every file
// the platform produced. SheetJS emits the real format, so the warning goes.
function buildSheetXlsx(sheetName: string, columns: string[], rows: any[]) {
  // aoa keeps the column order exactly as given; json_to_sheet would take it
  // from the first object's key order.
  const aoa = [columns, ...rows.map((r) => columns.map((c) => r[c] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  // Excel rejects sheet names over 31 characters or containing []:*?/\
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31).replace(/[[\]:*?/\\]/g, '-'));
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}



// Analyses the project's meters before they are written out: resolves each
// meter's DMA, decides main vs sub, splits off the meters with no DMA, and
// invents a main meter for any DMA that has none (the receiving system requires
// one main per DMA). Returns the two row sets plus the numbers to report back.
function analyzeMeters(meters: any[], dmas: any[], layers: any[]) {
  const layerNameById = new Map((layers || []).map((l: any) => [l.id, l.name || '']));
  const dmaById = new Map((dmas || []).map((d: any) => [d.id, d]));
  const polys = (dmas || [])
    .map((d: any) => ({ dma: d, poly: parsePolygon(d) }))
    .filter((x) => x.poly) as { dma: any; poly: [number, number][] }[];

  let noCoords = 0;
  for (const m of meters) {
    m.__is_main = isMainMeter(m, layerNameById);
    if (m.latitude == null || m.longitude == null) noCoords++;

    const dma = m.dma_id ? dmaById.get(m.dma_id) : null;
    if (dma) {
      m.__dma_id = dma.id;
      m.__dma_name = dma.name || '';
      continue;
    }
    // A main meter belongs to a DMA only by an explicit link. Mains sit at
    // inlets and boundaries and are routinely inside a DMA they do not feed —
    // Obion's 1009868 is linked to nothing yet sits inside "Central DMA", which
    // made that DMA look like it had a main and suppressed its placeholder.
    if (m.__is_main || m.latitude == null || m.longitude == null) {
      m.__dma_id = null;
      m.__dma_name = '';
      continue;
    }
    const hit = polys.find((x) => pointInPolygon(m.latitude, m.longitude, x.poly))?.dma || null;
    m.__dma_id = hit?.id || null;
    m.__dma_name = hit?.name || '';
  }

  const mainsByDma = new Map<string, number>();
  for (const m of meters) {
    if (m.__is_main && m.__dma_id) mainsByDma.set(m.__dma_id, (mainsByDma.get(m.__dma_id) || 0) + 1);
  }

  // A main meter can feed several DMAs (dma.main_meter_id has no unique
  // constraint). One row can only name one DMA, so emit a copy per DMA — same
  // UID on each — otherwise the second DMA has no main row naming it, which is
  // exactly what the placeholder rule below exists to prevent.
  const sharedCopies: any[] = [];
  const copiedMainIds = new Set<string>();
  for (const d of dmas || []) {
    if (!d.main_meter_id) continue;
    const linked = meters.find((m) => m.id === d.main_meter_id);
    if (!linked) continue;
    mainsByDma.set(d.id, (mainsByDma.get(d.id) || 0) + 1);
    copiedMainIds.add(linked.id);
    sharedCopies.push({ ...linked, __is_main: true, __dma_id: d.id, __dma_name: d.name || '' });
  }

  // Fictitious mains get numeric UIDs continuing past the highest numeric UID
  // already in the project, so they can't collide with a real meter.
  let nextUid = meters.reduce((max, m) => {
    const n = /^\d+$/.test(String(m.uid || '').trim()) ? parseInt(m.uid, 10) : 0;
    return n > max ? n : max;
  }, 0) + 1;

  const fictitious: any[] = [];
  for (const d of dmas || []) {
    if ((mainsByDma.get(d.id) || 0) > 0) continue;
    const entry = polys.find((x) => x.dma.id === d.id);
    const [lat, lng] = entry ? polygonCentroid(entry.poly) : [null, null];
    fictitious.push({
      uid: String(nextUid++),
      payer_name: `${d.name || 'DMA'}_Fic`,
      address: '', provider: '', communication_type: '', diameter: null,
      is_active: true, latitude: lat, longitude: lng,
      location_source: 'generated', additional_ids: [],
      __is_main: true, __dma_id: d.id, __dma_name: d.name || '',
    });
  }

  // A main that got per-DMA copies is represented by those copies, so the
  // original must not also be emitted or it would double-count.
  const all = [...meters.filter((m) => !copiedMainIds.has(m.id)), ...sharedCopies, ...fictitious];
  const assigned = all.filter((m) => m.__dma_id);
  const unassigned = all.filter((m) => !m.__dma_id);

  return {
    assigned,
    unassigned,
    fictitious,
    insights: {
      metersTotal: meters.length,
      assigned: assigned.length,
      unassigned: unassigned.length,
      mains: all.filter((m) => m.__is_main).length,
      subs: all.filter((m) => !m.__is_main).length,
      noCoords,
      // Mains linked to no DMA at all — the condition that used to be hidden
      // by the spatial fallback.
      mainsUnlinked: meters.filter((m) => m.__is_main && !copiedMainIds.has(m.id) && !m.__dma_id).length,
      dmasTotal: (dmas || []).length,
      dmasWithMain: (dmas || []).filter((d: any) => (mainsByDma.get(d.id) || 0) > 0).length,
      fictitiousMains: fictitious.length,
      fictitiousDmaNames: fictitious.map((f) => f.__dma_name),
    },
  };
}

const PAGE_SIZE = 5000;
// Same bucket the layer files live in — it already exists and is wired up.
const EXPORT_BUCKET = 'project-files';

async function fetchAllMeters(projectId: string) {
  const all: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data: batch } = await admin.from('meter').select('*').eq('project_id', projectId).order('id').range(from, from + PAGE_SIZE - 1);
    all.push(...(batch || []));
    hasMore = (batch?.length || 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { project_id, analyze_only, preview_only, identifier_fields, meter_number_field, include_dma_shp } = await req.json();
    if (!project_id) return json({ error: 'project_id is required' }, 400);

    const user = await getCallerUser(req);
    if (!(await hasProjectAccess(user, project_id))) return json({ error: 'Unauthorized' }, 403);

    const { data: project } = await admin.from('project').select('*').eq('id', project_id).single();
    if (!project) return json({ error: 'Project not found' }, 404);

    const [{ data: layers }, meters, { data: dmas }] = await Promise.all([
      admin.from('project_layer').select('*').eq('project_id', project_id).order('sort_order'),
      fetchAllMeters(project_id),
      admin.from('dma').select('*').eq('project_id', project_id).order('sort_order'),
    ]);

    // Analysis pass only — skips fetching and rebuilding every layer's
    // shapefile, so the review step in the dialog returns quickly.
    if (analyze_only) {
      const preview = analyzeMeters(meters, dmas || [], layers || []);
      return json({
        insights: preview.insights,
        stats: {
          layers: (layers || []).filter((l: any) => l.file_url && l.layer_type === 'shp').length,
          features: 0,
          meters: preview.insights.metersTotal,
          dmas: (dmas || []).length,
        },
      });
    }

    // Preview: return the rows that would be written, without building any
    // shapefiles — those take the bulk of the time and none of it is needed to
    // show the operator what the workbooks will contain.
    if (preview_only) {
      const a = analyzeMeters(meters, dmas || [], layers || []);
      const opts = {
        identifierFields: identifier_fields?.length ? identifier_fields : ['address', 'meter_id'],
        meterNumberField: meter_number_field || 'meter_id',
      };
      return json({
        insights: a.insights,
        meterData: buildMeterDataRows(a.assigned, project, opts),
        groups: buildGroupsRows(a.assigned, project, opts),
        noDmaCount: a.unassigned.length,
        fieldCoverage: fieldCoverage(a.assigned),
        totalRows: a.assigned.length,
      });
    }

    // Memory is the constraint here, not time. A worker gets 256 MB, and a
    // project like Woodlawn carries layers whose parsed GeoJSON is far larger
    // than the file on disk. Everything below is written to hold one layer at a
    // time and to drop each intermediate as soon as it has been written into
    // the zip — and the finished zip goes to Storage rather than back through
    // the JSON response, which previously meant holding the bytes, a base64
    // copy (+33%) and the serialised response string all at once.
    const mem = () => Math.round((Deno.memoryUsage?.().heapUsed ?? 0) / 1048576);
    const peak = { mb: mem(), at: 'start' };
    const mark = (at: string) => { const m = mem(); if (m > peak.mb) { peak.mb = m; peak.at = at; } };

    const innerZip = new JSZip();
    let totalFeatures = 0;
    let exportedLayers = 0;
    let skippedLayers = 0;

    for (const layer of layers || []) {
      if (!layer.file_url || layer.layer_type !== 'shp') continue;
      let features: any[] | null = null;
      try {
        const res = await fetch(layer.file_url);
        if (!res.ok) { skippedLayers++; continue; }
        const geojson = await res.json();
        const outline = isBoundaryLayer(layer.name);
        const diameterField = layer.pipe_config?.diameter_field;
        // One pass: read only the four properties a shapefile carries, and
        // apply the boundary outline styling in the same step. The previous
        // three chained maps kept three full copies of every feature alive.
        features = (geojson.features || []).map((f: any) => {
          const src = f.properties || {};
          const feature = {
            geometry: f.geometry,
            properties: {
              name: src.name || src.Name || '',
              type: f.geometry?.type || '',
              color: layer.color || '',
              diameter: diameterField ? String(src[diameterField] ?? '') : '',
              // Everything the source file carried — material, install date,
              // condition, the utility's own feature id — travels with the
              // feature instead of being dropped at export. The platform's own
              // five attributes above keep their names; see dbfFields.
              ...src,
            },
          };
          return outline ? toOutline(feature, BOUNDARY_OUTLINE_COLOR, 'dashed') : feature;
        });
      } catch {
        skippedLayers++;
        continue;
      }
      mark(`layer:${layer.name}`);
      if (!features || features.length === 0) continue;

      const groups = groupByGeometryType(features);
      features = null; // the groups hold the references now
      const baseName = sanitizeFileName(layer.name);
      const multi = Object.keys(groups).length > 1;
      for (const [category, feats] of Object.entries(groups)) {
        const fileBase = `${baseName}${multi ? `_${category}` : ''}`;
        const shpSet = buildShapefileSet(feats);
        innerZip.file(`${fileBase}.shp`, shpSet.shp);
        innerZip.file(`${fileBase}.shx`, shpSet.shx);
        innerZip.file(`${fileBase}.dbf`, shpSet.dbf);
        innerZip.file(`${fileBase}.prj`, shpSet.prj);
        innerZip.file(`${fileBase}.cpg`, shpSet.cpg);
        totalFeatures += feats.length;
        groups[category] = []; // written; let the features go
      }
      exportedLayers++;
      mark(`zipped:${layer.name}`);
    }

    const dmaFeatures: any[] = [];
    for (const dma of dmas || []) {
      const raw = dma.polygon_json ?? dma.polygon;
      let poly: any;
      try {
        poly = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        continue;
      }
      if (!Array.isArray(poly) || poly.length < 3) continue;
      const ring = poly.map(([lat, lng]: number[]) => [lng, lat]);
      ring.push(ring[0]);
      // Outline only, black — see toOutline.
      dmaFeatures.push(toOutline(
        {
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: { name: dma.name || '', type: 'Polygon', color: dma.color || '', diameter: '' },
        },
        DMA_OUTLINE_COLOR,
        'solid',
      ));
    }
    // LeakZon Main reads DMA boundaries from the Groups file, so the DMA
    // shapefile is redundant for it. It is still worth having when the
    // boundaries are going into another GIS package, so the operator chooses.
    // Defaults to included, so an older caller that sends nothing keeps the
    // previous behaviour rather than silently dropping a file.
    const wantDmaShp = include_dma_shp !== false;
    if (wantDmaShp && dmaFeatures.length > 0) {
      const shpSet = buildShapefileSet(dmaFeatures);
      innerZip.file('DMA.shp', shpSet.shp);
      innerZip.file('DMA.shx', shpSet.shx);
      innerZip.file('DMA.dbf', shpSet.dbf);
      innerZip.file('DMA.prj', shpSet.prj);
      innerZip.file('DMA.cpg', shpSet.cpg);
      totalFeatures += dmaFeatures.length;
    }
    dmaFeatures.length = 0;

    // Deflate: shapefiles are extremely compressible, and every megabyte saved
    // here is a megabyte not held twice while the outer zip is assembled.
    const innerZipBytes = await innerZip.generateAsync({
      type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 },
    });
    mark('inner-zip');

    const outerZip = new JSZip();
    outerZip.file('Shapefiles.zip', innerZipBytes);

    const analysis = analyzeMeters(meters, dmas || [], layers || []);

    const exportOpts = {
      identifierFields: identifier_fields?.length ? identifier_fields : ['address', 'meter_id'],
      meterNumberField: meter_number_field || 'meter_id',
    };
    // Files are named for the project so they stay identifiable once several
    // exports are sitting in the same downloads folder.
    const filePrefix = sanitizeFileName(project.name);

    // Real .xlsx — see buildSheetXlsx for why these are no longer .xls.
    outerZip.file(`${filePrefix}_meter_data.xlsx`, buildSheetXlsx(
      'Meter Data', METER_DATA_COLUMNS, buildMeterDataRows(analysis.assigned, project, exportOpts)
    ));
    // Groups — which DMA each meter belongs to, and how it participates.
    outerZip.file(`${filePrefix}_groups.xlsx`, buildSheetXlsx(
      'Groups', GROUPS_COLUMNS, buildGroupsRows(analysis.assigned, project, exportOpts)
    ));
    // Meters with no DMA keep their own file so nothing is silently lost and
    // they can be reviewed apart from the rest.
    if (analysis.unassigned.length > 0) {
      const noDma = buildNoDmaRows(analysis.unassigned);
      outerZip.file(`${filePrefix}_meters_no_dma.xlsx`, buildSheetXlsx('Meters without DMA', Object.keys(noDma[0]), noDma));
    }
    mark('workbooks');

    const zipBytes = await outerZip.generateAsync({ type: 'uint8array' });
    mark('outer-zip');
    const safeProjectName = sanitizeFileName(project.name);

    // Hand the file over through Storage. Returning it inline meant the bytes,
    // a base64 copy and the JSON response all lived in the worker at once,
    // which is what pushed a large project past the memory limit (HTTP 546).
    const objectPath = `leakzon-exports/${project_id}/${Date.now()}_${safeProjectName}_Layers.zip`;
    const { error: uploadError } = await admin.storage
      .from(EXPORT_BUCKET)
      .upload(objectPath, zipBytes, { contentType: 'application/zip', upsert: true });
    if (uploadError) return json({ error: `Could not store the export: ${uploadError.message}` }, 500);

    // Long enough to download a large file on a slow connection, short enough
    // that the link isn't a lasting handout.
    const { data: signed, error: signError } = await admin.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(objectPath, 3600);
    if (signError || !signed?.signedUrl) {
      return json({ error: `Could not create a download link: ${signError?.message || 'unknown error'}` }, 500);
    }

    // Previous exports of this project are dead weight once a new one exists.
    void admin.storage.from(EXPORT_BUCKET).list(`leakzon-exports/${project_id}`).then(({ data }) => {
      const old = (data || [])
        .map((f: any) => `leakzon-exports/${project_id}/${f.name}`)
        .filter((p: string) => p !== objectPath);
      if (old.length) return admin.storage.from(EXPORT_BUCKET).remove(old);
    }).catch(() => {});

    return json({
      zip_url: signed.signedUrl,
      zipName: `${safeProjectName}_Layers`,
      stats: {
        layers: exportedLayers,
        skippedLayers,
        features: totalFeatures,
        dmaShapefile: wantDmaShp,
        meters: analysis.insights.metersTotal,
        dmas: (dmas || []).length,
        zipBytes: zipBytes.length,
        // Reported so a future failure says where the memory went instead of
        // only "546".
        peakHeapMb: peak.mb,
        peakAt: peak.at,
      },
      insights: analysis.insights,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
