// Replaces base44/functions/parseShapefile/entry.ts. shpjs usage is portable
// as-is — Supabase Edge Functions run Deno just like Base44's did, and Deno
// supports npm: specifiers the same way. Original called base44.auth.me()
// but ignored the result — requires a real logged-in caller now.
import { getCallerUser, json, CORS_HEADERS } from '../_shared/authz.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const user = await getCallerUser(req);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { file_url } = await req.json();
    if (!file_url) return json({ error: 'file_url is required' }, 400);

    const response = await fetch(file_url);
    if (!response.ok) return json({ error: `Failed to fetch file: ${response.status}` }, 400);
    const arrayBuffer = await response.arrayBuffer();

    // Polyfill `global` for shpjs dependencies that expect a Node.js environment
    if (typeof (globalThis as any).global === 'undefined') {
      (globalThis as any).global = globalThis;
    }

    const shp = (await import('npm:shpjs@4.0.4')).default;

    let layers: { name: string; geojson: any }[] = [];
    const bytes = new Uint8Array(arrayBuffer);
    const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

    if (isZip) {
      const result = await shp(arrayBuffer);
      if (Array.isArray(result)) {
        layers = result.map((fc: any, i: number) => ({ name: fc.fileName || `layer_${i + 1}`, geojson: fc }));
      } else if (result && result.features && result.features.length > 0) {
        layers = [{ name: result.fileName || 'layer', geojson: result }];
      }
    } else {
      const geometries = shp.parseShp(arrayBuffer);
      const geojson = {
        type: 'FeatureCollection',
        features: geometries.map((geom: any) => ({ type: 'Feature', geometry: geom, properties: {} })),
      };
      layers = [{ name: 'layer', geojson }];
    }

    if (layers.length === 0) return json({ error: 'No shapefiles (.shp) found in the uploaded file.' }, 400);

    return json({ layers });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
