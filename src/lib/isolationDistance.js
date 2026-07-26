// The pairing distance used by "Find border valves": two valves on opposite
// sides of a DMA boundary are treated as a candidate isolation point when
// they're within this distance of each other.
//
// Stored canonically in metres on project.isolation_distance_meters. The column
// is nullable so "not configured yet" can fall back to a unit-aware default:
// 100 ft for imperial projects and 30 m for metric ones — the same distance
// either way (100 ft is 30.48 m).
const FEET_TO_METERS = 0.3048;

export const DEFAULT_ISOLATION_METRIC_M = 30;
export const DEFAULT_ISOLATION_IMPERIAL_FT = 100;

export const isImperialProject = (project) => project?.distance_unit === "Miles";

export const metersToFeet = (m) => m / FEET_TO_METERS;
export const feetToMeters = (ft) => ft * FEET_TO_METERS;

// Effective distance in metres (what the geometry code needs).
export function isolationDistanceMeters(project) {
  const stored = project?.isolation_distance_meters;
  if (stored != null && !isNaN(Number(stored)) && Number(stored) > 0) return Number(stored);
  return isImperialProject(project)
    ? feetToMeters(DEFAULT_ISOLATION_IMPERIAL_FT)
    : DEFAULT_ISOLATION_METRIC_M;
}

// The same value expressed in the project's own unit, for display/editing.
export function isolationDistanceDisplay(project) {
  const meters = isolationDistanceMeters(project);
  return isImperialProject(project)
    ? { value: Math.round(metersToFeet(meters)), unit: "ft" }
    : { value: Math.round(meters), unit: "m" };
}

// Converts a value typed in the project's unit back to metres for storage.
export function displayToMeters(project, value) {
  return isImperialProject(project) ? feetToMeters(value) : value;
}
