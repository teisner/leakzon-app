// Meter ID and Account ID aren't columns on `meter` — they arrive as free-form
// label/value pairs in additional_ids, whatever the source file called them.
// The meter table and the XLS export both need to pull them out, and must agree
// on how, so the matching lives here rather than being duplicated.
export function findAdditionalId(meter, patterns) {
  const ids = meter?.additional_ids || [];
  const found = ids.find((id) => patterns.some((p) => new RegExp(p, "i").test(id.label || "")));
  return found ? found.value : "";
}

export const METER_ID_PATTERNS = ["^meter.?id$", "^meter$", "meter"];
export const ACCOUNT_ID_PATTERNS = ["account.?id", "^account$", "account"];

export const meterIdOf = (m) => findAdditionalId(m, METER_ID_PATTERNS);
export const accountIdOf = (m) => findAdditionalId(m, ACCOUNT_ID_PATTERNS);

// Writes a value back into additional_ids without disturbing anything else in
// there. The label a file happened to use is kept when one already matches, so
// editing a meter doesn't quietly rename the column it came in as; a value
// cleared to blank removes the entry rather than storing an empty one.
export function setAdditionalId(meter, patterns, canonicalLabel, value) {
  const ids = Array.isArray(meter?.additional_ids) ? [...meter.additional_ids] : [];
  const text = String(value ?? "").trim();
  const idx = ids.findIndex((id) => patterns.some((pat) => new RegExp(pat, "i").test(id.label || "")));

  if (idx === -1) {
    if (!text) return ids;
    return [...ids, { label: canonicalLabel, value: text }];
  }
  if (!text) return ids.filter((_, i) => i !== idx);
  ids[idx] = { ...ids[idx], value: text };
  return ids;
}

// The ID pairs that aren't Meter ID or Account ID — shown read-only so an
// import's extra columns are visible rather than silently carried.
export function otherAdditionalIds(meter) {
  const known = [...METER_ID_PATTERNS, ...ACCOUNT_ID_PATTERNS];
  return (meter?.additional_ids || []).filter(
    (id) => !known.some((pat) => new RegExp(pat, "i").test(id.label || ""))
  );
}
