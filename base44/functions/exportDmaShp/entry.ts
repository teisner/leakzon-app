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

function buildShpFile(features) {
  const headerSize = 100;
  let contentBytes = 0;
  const records = features.map((f, i) => {
    const ring = f.geometry.coordinates[0];
    const numPoints = ring.length;
    const numParts = 1;
    const recContent = 4 + 32 + 4 + 4 + 4 * numParts + 16 * numPoints;
    contentBytes += 8 + recContent;
    const xs = ring.map((c) => c[0]);
    const ys = ring.map((c) => c[1]);
    return {
      numPoints, numParts, recContent, ring,
      xmin: Math.min(...xs), ymin: Math.min(...ys),
      xmax: Math.max(...xs), ymax: Math.max(...ys),
    };
  });

  const totalBytes = headerSize + contentBytes;
  const buf = new ArrayBuffer(totalBytes);
  const v = new DataView(buf);

  setInt32BE(v, 0, 9994);
  setInt32BE(v, 24, totalBytes / 2);
  setInt32(v, 28, 1000);
  setInt32(v, 32, 5); // Polygon

  const allXs = features.flatMap((f) => f.geometry.coordinates[0].map((c) => c[0]));
  const allYs = features.flatMap((f) => f.geometry.coordinates[0].map((c) => c[1]));
  setDouble(v, 36, Math.min(...allXs));
  setDouble(v, 44, Math.min(...allYs));
  setDouble(v, 52, Math.max(...allXs));
  setDouble(v, 60, Math.max(...allYs));
  setDouble(v, 68, 0); setDouble(v, 76, 0); setDouble(v, 84, 0); setDouble(v, 92, 0);

  let off = headerSize;
  records.forEach((r, i) => {
    setInt32BE(v, off, i + 1);
    setInt32BE(v, off + 4, r.recContent / 2);
    off += 8;
    setInt32(v, off, 5);
    setDouble(v, off + 4, r.xmin);
    setDouble(v, off + 12, r.ymin);
    setDouble(v, off + 20, r.xmax);
    setDouble(v, off + 28, r.ymax);
    setInt32(v, off + 36, r.numParts);
    setInt32(v, off + 40, r.numPoints);
    setInt32(v, off + 44, 0); // parts[0]
    let ptOff = off + 48;
    for (const [x, y] of r.ring) {
      setDouble(v, ptOff, x);
      setDouble(v, ptOff + 8, y);
      ptOff += 16;
    }
    off += r.recContent;
  });

  return new Uint8Array(buf);
}

function buildShxFile(features) {
  const headerSize = 100;
  const totalBytes = headerSize + features.length * 8;
  const buf = new ArrayBuffer(totalBytes);
  const v = new DataView(buf);

  setInt32BE(v, 0, 9994);
  setInt32BE(v, 24, totalBytes / 2);
  setInt32(v, 28, 1000);
  setInt32(v, 32, 5);

  const allXs = features.flatMap((f) => f.geometry.coordinates[0].map((c) => c[0]));
  const allYs = features.flatMap((f) => f.geometry.coordinates[0].map((c) => c[1]));
  setDouble(v, 36, Math.min(...allXs));
  setDouble(v, 44, Math.min(...allYs));
  setDouble(v, 52, Math.max(...allXs));
  setDouble(v, 60, Math.max(...allYs));
  setDouble(v, 68, 0); setDouble(v, 76, 0); setDouble(v, 84, 0); setDouble(v, 92, 0);

  let shpOffset = headerSize / 2; // in 16-bit words
  let off = headerSize;
  for (const f of features) {
    const numPoints = f.geometry.coordinates[0].length;
    const recContent = 4 + 32 + 4 + 4 + 4 + 16 * numPoints;
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
    { name: "color", type: "C", size: 10 },
    { name: "meter_cnt", type: "N", size: 10, decimals: 0 },
    { name: "sort_order", type: "N", size: 10, decimals: 0 },
  ];
  const headerSize = 32 + fields.length * 32 + 1;
  const recordSize = 1 + fields.reduce((s, f) => s + f.size, 0);
  const totalBytes = headerSize + features.length * recordSize + 1;

  const buf = new ArrayBuffer(totalBytes);
  const v = new DataView(buf);
  const enc = new TextEncoder();

  // Header
  v.setUint8(0, 0x03);
  const now = new Date();
  v.setUint8(1, now.getFullYear() - 1900);
  v.setUint8(2, now.getMonth() + 1);
  v.setUint8(3, now.getDate());
  setInt32(v, 4, features.length);
  setInt32(v, 8, headerSize);
  setInt32(v, 12, recordSize);
  // bytes 16-31 reserved (0)

  // Field descriptors
  let off = 32;
  for (const field of fields) {
    const nameBytes = enc.encode(field.name.slice(0, 10));
    for (let i = 0; i < 10; i++) {
      v.setUint8(off + i, nameBytes[i] || 0);
    }
    v.setUint8(off + 11, field.type.charCodeAt(0));
    setInt32(v, off + 16, field.size);
    v.setUint8(off + 20, field.decimals || 0);
    off += 32;
  }
  v.setUint8(off, 0x0D); // terminator

  // Records
  off = headerSize;
  for (const f of features) {
    v.setUint8(off, 0x20); // deletion flag (space = not deleted)
    off += 1;
    const props = f.properties || {};
    const values = [
      String(props.name || "").slice(0, 50).padEnd(50),
      String(props.color || "").slice(0, 10).padEnd(10),
      String(props.meter_cnt || 0).padStart(10, " "),
      String(props.sort_order || 0).padStart(10, " "),
    ];
    for (let i = 0; i < fields.length; i++) {
      const valBytes = enc.encode(values[i]);
      for (let j = 0; j < fields[i].size; j++) {
        v.setUint8(off + j, valBytes[j] || 0x20);
      }
      off += fields[i].size;
    }
  }
  v.setUint8(off, 0x1A); // EOF marker

  return new Uint8Array(buf);
}

const PRJ_WKT = `GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null);

    const { dmas } = await req.json();
    if (!dmas || !Array.isArray(dmas) || dmas.length === 0) {
      return Response.json({ error: 'dmas array is required' }, { status: 400 });
    }

    const features = dmas.map((dma) => {
      const polygon = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
      const ring = polygon.map(([lat, lng]) => [lng, lat]);
      ring.push(ring[0]);
      return {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {
          name: dma.name || "",
          color: dma.color || "",
          meter_cnt: dma.meter_count || 0,
          sort_order: dma.sort_order || 0,
        },
      };
    });

    const shpBytes = buildShpFile(features);
    const shxBytes = buildShxFile(features);
    const dbfBytes = buildDbfFile(features);
    const prjBytes = new TextEncoder().encode(PRJ_WKT);

    // Zip the files using JSZip
    const JSZip = (await import('npm:jszip@3.10.1')).default;
    const zip = new JSZip();
    zip.file("dmas.shp", shpBytes);
    zip.file("dmas.shx", shxBytes);
    zip.file("dmas.dbf", dbfBytes);
    zip.file("dmas.prj", prjBytes);

    const zipBuffer = await zip.generateAsync({ type: "base64" });

    return Response.json({ zip: zipBuffer });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});