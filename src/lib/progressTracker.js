import { supabase } from "@/api/supabaseClient";

export const MILESTONES = [
  { activity_type: "project_created", title: "Project Created" },
  { activity_type: "boundary_set", title: "Boundary Defined" },
  { activity_type: "gis_layers_uploaded", title: "GIS Layers Uploaded" },
  { activity_type: "meters_imported", title: "Meter Data Imported" },
  { activity_type: "dmas_created", title: "DMAs Created" },
  { activity_type: "consumption_imported", title: "Consumption Data Imported" },
  { activity_type: "anomalies_exported", title: "Meter Anomalies Exported" },
  { activity_type: "data_exported", title: "Data Exported" },
  { activity_type: "onboarding_completed", title: "Onboarding Completed" },
];

export const TOTAL_MILESTONES = MILESTONES.length;

function getCurrentUserId() {
  try {
    const saved = localStorage.getItem("loggedInUser");
    if (saved) return JSON.parse(saved).id || null;
  } catch {}
  return null;
}

export async function recordProgress(projectId, activityType, description) {
  if (!projectId || !activityType) return;
  const milestone = MILESTONES.find((m) => m.activity_type === activityType);
  await supabase.from('project_progress').insert({
    project_id: projectId,
    activity_type: activityType,
    title: milestone?.title || activityType,
    description: description || undefined,
    user_id: getCurrentUserId(),
  });
}

// Dedupe by activity_type (keep earliest entry), compute completion stats
export function computeProgress(entries) {
  const byType = new Map();
  for (const e of (entries || [])) {
    if (!e.activity_type) continue;
    if (!byType.has(e.activity_type)) byType.set(e.activity_type, e);
  }
  const completed = byType.size;
  const completedList = [...byType.values()].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  const remaining = MILESTONES.filter((m) => !byType.has(m.activity_type));
  return {
    completed,
    total: TOTAL_MILESTONES,
    pct: Math.round((completed / TOTAL_MILESTONES) * 100),
    completedList,
    remaining,
  };
}