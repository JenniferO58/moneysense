// Local categorisation heuristic — no AI call, must stay fast (<100ms).
// Priority order: personal keyword correction -> personal amount-range
// correction -> generic keyword map -> "Other" fallback.

const KEYWORD_MAP = {
  tesco: 'Food', sainsburys: 'Food', asda: 'Food', lunch: 'Food',
  dinner: 'Food', coffee: 'Food', takeaway: 'Food', groceries: 'Food',
  uber: 'Transport', bus: 'Transport', train: 'Transport', taxi: 'Transport',
  fuel: 'Transport', petrol: 'Transport', parking: 'Transport',
  rent: 'Housing', mortgage: 'Housing', 'council': 'Housing',
  amazon: 'Shopping', clothes: 'Shopping', shopping: 'Shopping',
  cinema: 'Entertainment', netflix: 'Subscriptions', spotify: 'Subscriptions',
  gym: 'Health', pharmacy: 'Health', doctor: 'Health',
  electric: 'Bills', gas: 'Bills', water: 'Bills', phone: 'Bills', insurance: 'Bills',
};

function bucketAmount(amount) {
  if (amount <= 5) return '0-5';
  if (amount <= 15) return '5-15';
  if (amount <= 30) return '15-30';
  if (amount <= 100) return '30-100';
  return '100+';
}

export async function categoriseTransaction(supabase, userId, note, amount) {
  const lowerNote = (note ?? '').toLowerCase();
  const words = lowerNote.split(/\s+/).filter(Boolean);

  // 1. Personal keyword corrections take priority
  for (const word of words) {
    const { data } = await supabase
      .from('category_corrections')
      .select('category_id')
      .eq('user_id', userId)
      .eq('signal_type', 'keyword')
      .eq('signal_value', word)
      .maybeSingle();
    if (data) return { category_id: data.category_id, source: 'personal_keyword' };
  }

  // 2. Personal amount-range corrections (needs some repeat confidence)
  const bucket = bucketAmount(amount);
  const { data: amountMatch } = await supabase
    .from('category_corrections')
    .select('category_id, weight')
    .eq('user_id', userId)
    .eq('signal_type', 'amount_range')
    .eq('signal_value', bucket)
    .maybeSingle();
  if (amountMatch && amountMatch.weight >= 2) {
    return { category_id: amountMatch.category_id, source: 'personal_amount' };
  }

  // 3. Generic keyword heuristic
  for (const word of words) {
    if (KEYWORD_MAP[word]) {
      const { data: cat } = await supabase
        .from('categories').select('id')
        .eq('name', KEYWORD_MAP[word]).maybeSingle();
      if (cat) return { category_id: cat.id, source: 'generic_keyword' };
    }
  }

  // 4. Fallback to "Other"
  const { data: other } = await supabase
    .from('categories').select('id').eq('name', 'Other').maybeSingle();
  return { category_id: other?.id, source: 'fallback' };
}

// Records a correction whenever the caller's chosen category differs from
// what the heuristic would have guessed — this is what makes the
// suggestions improve for that specific user over time.
export async function recordCorrectionIfNeeded(supabase, userId, note, amount, chosenCategoryId, suggestedCategoryId) {
  if (chosenCategoryId === suggestedCategoryId) return; // no correction needed

  const lowerNote = (note ?? '').toLowerCase();
  const words = lowerNote.split(/\s+/).filter(Boolean);

  if (words.length > 0) {
    // Store against the first meaningful word — simple and effective at this scale
    const word = words[0];
    await supabase.from('category_corrections').upsert({
      user_id: userId,
      signal_type: 'keyword',
      signal_value: word,
      category_id: chosenCategoryId,
      weight: 1
    }, { onConflict: 'user_id,signal_type,signal_value' });
  } else {
    const bucket = bucketAmount(amount);
    const { data: existing } = await supabase
      .from('category_corrections')
      .select('weight')
      .eq('user_id', userId)
      .eq('signal_type', 'amount_range')
      .eq('signal_value', bucket)
      .maybeSingle();

    await supabase.from('category_corrections').upsert({
      user_id: userId,
      signal_type: 'amount_range',
      signal_value: bucket,
      category_id: chosenCategoryId,
      weight: (existing?.weight ?? 0) + 1
    }, { onConflict: 'user_id,signal_type,signal_value' });
  }
}
