import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// --- Binary write helpers (little-endian) ---
function setDouble(view, offset, value) {
  view.setFloat64(offset, value, true);
}
function setInt32(view, offset, value) {
  view.setInt32(offset, value, true);
}
function setInt32BE(view, offset, value) {
  view.setInt32(offset, value, false);
}

// Collect all coordinates from a feature's geometry
function getCoords(geometry) {
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

// Determine the shape type code from a geometry type
// 1 = Point, 3 = Polyline, 5 = Polygon
function getShapeType(geometryType) {
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

// Extract parts and points for a single feature (for polyline/polygon)
function getPartsAndPoints(geometry) {
  if (!geometry) return { parts: [0], points: [] };
  const { type, coordinates } = geometry;
  let rings = [];
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
      rings = [[coordinates[0], coordinates[1]]];
      break;
    case 'MultiPoint':
      rings = [coordinates.map((c) => [c[0], c[1]])];
      break;
    default:
      rings = [];
  }
  const parts = [];
  const points = [];
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

// Build SHP file for a set of features (handles Point, Polyline, Polygon)
function buildShpFile(features) {
  const headerSize = 100;
  const shapeType = features.length > 0
    ? getShapeType(features[0].geometry?.type)
    : 1;

  let contentBytes = 0;
  const records = features.map((f, i) => {
    const { parts, points } = getPartsAndPoints(f.geometry);
    const numParts = parts.length;
    const numPoints = points.length;
    let recContent;
    if (shapeType === 1) {
      // Point: shapeType(4) + x(8) + y(8) = 20
      recContent = 4 + 16;
    } else {
      // Polyline/Polygon: shapeType(4) + bbox(32) + numParts(4) + numPoints(4) + parts(4*numParts) + points(16*numPoints)
      recContent = 4 + 32 + 4 + 4 + 4 * numParts + 16 * numPoints;
    }

    contentBytes += 8 + recContent;

    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    if (shapeType === 1) {
      const c = f.geometry?.type === 'Point'
        ? f.geometry.coordinates
        : getCoords(f.geometry)[0] || [0, 0];
      xmin = xmax = c[0];
      ymin = ymax = c[1];
      return { pt: c, recContent };
    } else {
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

  // Global bounding box
  const allPts = features.flatMap((f) => getCoords(f.geometry));
  if (allPts.length > 0) {
    setDouble(v, 36, Math.min(...allPts.map((c) => c[0])));
    setDouble(v, 44, Math.min(...allPts.map((c) => c[1])));
    setDouble(v, 52, Math.max(...allPts.map((c) => c[0])));
    setDouble(v, 60, Math.max(...allPts.map((c) => c[1])));
  }
  setDouble(v, 68, 0); setDouble(v, 76, 0); setDouble(v, 84, 0); setDouble(v, 92, 0);

  let off = headerSize;
  records.forEach((r, i) => {
    setInt32BE(v, off, i + 1);
    setInt32BE(v, off + 4, r.recContent / 2);
    off += 8;
    setInt32(v, off, shapeType);

    if (shapeType === 1) {
      setDouble(v, off + 4, r.pt[0]);
      setDouble(v, off + 12, r.pt[1]);
      off += r.recContent;
    } else {
      // Bounding box
      setDouble(v, off + 4, r.xmin);
      setDouble(v, off + 12, r.ymin);
      setDouble(v, off + 20, r.xmax);
      setDouble(v, off + 28, r.ymax);
      // numParts and numPoints
      setInt32(v, off + 36, r.numParts);
      setInt32(v, off + 40, r.numPoints);
      // parts array
      let ptOff = off + 44;
      for (const p of r.parts) {
        setInt32(v, ptOff, p);
        ptOff += 4;
      }
      // points array
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

function buildShxFile(features) {
  const headerSize = 100;
  const shapeType = features.length > 0
    ? getShapeType(features[0].geometry?.type)
    : 1;
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

  let shpOffset = headerSize / 2; // in 16-bit words
  let off = headerSize;
  for (const f of features) {
    const { parts, points } = getPartsAndPoints(f.geometry);
    const numParts = parts.length;
    const numPoints = points.length;
    let recContent;
    if (shapeType === 1) {
      recContent = 4 + 16;
    } else {
      recContent = 4 + 32 + 4 + 4 + 4 * numParts + 16 * numPoints;
    }
    setInt32BE(v, off, shpOffset);
    setInt32BE(v, off + 4, recContent / 2);
    off += 8;
    shpOffset += (8 + recContent) / 2;
  }

  return new Uint8Array(buf);
}

function buildDbfFile(features) {
  const fields = [
    { name: "name", type: "C", size: 50 },
    { name: "type", type: "C", size: 15 },
    { name: "color", type: "C", size: 10 },
    { name: "diameter", type: "C", size: 20 },
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
  v.setUint8(off, 0x0D);

  off = headerSize;
  for (const f of features) {
    v.setUint8(off, 0x20);
    off += 1;
    const p = f.properties || {};
    const values = [
      String(p.name || "").slice(0, 50).padEnd(50),
      String(p.type || "").slice(0, 15).padEnd(15),
      String(p.color || "").slice(0, 10).padEnd(10),
      String(p.diameter || "").slice(0, 20).padEnd(20),
    ];
    for (let i = 0; i < fields.length; i++) {
      const valBytes = enc.encode(values[i]);
      for (let j = 0; j < fields[i].size; j++) v.setUint8(off + j, valBytes[j] || 0x20);
      off += fields[i].size;
    }
  }
  v.setUint8(off, 0x1A);

  return new Uint8Array(buf);
}

const PRJ_WKT = `GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]`;

function sanitizeFileName(name) {
  return String(name || "layer")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 60)
    .replace(/^_+|_+$/g, "") || "layer";
}

// Build shapefile bytes for a single set of features
function buildShapefileSet(features) {
  return {
    shp: buildShpFile(features),
    shx: buildShxFile(features),
    dbf: buildDbfFile(features),
    prj: new TextEncoder().encode(PRJ_WKT),
  };
}

// Group features by geometry type so each shapefile is homogeneous
function groupByGeometryType(features) {
  const groups = {};
  for (const f of features) {
    const gtype = f.geometry?.type || "Point";
    const shapeCategory = getShapeType(gtype) === 1 ? "point"
      : getShapeType(gtype) === 3 ? "line"
      : "polygon";
    if (!groups[shapeCategory]) groups[shapeCategory] = [];
    groups[shapeCategory].push(f);
  }
  return groups;
}

function buildMeterXls(meters) {
  const headers = ["UID", "Type", "Account Name", "Address", "Provider", "Communication", "Diameter (mm)", "Status", "Latitude", "Longitude", "Location Source", "Additional IDs"];

  function escapeXML(val) {
    return String(val ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  const headerCells = headers.map((h) => `<Cell><Data ss:Type="String">${escapeXML(h)}</Data></Cell>`).join("");
  const bodyRows = meters.map((m) => {
    const hasLoc = m.latitude != null && m.longitude != null;
    const addIds = (m.additional_ids || []).map((id) => `${id.label}: ${id.value}`).join("; ");
    const cells = [
      `<Cell><Data ss:Type="String">${escapeXML(m.uid || "")}</Data></Cell>`,
      `<Cell><Data ss:Type="String">${escapeXML(m.is_main ? "Main" : "Sub")}</Data></Cell>`,
      `<Cell><Data ss:Type="String">${escapeXML(m.payer_name || "")}</Data></Cell>`,
      `<Cell><Data ss:Type="String">${escapeXML(m.address || "")}</Data></Cell>`,
      `<Cell><Data ss:Type="String">${escapeXML(m.provider || "")}</Data></Cell>`,
      `<Cell><Data ss:Type="String">${escapeXML(m.communication_type || "")}</Data></Cell>`,
      m.diameter != null
        ? `<Cell><Data ss:Type="Number">${escapeXML(m.diameter)}</Data></Cell>`
        : `<Cell><Data ss:Type="String"></Data></Cell>`,
      `<Cell><Data ss:Type="String">${escapeXML(m.is_active ? "Active" : "Inactive")}</Data></Cell>`,
      hasLoc ? `<Cell><Data ss:Type="Number">${escapeXML(m.latitude)}</Data></Cell>` : `<Cell><Data ss:Type="String"></Data></Cell>`,
      hasLoc ? `<Cell><Data ss:Type="Number">${escapeXML(m.longitude)}</Data></Cell>` : `<Cell><Data ss:Type="String"></Data></Cell>`,
      `<Cell><Data ss:Type="String">${escapeXML(m.location_source || (hasLoc ? "imported" : ""))}</Data></Cell>`,
      `<Cell><Data ss:Type="String">${escapeXML(addIds)}</Data></Cell>`,
    ].join("");
    return `<Row>${cells}</Row>`;
  }).join("");

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

async function fetchAll(base44, entityName, query, sort = "id") {
  const all = [];
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    const batch = await base44.asServiceRole.entities[entityName].filter(query, sort, PAGE_SIZE, skip);
    all.push(...batch);
    hasMore = batch.length === PAGE_SIZE;
    skip += batch.length;
  }
  return all;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null);

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: "project_id is required" }, { status: 400 });

    const project = await base44.asServiceRole.entities.Project.get(project_id);
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

    const [layers, meters, dmas] = await Promise.all([
      base44.asServiceRole.entities.ProjectLayer.filter({ project_id }, "sort_order"),
      fetchAll(base44, "Meter", { project_id }),
      base44.asServiceRole.entities.Dma.filter({ project_id }, "sort_order"),
    ]);

    const JSZip = (await import("npm:jszip@3.10.1")).default;

    // Inner ZIP: all shapefiles
    const innerZip = new JSZip();
    let totalFeatures = 0;
    let exportedLayers = 0;

    for (const layer of layers) {
      if (!layer.file_url || layer.layer_type !== "shp") continue;
      let geojson;
      try {
        const res = await fetch(layer.file_url);
        if (!res.ok) continue;
        geojson = await res.json();
      } catch { continue; }

      const rawFeatures = (geojson.features || []).map((f) => ({
        geometry: f.geometry,
        properties: {
          name: f.properties?.name || f.properties?.Name || "",
          type: f.geometry?.type || "",
          color: layer.color || "",
          diameter: layer.pipe_config?.diameter_field
            ? String(f.properties?.[layer.pipe_config.diameter_field] ?? "")
            : "",
        },
      }));
      if (rawFeatures.length === 0) continue;

      // Group by geometry category to ensure homogeneous shapefiles
      const groups = groupByGeometryType(rawFeatures);
      const baseName = sanitizeFileName(layer.name);
      for (const [category, feats] of Object.entries(groups)) {
        const suffix = Object.keys(groups).length > 1 ? `_${category}` : "";
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

    // DMA as polygon shapefile
    const dmaFeatures = [];
    for (const dma of dmas) {
      let poly;
      try { poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon; } catch { continue; }
      if (!Array.isArray(poly) || poly.length < 3) continue;
      const ring = poly.map(([lat, lng]) => [lng, lat]);
      ring.push(ring[0]);
      dmaFeatures.push({
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {
          name: dma.name || "",
          type: "Polygon",
          color: dma.color || "",
          diameter: "",
        },
      });
    }
    if (dmaFeatures.length > 0) {
      const shpSet = buildShapefileSet(dmaFeatures);
      innerZip.file("DMA.shp", shpSet.shp);
      innerZip.file("DMA.shx", shpSet.shx);
      innerZip.file("DMA.dbf", shpSet.dbf);
      innerZip.file("DMA.prj", shpSet.prj);
      totalFeatures += dmaFeatures.length;
    }

    const innerZipBytes = await innerZip.generateAsync({ type: "uint8array" });

    // Outer ZIP: inner shapefiles ZIP + meters XLS
    const outerZip = new JSZip();
    outerZip.file("Shapefiles.zip", innerZipBytes);

    const xlsContent = buildMeterXls(meters);
    const xlsBytes = new TextEncoder().encode(xlsContent);
    outerZip.file("meters.xls", xlsBytes);

    const zipBuffer = await outerZip.generateAsync({ type: "base64" });

    const safeProjectName = sanitizeFileName(project.name);

    return Response.json({
      zip: zipBuffer,
      zipName: `${safeProjectName}_Layers`,
      stats: {
        layers: exportedLayers,
        features: totalFeatures,
        meters: meters.length,
        dmas: dmas.length,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});