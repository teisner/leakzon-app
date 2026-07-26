// Customer sign-off on the network design, called from the shared customer
// view. The caller is an anonymous customer, so access is gated on the share
// token exactly like getCustomerModeData — never on a logged-in session.
//
// On approval: record the approver, lock the project (same fields the operator
// lock uses), and mark every onboarding wizard step done except the final
// "export to LeakZon", which is the operator's job afterwards. Those auto-marked
// steps are tagged so unlocking can remove exactly them and nothing the
// operator ticked themselves.
import { admin, json, CORS_HEADERS } from '../_shared/authz.ts';
import { validateCustomerToken } from '../_shared/customerToken.ts';

// Mirrors WIZARD_STEPS in src/components/project/OnboardingWizard.jsx, minus
// data_exported (export to LeakZon stays outstanding after sign-off).
const AUTO_COMPLETED_STEPS = [
  'gis_layers_uploaded',
  'meters_imported',
  'consumption_imported',
  'gis_completed',
  'anomalies_exported',
  'dmas_created',
  'isolated_points_marked',
  'network_designed',
];

export const APPROVAL_PROGRESS_TAG = 'customer_approval';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const { project_id, token, approver_name } = await req.json();
    if (!project_id) return json({ error: 'project_id is required' }, 400);
    if (!approver_name || !String(approver_name).trim()) {
      return json({ error: 'approver_name is required' }, 400);
    }

    const tokenCheck = await validateCustomerToken(project_id, token);
    if (!tokenCheck.valid) return json({ error: tokenCheck.error }, 403);

    const { data: project } = await admin
      .from('project')
      .select('id, locked, approval_requested, customer_approved_at')
      .eq('id', project_id)
      .single();
    if (!project) return json({ error: 'Project not found' }, 404);
    if (!project.approval_requested) {
      return json({ error: 'Approval has not been requested for this project' }, 409);
    }
    if (project.customer_approved_at) {
      return json({ error: 'This design has already been approved' }, 409);
    }

    const name = String(approver_name).trim().slice(0, 120);
    const now = new Date().toISOString();

    const { error: updErr } = await admin
      .from('project')
      .update({
        customer_approved_by: name,
        customer_approved_at: now,
        locked: true,
        locked_date: now,
        locked_by_id: null, // a customer, not a system_user
      })
      .eq('id', project_id);
    if (updErr) return json({ error: updErr.message }, 500);

    // Mark the wizard steps done, skipping any already recorded so the
    // operator's own timestamps aren't duplicated.
    const { data: existing } = await admin
      .from('project_progress')
      .select('activity_type')
      .eq('project_id', project_id);
    const done = new Set((existing || []).map((e) => e.activity_type));
    const rows = AUTO_COMPLETED_STEPS.filter((a) => !done.has(a)).map((activity_type) => ({
      project_id,
      activity_type,
      title: activity_type,
      description: APPROVAL_PROGRESS_TAG,
    }));
    if (rows.length > 0) await admin.from('project_progress').insert(rows);

    return json({
      success: true,
      approved_by: name,
      approved_at: now,
      steps_marked: rows.length,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
