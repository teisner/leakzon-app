import { invokeFunction } from "@/api/functionsClient";

/**
 * Invokes a Supabase Edge Function for anonymous (unauthenticated) customer-
 * mode callers — e.g. manageCustomerAnnotations, which validates its own
 * share token rather than relying on a logged-in session.
 *
 * @param {string} functionName - The backend function name
 * @param {object} payload - The request body
 * @returns {Promise<object>} - The response data
 */
export async function callFunction(functionName, payload) {
  const res = await invokeFunction(functionName, payload || {});
  return res.data;
}