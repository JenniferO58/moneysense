import { supabaseAdmin, getUserId } from '../_lib/supabase.js';

const CHECKIN_SYSTEM_PROMPT = `You are MoneySense AI, responding to a user's weekly check-in.

Your only job right now is to acknowledge how their week went. This is a moment of reflection, not a data review.

RULES:
- Always include exactly one small, general tip — regardless of how they answered. This is not optional. Pure validation with nothing after it feels hollow, especially after a hard week.
- The tip must NOT reference specific spending data, categories, or amounts — you don't have access to that here, and Home already covers that. Instead, the tip should be a light, low-effort behavioural or emotional suggestion relevant to how they said they felt (e.g. for stress or low control: a tiny grounding action, not a task; for calm weeks: encouragement to notice what worked; for mixed weeks: a gentle noticing habit for next week).
- The tip must feel genuinely small — never homework, never a multi-step task. If it would take more than a few seconds to do, it's too big.
- Structure: one sentence acknowledging how the week went, one sentence with the tip. Two sentences total, rarely three.
- If they said the week felt difficult or they didn't feel in control, lead with genuine acknowledgement before the tip. Never minimise it, never rush past it.
- If they said the week felt calm and in control, affirm that plainly and warmly before the tip — don't undercut it with a caveat.
- If mixed, treat noticing itself as valid before the tip — no need to resolve the ambiguity.
- Use their first name naturally if provided, but don't force it into every sentence.
- Never mention charts, numbers, or specific transactions here — this is about how they felt, not what they spent.
- Tone: calm, warm, genuinely present — like a coach who's glad they checked in, not someone analysing a report.

EXAMPLES OF THE RIGHT KIND OF TIP (do not copy these verbatim, write fresh ones in this spirit):
- Difficult/not in control: "Next time it feels like too much, even a quick glance at where things stand can make it feel smaller than it does in your head."
- Calm/in control: "Whatever you did differently this week is worth remembering — try doing just that one thing again next week."
- Mixed: "Try noticing one moment next week when spending felt easy, and one when it didn't — that's enough to start seeing a pattern."

WRONG (too big, too task-like): "Set a budget for next week and track every purchase in a spreadsheet."
WRONG (not a real tip, just a platitude): "Remember, every week is a fresh start."

Return ONLY valid JSON, no markdown, no commentary:
{ "message": "" }`;

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

  const { feeling, stayed_in_control } = req.body;

  if (!feeling || stayed_in_control === undefined) {
    return res.status(400).json({ error: 'Missing check-in answers.' });
  }

  try {
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('full_name, money_relationship')
      .eq('id', userId)
      .maybeSingle();

    const firstName = profile?.full_name ? profile.full_name.trim().split(/\s+/)[0] : null;

    const userMessage = `USER'S CHECK-IN THIS WEEK:
- First name: ${firstName ?? 'not provided'}
- Feeling: ${feeling}
- Stayed in control: ${stayed_in_control}
- Their stated relationship with money (from onboarding): ${profile?.money_relationship ?? 'not stated'}

Write their check-in response now, following the rules exactly. Return only the JSON.`;

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 300,
        system: CHECKIN_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error('Anthropic API error:', aiData);
      return res.status(502).json({ error: 'AI request failed' });
    }

    const rawText = aiData.content?.find(b => b.type === 'text')?.text ?? '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse check-in response as JSON:', rawText);
      return res.status(502).json({ error: 'AI did not return valid JSON' });
    }

    if (!parsed.message) {
      return res.status(502).json({ error: 'AI response missing message' });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Check-in response error:', err);
    return res.status(500).json({ error: 'Could not generate a response right now.' });
  }
}
