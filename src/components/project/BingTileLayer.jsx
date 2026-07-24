import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

// Convert tile coordinates to Bing's quadkey format
function tileToQuadKey(x, y, z) {
  let quadKey = "";
  for (let i = z; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadKey += digit.toString();
  }
  return quadKey;
}

// Custom Leaflet tile layer that resolves {q} to a Bing quadkey
const BingLayer = L.TileLayer.extend({
  getTileUrl(coords) {
    const quadKey = tileToQuadKey(coords.x, coords.y, coords.z);
    return L.Util.template(this._url, {
      s: this._getSubdomain(coords),
      q: quadKey,
    });
  },
});

export default function BingTileLayer({ url, attribution, subdomains }) {
  const map = useMap();

  useEffect(() => {
    const layer = new BingLayer(url, {
      attribution,
      subdomains: subdomains || "0123",
    });
    layer.addTo(map);
    return () => map.removeLayer(layer);
  }, [map, url, attribution, subdomains]);

  return null;
}