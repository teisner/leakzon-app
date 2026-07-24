import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null);

    const { file_url } = await req.json();
    if (!file_url) return Response.json({ error: 'file_url is required' }, { status: 400 });

    // Fetch the uploaded file
    const response = await fetch(file_url);
    if (!response.ok) {
      return Response.json({ error: `Failed to fetch file: ${response.status}` }, { status: 400 });
    }
    const arrayBuffer = await response.arrayBuffer();

    // Polyfill `global` for shpjs dependencies that expect a Node.js environment
    if (typeof globalThis.global === 'undefined') {
      globalThis.global = globalThis;
    }

    const shp = (await import('npm:shpjs@4.0.4')).default;

    let layers = [];
    const bytes = new Uint8Array(arrayBuffer);
    const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

    if (isZip) {
      const result = await shp(arrayBuffer);
      // shp() can return a single FeatureCollection or an array of them
      if (Array.isArray(result)) {
        layers = result.map((fc, i) => ({
          name: fc.fileName || `layer_${i + 1}`,
          geojson: fc,
        }));
      } else if (result && result.features && result.features.length > 0) {
        layers = [{ name: result.fileName || 'layer', geojson: result }];
      }
    } else {
      // Parse as individual .shp file (geometry only — .dbf holds properties)
      const geometries = shp.parseShp(arrayBuffer);
      const geojson = {
        type: "FeatureCollection",
        features: geometries.map((geom) => ({
          type: "Feature",
          geometry: geom,
          properties: {},
        })),
      };
      layers = [{ name: 'layer', geojson }];
    }

    if (layers.length === 0) {
      return Response.json({ error: 'No shapefiles (.shp) found in the uploaded file.' }, { status: 400 });
    }

    return Response.json({ layers });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});