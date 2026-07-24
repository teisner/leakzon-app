// Shared share-token validation for the customer-facing (anonymous) surface
// — getCustomerModeData, manageCustomerAnnotations, and the "validate" action
// of manageCustomerViewLinks all gate access the same way.
//
// Fixes a real bug found in the original getCustomerModeData: a project that
// never had a CustomerViewLink created (or whose only links are disabled/
// expired) fell through to full, unauthenticated access. This version denies
// by default whenever no valid token is presented — no more open-by-absence.
import { admin } from './authz.ts';

export async function validateCustomerToken(
  projectId: string,
  token: string | undefined | null
): Promise<{ valid: boolean; error?: string; expiresAt?: string }> {
  if (!token) {
    return { valid: false, error: 'A valid link token is required to access this view' };
  }
  const { data: link } = await admin
    .from('customer_view_link')
    .select('*')
    .eq('project_id', projectId)
    .eq('token', token)
    .eq('is_active', true)
    .maybeSingle();

  if (!link) return { valid: false, error: 'Invalid or disabled link' };
  if (new Date(link.expires_at) < new Date()) return { valid: false, error: 'This link has expired' };
  return { valid: true, expiresAt: link.expires_at };
}
