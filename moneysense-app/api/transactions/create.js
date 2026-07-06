import { supabaseAdmin, getUserId } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let userId;
  try {
    userId = await getUserId(req);
  } catch (err) {
    return res.status(401).json({ error: 'Please sign in again.' });
  }

  const { amount, category_id, note, spent_on } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Add an amount to continue.' });
  }

  if (!category_id) {
    return res.status(400).json({ error: 'Please choose a category.' });
  }

  try {
    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: userId,
        amount,
        category_id,
        note: note ?? null,
        spent_on: spent_on ?? new Date().toISOString().split('T')[0]
      })
      .select('*, categories(name)')
      .single();

    if (error) throw error;

    return res.status(200).json({ transaction });

  } catch (err) {
    console.error('Transaction create error:', err);
    return res.status(500).json({
      error: "Couldn't save that just now — please try again."
    });
  }
}
