// Replaces base44/functions/getCityBoundary/entry.ts. No project scope
// (callable before a project exists, during project creation) — original had
// no auth check at all; requires any logged-in caller so this server isn't
// an open proxy for Nominatim.
import { getCallerUser, json, CORS_HEADERS } from '../_shared/authz.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const user = await getCallerUser(req);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { city, state, country } = await req.json();
    if (!city || !country) return json({ error: 'city and country are required' }, 400);

    const params = new URLSearchParams({
      city,
      country,
      format: 'geojson',
      polygon_geojson: '1',
      limit: '5',
      addressdetails: '1',
    });
    if (state) params.set('state', state);
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'LeakZon-Onboarding/1.0', 'Accept-Language': 'en' },
    });
    if (!response.ok) return json({ error: `Nominatim API error: ${response.status}` }, 502);

    const data = await response.json();
    if (!data.features || data.features.length === 0) return json({ error: 'City boundary not found' }, 404);

    const feature = data.features[0];
    const geometry = feature.geometry;
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
      return json({ error: 'No boundary polygon available for this city' }, 404);
    }

    const boundaryGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: feature.properties?.display_name || `${city}, ${country}`, city, country },
          geometry,
        },
      ],
    };

    return json({ geojson: boundaryGeoJSON });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
