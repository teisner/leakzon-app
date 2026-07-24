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

function buildMeterXls(meters: any[]) {
  const headers = [
    'UID', 'Type', 'Account Name', 'Address', 'Provider', 'Communication', 'Diameter (mm)', 'Status', 'Latitude', 'Longitude', 'Location Source', 'Additional IDs',
  ];
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
        `<Cell><Data ss:Type="String">${escapeXML(m.is_main ? 'Main' : 'Sub')}</Data></Cell>`,
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
    const { project_id } = await req.json();
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

      const groups = groupByGeometryType(rawFeatures);
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
      dmaFeatures.push({
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { name: dma.name || '', type: 'Polygon', color: dma.color || '', diameter: '' },
      });
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

    const xlsContent = buildMeterXls(meters);
    outerZip.file('meters.xls', new TextEncoder().encode(xlsContent));

    const zipBuffer = await outerZip.generateAsync({ type: 'base64' });
    const safeProjectName = sanitizeFileName(project.name);

    return json({
      zip: zipBuffer,
      zipName: `${safeProjectName}_Layers`,
      stats: { layers: exportedLayers, features: totalFeatures, meters: meters.length, dmas: (dmas || []).length },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
