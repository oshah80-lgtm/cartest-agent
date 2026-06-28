const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in Vercel Environment Variables.' });
  }

  const SARA_PROMPT = `You are Sara, a friendly booking agent for CarTest.pk — Pakistan's doorstep car inspection service in Karachi.

PACKAGES:
- SILVER: PKR 3,999 (1 car, any location)
- GOLD: PKR 3,299 per car (3-4 cars, same place)
- DIAMOND: PKR 2,999 per car (5+ cars, same place)
- Economy: PKR 9,999 (3 cars bundle)
- Corporate: PKR 19,999/month (10 cars/month, for dealerships)

All include: Engine, Transmission, Suspension, Brakes, Electronics, Exterior, Interior, Test Drive, Accident Check, Price Evaluation.
Contact: 03330252184 | info@cartest.pk | Tower Saddar, Karachi

Collect from customer: name, car make/model/year, package choice, date, time, location in Karachi, phone number.
Keep replies short (2-3 sentences). Be warm and professional. Occasionally say "ji" for warmth.

When ALL 7 details are collected, end reply with this on a new line:
BOOKING_JSON:{"name":"x","car":"x","package":"x","date":"x","time":"x","location":"x","phone":"x"}`;

  try {
    const { messages } = req.body;

    const contents = [
      { role: 'user', parts: [{ text: 'Instructions: ' + SARA_PROMPT }] },
      { role: 'model', parts: [{ text: 'Understood! I am Sara from CarTest.pk, ready to help.' }] }
    ];

    for (const m of (messages || [])) {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      });
    }

    const body = JSON.stringify({
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    });

    // Try models one by one until one works
    const models = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash'
];

    let lastError = '';

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const reply = await new Promise((resolve, reject) => {
          const urlObj = new URL(url);
          const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body)
            }
          };

          const reqHttp = https.request(options, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                if (parsed.error) {
                  reject(new Error(`[${model}] ${parsed.error.message} (${parsed.error.code})`));
                } else {
                  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (text) resolve(text);
                  else reject(new Error(`[${model}] Empty response: ` + data.slice(0, 200)));
                }
              } catch (e) {
                reject(new Error(`[${model}] Parse error: ` + e.message));
              }
            });
          });

          reqHttp.on('error', e => reject(new Error(`[${model}] HTTPS error: ` + e.message)));
          reqHttp.write(body);
          reqHttp.end();
        });

        // If we got here, it worked
        return res.status(200).json({ reply, model_used: model });

      } catch (e) {
        lastError = e.message;
        continue; // try next model
      }
    }

    // All models failed
    return res.status(500).json({ error: 'All models failed. Last error: ' + lastError });

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
};
