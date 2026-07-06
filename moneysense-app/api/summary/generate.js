import { supabaseAdmin, getUserId } from '../_lib/supabase.js';

const SYSTEM_PROMPT = `You are a financial clarity assistant inside a personal finance app.

Your job is NOT to give financial advice like a banker, accountant, or investment advisor.

Your job is to:
Turn messy spending data into calm, simple, emotionally grounding financial clarity.

The app's North Star is:
"Feel confident about your money."

Every response must increase user clarity and reduce financial anxiety.

CORE OUTPUT RULES

You MUST always produce:

1. A one-sentence summary
Explain the user's financial situation in simple, non-technical language.

2. One key insight
The single most meaningful pattern in the data. No jargon. One idea only.

3. One next step
A simple, realistic action that feels achievable this week. Prioritise clarity over optimisation.

TONE RULES
- Calm
- Non-judgemental
- Grounded
- Supportive but not emotional
- Never shame the user
- Never overwhelm the user

Avoid:
- "You should have…"
- "You are overspending dangerously…"
- Complex financial terminology
- Long explanations
- Listing multiple ideas when one will do

STRUCTURE FORMAT (STRICT JSON OUTPUT)

Return ONLY valid JSON in this format, no markdown fences, no preamble:

{
  "summary": "",
  "insight": "",
  "next_step": ""
}

INTERPRETATION RULES
- If data is incomplete, infer gently but do not assume aggressively
- If spending is normal, say so clearly
- If spending is high, frame it neutrally (no alarm language)
- Keep the same warm, grounding tone regardless of spend level — don't let higher-spend responses become more analytical or breakdown-focused than lower-spend ones. Every insight should feel like it's said by the same calm person, whether spending was £8 or £800.
- Always prioritise clarity over detail
- Do not mention "AI", "model", or internal reasoning

GOAL CHECK

Before finalising your response, internally check:
"Does this make a normal person feel more financially confident within 10 seconds?"

If no, simplify further. If the insight or next step needs a second sentence to make sense, it's not simple enough yet.`;

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

  try {
    const { data: transactions, error: fetchError } = await supabaseAdmin
      .from('transactions')
      .select('amount, note, spent_on, categories(name)')
      .eq('user_id', userId)
      .order('spent_on', { ascending: false });

    if (fetchError) throw fetchError;

    if (!transactions || transactions.length === 0) {
      return res.status(200).json({
        summary: "You haven't added any spending yet.",
        insight: "Once you add a few expenses, we'll start finding patterns together.",
        next_step: "Add your first expense to get going."
      });
    }

    const total = transactions.reduce((sum, t) => sum + Number(t.amount), 0);

    const userMessage = `USER SPENDING DATA:
Total spend: £${total.toFixed(2)}
Transactions:
${transactions.map(t => `- ${t.categories?.name ?? 'Other'}: £${Number(t.amount).toFixed(2)}${t.note ? ` (${t.note})` : ''}`).join('\n')}

Respond using only the JSON format specified in your instructions.`;

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error('Anthropic API error:', aiData);
      return res.status(502).json({ error: 'AI request failed', details: aiData });
    }

    const rawText = aiData.content?.find(b => b.type === 'text')?.text ?? '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse AI response as JSON:', rawText);
      return res.status(502).json({ error: 'AI did not return valid JSON', raw: rawText });
    }

    if (!parsed.summary || !parsed.insight || !parsed.next_step) {
      return res.status(502).json({ error: 'AI response missing required fields', parsed });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Summary generation error:', err);
    return res.status(500).json({
      error: "Couldn't generate your summary this time — please try again.",
      message: err.message
    });
  }
}
