import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null);

    const body = await req.json();
    const { lat, lng } = body;
    if (lat == null || lng == null) {
      return Response.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    // ─── Primary: Photon (Komoot) — OSM-based, no strict rate limits ──
    // Only use Photon when it returns street-level detail; otherwise
    // fall through to Nominatim for more precise results.
    try {
      const photonUrl = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
      const photonRes = await fetch(photonUrl, {
        headers: { "Accept-Language": "en" },
      });
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
            const address = parts.join(", ");
            if (address) {
              return Response.json({ address, is_junction: false });
            }
          }
        }
      }
    } catch {
      // Fall through to Nominatim fallback
    }

    // ─── Fallback: Nominatim (OpenStreetMap) ────────────────────────
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`;
    const nomRes = await fetch(nomUrl, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "LeakZon/1.0 (reverse geocoding service)",
      },
    });
    if (!nomRes.ok) {
      return Response.json({ address: null, is_junction: false });
    }
    const nomData = await nomRes.json();
    if (!nomData) {
      return Response.json({ address: null, is_junction: false });
    }

    const a = nomData.address || {};
    const road = a.road || a.pedestrian || a.footway || a.path;
    const crossingRoad = a.crossing || a.junction;

    if (crossingRoad && road && crossingRoad !== road) {
      return Response.json({
        address: `${road}, corner with ${crossingRoad}`,
        is_junction: true,
      });
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
    const address = parts.length > 0 ? parts.join(", ") : nomData.display_name || null;
    return Response.json({ address, is_junction: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});