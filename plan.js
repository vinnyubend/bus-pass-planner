export default async function handler(req, res) {
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
Respond ONLY with a raw JSON object — no markdown, no backticks, no explanation.
Required fields: possible(bool), from(str), to(str), totalTime(str), changes(int), walkingMinutes(int), legs(array), topTip(str), difficulty(str), note(str).
Each leg: type(bus/walk/transfer), from(str), to(str), routeNumber(str|null), operator(str|null), duration(str), departTime(str|null), description(str).
If not feasible by free local bus: possible:false, reason(str).`;

  const userMsg = `Plan a free local bus journey from "${from}" to "${to}".
Weekend/bank holiday travel: ${weekend}.
Prefer fewer changes: ${slow}.
Must be wheelchair/mobility accessible: ${accessible}.
Provide real UK route numbers and operators where known.`;

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
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }

    const textBlock = data.content?.find(b => b.type === 'text');
    const text = textBlock?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Could not parse journey plan' });

    const journey = JSON.parse(match[0]);
    return res.status(200).json(journey);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
