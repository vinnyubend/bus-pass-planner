module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { from, to, weekend, slow, accessible } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  const system = `You are a UK local bus journey planner for ENCTS free bus pass holders.
Only suggest local scheduled bus services — NOT National Express, Megabus or express coaches.
ENCTS passes are free after 9:30am weekdays, all day weekends and bank holidays.
For long journeys, multiple buses with changes are normal and expected.
Use real UK bus route numbers and operators where known.
IMPORTANT: Respond ONLY with a raw JSON object. No markdown, no backticks, no explanation before or after.
Keep all text fields SHORT — under 100 characters each — to avoid JSON length issues.
Required fields: possible(bool), from(str), to(str), totalTime(str), changes(int), walkingMinutes(int), legs(array), topTip(str), difficulty(str), note(str).
Each leg: type(bus/walk/transfer), from(str), to(str), routeNumber(str or null), operator(str or null), duration(str), departTime(str or null), description(str - keep under 80 chars).
If not feasible by free local bus: possible:false, reason(str).
Limit to maximum 10 legs. For very long journeys summarise into fewer legs.`;

  const userMsg = `Plan a free local bus journey from "${from}" to "${to}".
Weekend/bank holiday travel: ${weekend}.
Prefer fewer changes: ${slow}.
Must be wheelchair/mobility accessible: ${accessible}.
Keep descriptions brief. Maximum 10 legs.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API error' });

    const textBlock = data.content?.find(b => b.type === 'text');
    const text = textBlock?.text || '';
    if (!text) return res.status(500).json({ error: 'Empty response from model' });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Could not find journey data in response' });

    let jsonStr = match[0];
    // Fix common JSON issues
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    jsonStr = jsonStr.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

    let journey;
    try {
      journey = JSON.parse(jsonStr);
    } catch (parseErr) {
      return res.status(500).json({ 
        error: 'Journey too complex to process. Try ticking "Fewer changes" and try again.' 
      });
    }

    return res.status(200).json(journey);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
