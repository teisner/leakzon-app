import L from "leaflet";

const SHAPE_PATHS = {
  star: "M12 2 L14.9 8.6 L22 9.3 L16.5 14.1 L18.2 21 L12 17.3 L5.8 21 L7.5 14.1 L2 9.3 L9.1 8.6 Z",
  square: "M4 4 H20 V20 H4 Z",
  triangle: "M12 3 L21 20 H3 Z",
};

// `strokeColor` is the optional separate outline color; it defaults to the
// shape color, which is the original single-color behavior.
export function createShapeIcon(shape, color, radius, fillStyle, strokeColor) {
  const isOutline = fillStyle === "outline";
  const fill = isOutline ? "transparent" : color;
  const stroke = strokeColor || color;
  const px = radius * 2;
  const path = SHAPE_PATHS[shape];
  if (!path) return null;

  const svg = `<svg width="${px}" height="${px}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));">
    <path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" />
  </svg>`;

  return L.divIcon({
    html: svg,
    className: "shape-marker",
    iconSize: [px, px],
    iconAnchor: [px / 2, px / 2],
    popupAnchor: [0, -px / 2],
  });
}

export const SHAPE_OPTIONS = [
  { value: "circle", label: "Circle" },
  { value: "star", label: "Star" },
  { value: "square", label: "Square" },
  { value: "triangle", label: "Triangle" },
];