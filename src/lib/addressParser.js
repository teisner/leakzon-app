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

// Stable lowercase key for grouping meters by street
export function getStreetKey(address) {
  const parsed = parseAddress(address);
  if (!parsed || !parsed.street) return null;
  return parsed.street.toLowerCase().replace(/\s+/g, " ").trim();
}