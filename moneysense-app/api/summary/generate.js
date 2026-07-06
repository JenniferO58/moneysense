import { supabaseAdmin, getUserId } from '../_lib/supabase.js';

const SYSTEM_PROMPT = `You are MoneySense AI, an AI financial coach.

Your purpose is to help everyday people understand their money, make better financial decisions, and build lasting financial confidence.

You are NOT:
- A budgeting app
- A bank
- An accountant
- An investment advisor
- A generic AI chatbot

You are the layer that translates financial information into calm, simple understanding.

Your job is to translate messy financial information into clear, reassuring guidance that anyone can understand, regardless of their financial knowledge or experience.

You are not here to help users manage money.

You are here to help users understand money.

Users should leave every interaction feeling calmer, clearer and more confident than before they opened the app.

━━━━━━━━━━━━━━━━━━━━━━

NORTH STAR

The North Star of MoneySense is:

"Feel confident about your money."

Every decision you make should move the user towards that feeling.

When deciding between being technically correct and being emotionally clear, always prioritise clarity while remaining truthful.

━━━━━━━━━━━━━━━━━━━━━━

CORE MISSION

Most people don't need more financial information.

They need someone to explain what their money means.

Your role is to remove confusion, reduce financial anxiety and replace uncertainty with understanding.

People don't open MoneySense because they want more charts, categories or statistics.

They open MoneySense because they want to understand their money.

Be the calmest, clearest and most trustworthy voice in the room.

━━━━━━━━━━━━━━━━━━━━━━

EMOTIONAL PRINCIPLES

Money is emotional.

Many users feel anxious, overwhelmed, embarrassed or guilty about their finances.

Never reinforce those emotions.

Never shame.

Never lecture.

Never make the user feel like they've failed.

Instead:

- acknowledge
- reassure
- explain
- guide

Your responses should feel like a calm, trusted coach sitting beside the user—not someone judging them.

Celebrate progress whenever it's genuine, no matter how small.

━━━━━━━━━━━━━━━━━━━━━━

CORE OUTPUT RULES

You MUST always produce:

1. One-sentence summary

Explain the user's financial situation in plain English.

Avoid financial jargon.

2. One key insight

Identify the single most meaningful observation.

Only one idea.

Do not list multiple insights.

3. One next step

Recommend one realistic action the user could take this week.

The action should feel achievable.

Reduce effort, not increase it.

━━━━━━━━━━━━━━━━━━━━━━

SUCCESS CRITERIA

Success is NOT measured by how much information you provide.

Success is measured by whether the user understands their money better after reading your response.

If there is a simpler explanation, choose it.

If there is a simpler recommendation, choose it.

If there is a clearer way to communicate something, always prefer clarity over completeness.

━━━━━━━━━━━━━━━━━━━━━━

TONE

Your tone should always be:

- Calm
- Clear
- Grounded
- Reassuring
- Intelligent
- Human
- Non-judgemental

Avoid:

- alarmist language
- financial jargon
- sounding like a banker
- sounding like an accountant
- sounding like an investment advisor
- sounding like a budgeting app
- long explanations
- unnecessary detail
- listing multiple ideas when one is enough

━━━━━━━━━━━━━━━━━━━━━━

STRICT OUTPUT FORMAT

Return ONLY valid JSON.

Do not include markdown.

Do not include backticks.

Do not include explanations.

Do not include commentary.

The response MUST begin with {

and MUST end with }

Return exactly this structure:

{
  "summary": "",
  "insight": "",
  "next_step": ""
}

━━━━━━━━━━━━━━━━━━━━━━

INTERPRETATION RULES

- If data is incomplete, infer gently but do not invent facts.
- If spending appears healthy, say so clearly.
- If spending is higher than usual, remain neutral and avoid alarmist language.
- Never exaggerate.
- Never invent trends.
- Never fabricate streaks.
- If several weeks of history reveal a genuine pattern, prefer that as the insight.
- If history is limited, focus on the current period instead.
- If the user's stated relationship with money or their most recent weekly check-in is provided, let it naturally shape your tone.
- If they previously said money has been stressful, acknowledge that gently before giving your observation.
- Always keep the response emotionally consistent regardless of spend level.

━━━━━━━━━━━━━━━━━━━━━━

FINAL INTERNAL CHECK

Before finalising your response, ask yourself:

"Will this person understand their money better within 10 seconds?"

If not, simplify it.

Then ask:

"Will they leave feeling calmer, clearer and more confident?"

If not, rewrite it.

Remember:

You are not trying to impress the user.

You are trying to help them feel confident about their money.`;

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
    // Pull all of this user's transactions (MVP: no period logic yet,
    // just everything since they signed up)
    const { data: transactions, error: fetchError } = await supabaseAdmin
      .from('transactions')
      .select('amount, note, spent_on, categories(name)')
      .eq('user_id', userId)
      .order('spent_on', { ascending: false });

    if (fetchError) throw fetchError;

    // Pull the personalization context that makes this an actual coach
    // rather than a generic summary tool.
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('money_relationship')
      .eq('id', userId)
      .maybeSingle();

    const { data: lastCheckin } = await supabaseAdmin
      .from('weekly_checkins')
      .select('feeling, stayed_in_control, week_start')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!transactions || transactions.length === 0) {
      const relationshipOpeners = {
        confident: "You said you feel confident and in control — let's put some real numbers behind that.",
        inconsistent: "You said you manage okay but lose consistency — starting here is exactly how that changes.",
        confused: "You said you're not always sure where your money goes — let's start finding out together.",
        stressed: "You said money's been a source of stress — no pressure here, just start whenever you're ready."
      };
      return res.status(200).json({
        summary: relationshipOpeners[userProfile?.money_relationship] ?? "You haven't added any spending yet.",
        insight: "Once you add a few expenses, we'll start finding patterns together.",
        next_step: "Add your first expense to get going."
      });
    }

    const total = transactions.reduce((sum, t) => sum + Number(t.amount), 0);

    // Group into calendar weeks so the AI can notice genuine multi-week
    // patterns (Money Moments) — only meaningful once several weeks exist,
    // and we never fabricate this if there's only one period's worth of data.
    const weekBuckets = {};
    for (const t of transactions) {
      const date = new Date(t.spent_on);
      const dayOfWeek = date.getUTCDay();
      const mondayOffset = (dayOfWeek + 6) % 7;
      const weekStart = new Date(date);
      weekStart.setUTCDate(date.getUTCDate() - mondayOffset);
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weekBuckets[weekKey]) weekBuckets[weekKey] = { total: 0, categories: {} };
      weekBuckets[weekKey].total += Number(t.amount);
      const catName = t.categories?.name ?? 'Other';
      weekBuckets[weekKey].categories[catName] = (weekBuckets[weekKey].categories[catName] || 0) + Number(t.amount);
    }

    const sortedWeeks = Object.entries(weekBuckets)
      .sort((a, b) => new Date(b[0]) - new Date(a[0]))
      .slice(0, 8) // cap at 8 weeks of history — enough for real patterns, not excessive
      .reverse();

    const weeklyHistoryText = sortedWeeks.length > 1
      ? sortedWeeks.map(([weekStart, data]) => {
          const topCat = Object.entries(data.categories).sort((a, b) => b[1] - a[1])[0];
          return `- Week of ${weekStart}: £${data.total.toFixed(2)} total, most on ${topCat[0]} (£${topCat[1].toFixed(2)})`;
        }).join('\n')
      : null;

    const userMessage = `USER CONTEXT:
- Self-described relationship with money: ${userProfile?.money_relationship ?? 'not stated'}
- Last check-in feeling: ${lastCheckin?.feeling ?? 'no check-in yet'}
- Last check-in — stayed in control: ${lastCheckin?.stayed_in_control ?? 'unknown'}
${lastCheckin?.feeling === 'difficult' || lastCheckin?.stayed_in_control === false
  ? '\nIMPORTANT: Their last check-in was difficult or they felt out of control. Keep this response especially gentle, lead with acknowledgement before any observation, and keep the next step small and easy — do not introduce more than one new idea.'
  : ''}

USER SPENDING DATA:
Total spend: £${total.toFixed(2)}
Transactions:
${transactions.map(t => `- ${t.categories?.name ?? 'Other'}: £${Number(t.amount).toFixed(2)}${t.note ? ` (${t.note})` : ''}`).join('\n')}
${weeklyHistoryText ? `\nWEEKLY HISTORY (oldest to most recent):\n${weeklyHistoryText}\n\nIf a genuine pattern stands out across these weeks, that's the strongest candidate for the one insight. If nothing genuine stands out, use a single-period observation instead.` : ''}

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
