export function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const lati = polygon[i][0], lngi = polygon[i][1];
    const latj = polygon[j][0], lngj = polygon[j][1];
    const intersect = ((lati > lat) !== (latj > lat)) &&
      (lng < (lngj - lngi) * (lat - lati) / (latj - lati) + lngi);
    if (intersect) inside = !inside;
  }
  return inside;
}