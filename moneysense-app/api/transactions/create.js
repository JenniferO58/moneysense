import { supabaseAdmin, getUserId } from '../_lib/supabase.js';
import { categoriseTransaction, recordCorrectionIfNeeded } from '../_lib/categorise.js';

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

  const { amount, category_id: providedCategoryId, note, spent_on } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Add an amount to continue.' });
  }

  try {
    // Always compute what the heuristic would suggest — this lets us both
    // auto-categorise when nothing is provided, and learn from corrections
    // when the caller picks something different.
    const { category_id: suggestedCategoryId } = await categoriseTransaction(
      supabaseAdmin, userId, note, amount
    );

    const finalCategoryId = providedCategoryId || suggestedCategoryId;

    if (!finalCategoryId) {
      return res.status(400).json({ error: 'Please choose a category.' });
    }

    if (providedCategoryId) {
      // Fire-and-forget — don't let a correction-logging hiccup block saving
      recordCorrectionIfNeeded(
        supabaseAdmin, userId, note, amount, providedCategoryId, suggestedCategoryId
      ).catch(err => console.error('Correction logging error:', err));
    }

    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: userId,
        amount,
        category_id: finalCategoryId,
        note: note ?? null,
        spent_on: spent_on ?? new Date().toISOString().split('T')[0]
      })
      .select('*, categories(name)')
      .single();

    if (error) throw error;

    return res.status(200).json({
      transaction,
      auto_categorised: !providedCategoryId
    });

  } catch (err) {
    console.error('Transaction create error:', err);
    return res.status(500).json({
      error: "Couldn't save that just now — please try again."
    });
  }
}
