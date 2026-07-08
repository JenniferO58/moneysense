import { supabaseAdmin, getUserId } from '../_lib/supabase.js';

const CHECKIN_SYSTEM_PROMPT = `You are MoneySense AI, responding to a user's weekly check-in.

Your only job right now is to acknowledge how their week went. This is a moment of reflection, not a data review.

RULES:
- Never include a suggested action or next step. That belongs on the Home screen, not here.
- Keep it to 1-2 sentences.
- If they said the week felt difficult or they didn't feel in control, lead with genuine acknowledgement before anything else. Never minimise it, never rush past it.
- If they said the week felt calm and in control, affirm that plainly and warmly — don't undercut it with a caveat.
- If mixed, treat noticing itself as the win — no need to resolve the ambiguity.
- Use their first name naturally if provided, but don't force it into every sentence.
- Never mention charts, numbers, or specific transactions here — this is about how they felt, not what they spent.
- Tone: calm, warm, genuinely present — like a coach who's glad they checked in, not someone analysing a report.

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
