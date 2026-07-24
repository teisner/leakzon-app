// Replaces base44/functions/reverseGeocodeAddress/entry.ts. Original called
// base44.auth.me() but ignored the result entirely (fake auth check) —
// requires a real logged-in caller now.
import { getCallerUser, json, CORS_HEADERS } from '../_shared/authz.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const user = await getCallerUser(req);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { lat, lng } = await req.json();
    if (lat == null || lng == null) return json({ error: 'lat and lng are required' }, 400);

    // Primary: Photon (Komoot) — only used when it returns street-level detail.
    try {
      const photonUrl = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
      const photonRes = await fetch(photonUrl, { headers: { 'Accept-Language': 'en' } });
      if (photonRes.ok) {
        const photonData = await photonRes.json();
        if (photonData.features && photonData.features.length > 0) {
          const props = photonData.features[0].properties || {};
          if (props.street) {
            const parts = [
              props.housenumber,
              props.street,
              props.district || props.suburb,
              props.city,
              props.state,
              props.postcode,
              props.country,
            ].filter(Boolean);
            const address = parts.join(', ');
            if (address) return json({ address, is_junction: false });
          }
        }
      }
    } catch {
      // Fall through to Nominatim
    }

    // Fallback: Nominatim
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`;
    const nomRes = await fetch(nomUrl, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'LeakZon/1.0 (reverse geocoding service)' },
    });
    if (!nomRes.ok) return json({ address: null, is_junction: false });
    const nomData = await nomRes.json();
    if (!nomData) return json({ address: null, is_junction: false });

    const a = nomData.address || {};
    const road = a.road || a.pedestrian || a.footway || a.path;
    const crossingRoad = a.crossing || a.junction;

    if (crossingRoad && road && crossingRoad !== road) {
      return json({ address: `${road}, corner with ${crossingRoad}`, is_junction: true });
    }

    const parts = [
      a.house_number,
      road,
      a.neighbourhood || a.suburb,
      a.city || a.town || a.village || a.hamlet,
      a.state,
      a.postcode,
      a.country,
    ].filter(Boolean);
    const address = parts.length > 0 ? parts.join(', ') : nomData.display_name || null;
    return json({ address, is_junction: false });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
