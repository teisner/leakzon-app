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

function buildDbfFile(features: any[]) {
  const fields = [
    { name: 'name', type: 'C', size: 50 },
    { name: 'type', type: 'C', size: 15 },
    { name: 'color', type: 'C', size: 10 },
    { name: 'diameter', type: 'C', size: 20 },
    // A shapefile carries no styling of its own, so the intended line style
    // travels as an attribute for the consumer to apply.
    { name: 'style', type: 'C', size: 10 },
  ];
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
  setInt32(v, 8, headerSize);
  setInt32(v, 12, recordSize);

  let off = 32;
  for (const field of fields) {
    const nameBytes = enc.encode(field.name.slice(0, 10));
    for (let i = 0; i < 10; i++) v.setUint8(off + i, nameBytes[i] || 0);
    v.setUint8(off + 11, field.type.charCodeAt(0));
    setInt32(v, off + 16, field.size);
    v.setUint8(off + 20, 0);
    off += 32;
  }
  v.setUint8(off, 0x0d);

  off = headerSize;
  for (const f of features) {
    v.setUint8(off, 0x20);
    off += 1;
    const p = f.properties || {};
    const values = [
      String(p.name || '').slice(0, 50).padEnd(50),
      String(p.type || '').slice(0, 15).padEnd(15),
      String(p.color || '').slice(0, 10).padEnd(10),
      String(p.diameter || '').slice(0, 20).padEnd(20),
      String(p.style || 'solid').slice(0, 10).padEnd(10),
    ];
    for (let i = 0; i < fields.length; i++) {
      const valBytes = enc.encode(values[i]);
      for (let j = 0; j < fields[i].size; j++) v.setUint8(off + j, valBytes[j] || 0x20);
      off += fields[i].size;
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
  return { shp: buildShpFile(features), shx: buildShxFile(features), dbf: buildDbfFile(features), prj: new TextEncoder().encode(PRJ_WKT) };
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
const METER_HEADERS = [
  'UID', 'Is Main', 'DMA Name', 'Account Name', 'Address', 'Provider', 'Communication',
  'Diameter (mm)', 'Status', 'Latitude', 'Longitude', 'Location Source', 'Additional IDs',
];

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

export function buildMeterDataRows(meters: any[], project: any, opts: any) {
  const installed = new Date().toISOString().slice(0, 10);
  const unit = unitLabel(project?.water_unit);
  return meters.map((m) => ({
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
  }));
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

// Generic SpreadsheetML writer for a fixed column list.
function buildSheetXls(sheetName: string, columns: string[], rows: any[]) {
  const esc = (v: any) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const header = columns.map((c) => `<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`).join('');
  const body = rows.map((r) =>
    `<Row>${columns.map((c) => `<Cell><Data ss:Type="String">${esc(r[c])}</Data></Cell>`).join('')}</Row>`
  ).join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${esc(sheetName)}">
  <Table>
   <Row>${header}</Row>
   ${body}
  </Table>
 </Worksheet>
</Workbook>`;
}

function buildMeterXls(meters: any[]) {
  const headers = METER_HEADERS;
  function escapeXML(val: any) {
    return String(val ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const headerCells = headers.map((h) => `<Cell><Data ss:Type="String">${escapeXML(h)}</Data></Cell>`).join('');
  const bodyRows = meters
    .map((m) => {
      const hasLoc = m.latitude != null && m.longitude != null;
      const addIds = (m.additional_ids || []).map((id: any) => `${id.label}: ${id.value}`).join('; ');
      const cells = [
        `<Cell><Data ss:Type="String">${escapeXML(m.uid || '')}</Data></Cell>`,
        `<Cell><Data ss:Type="String">${m.__is_main ? 'TRUE' : 'FALSE'}</Data></Cell>`,
        `<Cell><Data ss:Type="String">${escapeXML(m.__dma_name || '')}</Data></Cell>`,
        `<Cell><Data ss:Type="String">${escapeXML(m.payer_name || '')}</Data></Cell>`,
        `<Cell><Data ss:Type="String">${escapeXML(m.address || '')}</Data></Cell>`,
        `<Cell><Data ss:Type="String">${escapeXML(m.provider || '')}</Data></Cell>`,
        `<Cell><Data ss:Type="String">${escapeXML(m.communication_type || '')}</Data></Cell>`,
        m.diameter != null
          ? `<Cell><Data ss:Type="Number">${escapeXML(m.diameter)}</Data></Cell>`
          : `<Cell><Data ss:Type="String"></Data></Cell>`,
        `<Cell><Data ss:Type="String">${escapeXML(m.is_active ? 'Active' : 'Inactive')}</Data></Cell>`,
        hasLoc ? `<Cell><Data ss:Type="Number">${escapeXML(m.latitude)}</Data></Cell>` : `<Cell><Data ss:Type="String"></Data></Cell>`,
        hasLoc ? `<Cell><Data ss:Type="Number">${escapeXML(m.longitude)}</Data></Cell>` : `<Cell><Data ss:Type="String"></Data></Cell>`,
        `<Cell><Data ss:Type="String">${escapeXML(m.location_source || (hasLoc ? 'imported' : ''))}</Data></Cell>`,
        `<Cell><Data ss:Type="String">${escapeXML(addIds)}</Data></Cell>`,
      ].join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Meters">
  <Table>
   <Row>${headerCells}</Row>
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;
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
    const { project_id, analyze_only, preview_only, identifier_fields, meter_number_field } = await req.json();
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

    const JSZip = (await import('npm:jszip@3.10.1')).default;
    const innerZip = new JSZip();
    let totalFeatures = 0;
    let exportedLayers = 0;

    for (const layer of layers || []) {
      if (!layer.file_url || layer.layer_type !== 'shp') continue;
      let geojson;
      try {
        const res = await fetch(layer.file_url);
        if (!res.ok) continue;
        geojson = await res.json();
      } catch {
        continue;
      }

      const rawFeatures = (geojson.features || []).map((f: any) => ({
        geometry: f.geometry,
        properties: {
          name: f.properties?.name || f.properties?.Name || '',
          type: f.geometry?.type || '',
          color: layer.color || '',
          diameter: layer.pipe_config?.diameter_field ? String(f.properties?.[layer.pipe_config.diameter_field] ?? '') : '',
        },
      }));
      if (rawFeatures.length === 0) continue;

      const styled = isBoundaryLayer(layer.name)
        ? rawFeatures.map((f: any) => toOutline(f, BOUNDARY_OUTLINE_COLOR, 'dashed'))
        : rawFeatures;

      const groups = groupByGeometryType(styled);
      const baseName = sanitizeFileName(layer.name);
      for (const [category, feats] of Object.entries(groups)) {
        const suffix = Object.keys(groups).length > 1 ? `_${category}` : '';
        const fileBase = `${baseName}${suffix}`;
        const shpSet = buildShapefileSet(feats);
        innerZip.file(`${fileBase}.shp`, shpSet.shp);
        innerZip.file(`${fileBase}.shx`, shpSet.shx);
        innerZip.file(`${fileBase}.dbf`, shpSet.dbf);
        innerZip.file(`${fileBase}.prj`, shpSet.prj);
        totalFeatures += feats.length;
      }
      exportedLayers++;
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
    if (dmaFeatures.length > 0) {
      const shpSet = buildShapefileSet(dmaFeatures);
      innerZip.file('DMA.shp', shpSet.shp);
      innerZip.file('DMA.shx', shpSet.shx);
      innerZip.file('DMA.dbf', shpSet.dbf);
      innerZip.file('DMA.prj', shpSet.prj);
      totalFeatures += dmaFeatures.length;
    }

    const innerZipBytes = await innerZip.generateAsync({ type: 'uint8array' });

    const outerZip = new JSZip();
    outerZip.file('Shapefiles.zip', innerZipBytes);

    const analysis = analyzeMeters(meters, dmas || [], layers || []);

    const exportOpts = {
      identifierFields: identifier_fields?.length ? identifier_fields : ['address', 'meter_id'],
      meterNumberField: meter_number_field || 'meter_id',
    };
    const enc = new TextEncoder();

    // Meter Data — the LeakZon Main import format.
    outerZip.file('meter_data.xls', enc.encode(
      buildSheetXls('Meter Data', METER_DATA_COLUMNS, buildMeterDataRows(analysis.assigned, project, exportOpts))
    ));
    // Groups — which DMA each meter belongs to, and how it participates.
    outerZip.file('groups.xls', enc.encode(
      buildSheetXls('Groups', GROUPS_COLUMNS, buildGroupsRows(analysis.assigned, project, exportOpts))
    ));
    // Meters with no DMA keep their existing separate file, unchanged, so
    // nothing is silently lost and they can be reviewed apart from the rest.
    if (analysis.unassigned.length > 0) {
      outerZip.file('meters_no_dma.xls', enc.encode(buildMeterXls(analysis.unassigned)));
    }

    const zipBuffer = await outerZip.generateAsync({ type: 'base64' });
    const safeProjectName = sanitizeFileName(project.name);

    return json({
      zip: zipBuffer,
      zipName: `${safeProjectName}_Layers`,
      stats: {
        layers: exportedLayers,
        features: totalFeatures,
        meters: analysis.insights.metersTotal,
        dmas: (dmas || []).length,
      },
      insights: analysis.insights,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
