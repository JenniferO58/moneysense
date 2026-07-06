import { createClient } from '@supabase/supabase-js';

// Service role client — used server-side only, bypasses RLS intentionally
// since these functions verify the user's identity themselves via JWT below,
// then act on that user's behalf.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Verifies the incoming request's JWT and returns the authenticated user's id.
// Every function should call this first — never trust a user_id passed
// directly in the request body.
export async function getUserId(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new Error('Missing auth token');

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid session');

  return data.user.id;
}
