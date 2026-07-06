import { supabaseAdmin } from '../_lib/supabase.js';

// Simple connection test — no auth required, just confirms the Vercel
// function can reach Supabase using the service role key.
// Hit this once after deploying to confirm Day 2's wiring works, then
// this file can be deleted once transactions/create.js is built.
export default async function handler(req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('name')
      .order('sort_order');

    if (error) throw error;

    return res.status(200).json({
      message: 'Supabase connection working',
      categories: data
    });

  } catch (err) {
    console.error('Connection test error:', err);
    return res.status(500).json({
      error: 'Could not connect to Supabase',
      details: err.message
    });
  }
}
