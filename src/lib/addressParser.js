// Parse a free-form address (Hebrew or English) into { street, number }.
// Handles patterns like: "האירוס 15", "רחוב האירוס 15", "15 האירוס", "האירוס 15 דירה 3"

export function parseAddress(address) {
  if (!address || typeof address !== "string") return null;

  const trimmed = address.trim();
  if (!trimmed) return null;

  // Find the first standalone number (house number) — must be 1-5 digits, not part of a longer token
  const numberMatch = trimmed.match(/\b(\d{1,5})\b/);
  if (!numberMatch) {
    const street = normalizeStreet(trimmed);
    return { street, number: null };
  }

  const houseNumber = parseInt(numberMatch[1], 10);
  const numberIndex = numberMatch.index;

  // Street name = text before the number, with common prefixes removed
  let street = trimmed.substring(0, numberIndex).trim();
  street = stripPrefix(street);

  // If nothing before the number, try after it (e.g. "15 האירוס")
  if (!street) {
    let after = trimmed.substring(numberIndex + numberMatch[0].length).trim();
    after = after.split(/[,;]/)[0].trim();
    street = stripPrefix(after);
  }

  return { street: normalizeStreet(street), number: houseNumber };
}

function stripPrefix(street) {
  return street
    .replace(/^(רחוב|רחוב\s+|street|st\.?)\s+/i, "")
    .trim();
}

function normalizeStreet(street) {
  if (!street) return "";
  // Remove apartment / floor / entrance suffixes
  return street
    .replace(/[,;]/g, "")
    .replace(/\s+(דירה|חדר|קומה|כניסה|entrance|apt|apartment|floor|fl)\s*\d*.*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Utility address data mixes abbreviations freely — the same street shows up as
// "MARTIN DR" and "MARTIN DRIVE", "N SEVENTH ST" and "NORTH SEVENTH STREET",
// sometimes with a trailing period. Grouping on the raw text split those into
// separate streets, which is why estimation offered nothing for a meter whose
// street plainly had located neighbours: it was looking for "martin dr" while
// they were filed under "martin drive". On Obion TN this collapsed 175 street
// groups to 146 and made 11 more meters estimable.
const STREET_TYPES = {
  st: "street", str: "street", rd: "road", dr: "drive", ave: "avenue", av: "avenue",
  ln: "lane", ct: "court", cir: "circle", blvd: "boulevard", hwy: "highway",
  pl: "place", trl: "trail", pkwy: "parkway", ter: "terrace", sq: "square",
  rte: "route", cv: "cove", xing: "crossing", byp: "bypass", expy: "expressway",
};
const DIRECTIONS = {
  n: "north", s: "south", e: "east", w: "west",
  ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
};

// Stable lowercase key for grouping meters by street
export function getStreetKey(address) {
  const parsed = parseAddress(address);
  if (!parsed || !parsed.street) return null;
  return normalizeStreetKey(parsed.street);
}

// Exported so every caller groups by exactly the same key. Three places used to
// compute it inline and one of them differed, which is how the queue and the
// interpolation could disagree about which meters share a street.
export function normalizeStreetKey(street) {
  if (!street) return null;
  const key = String(street)
    .toLowerCase()
    .split(/\s+/)
    // Trailing dots on abbreviations ("RD."), and the stray markers that turn up
    // in imported address fields.
    .map((w) => w.replace(/[.,]+$/, "").replace(/^[%#]+/, ""))
    .filter(Boolean)
    // 7th -> 7, so "7th st" and "7 st" are one street.
    .map((w) => w.replace(/^(\d+)(st|nd|rd|th)$/, "$1"))
    .map((w) => STREET_TYPES[w] || DIRECTIONS[w] || w)
    .join(" ")
    .trim();
  return key || null;
}