import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const { city, state, country } = await req.json();

    if (!city || !country) {
      return Response.json({ error: 'city and country are required' }, { status: 400 });
    }

    // Use Nominatim structured search — free-text search can return county/region
    // instead of the actual city boundary. Structured search with city= targets
    // the correct administrative boundary directly.
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
      headers: {
        'User-Agent': 'FlowState-Onboarding/1.0',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      return Response.json({ error: `Nominatim API error: ${response.status}` }, { status: 502 });
    }

    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      return Response.json({ error: 'City boundary not found' }, { status: 404 });
    }

    const feature = data.features[0];
    const geometry = feature.geometry;

    // Only accept polygon or multipolygon geometries
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
      return Response.json({ error: 'No boundary polygon available for this city' }, { status: 404 });
    }

    // Return a clean GeoJSON FeatureCollection
    const boundaryGeoJSON = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: feature.properties?.display_name || `${city}, ${country}`,
          city,
          country,
        },
        geometry,
      }],
    };

    return Response.json({ geojson: boundaryGeoJSON });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});