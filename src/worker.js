/**
 * TrueCVFit — the small server-side piece.
 *
 * It does one job: take the relevant CV points (already stripped of name and
 * contact details by the browser), ask Cloudflare Workers AI to rephrase them
 * for the job, and send the result straight back.
 *
 * Privacy: nothing is stored, and nothing from the request is logged.
 * Cloudflare does not use Workers AI inputs or outputs to train models.
 *
 * Everything else (the website itself) is served from the /public folder.
 */

// The AI models, tried in order. Both are fast "answer straight away" models
// (no slow thinking step), so a phone never waits long. If one is ever
// removed, swap in another from https://developers.cloudflare.com/workers-ai/models/
const MODELS = [
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', jsonMode: true },
  { id: '@cf/mistralai/mistral-small-3.1-24b-instruct', jsonMode: false },
];
// Give up on a model after this long and try the next one.
const MODEL_TIMEOUT_MS = 25_000;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    bullets: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, text: { type: 'string' } },
        required: ['id', 'text'],
      },
    },
    profile: { type: 'string' },
  },
  required: ['bullets', 'profile'],
};

// Size limits so the free allowance can't be drained by giant requests.
const MAX_BODY_BYTES = 60_000;
const MAX_BULLETS = 15;
const MAX_BULLET_CHARS = 600;
const MAX_JD_CHARS = 4_000;
const MAX_PROFILE_CHARS = 1_500;

const SYSTEM_PROMPT = `You tailor CV bullet points to a specific job. You are strict about honesty.

RULES — follow every one:
1. Rephrase only. Every fact in your version must already be in that same original bullet. Never add a skill, tool, platform, software, employer, qualification, number, result, responsibility, audience or outcome that the original does not state.
2. Never make the person sound more senior. If the original says "helped", "supported" or "assisted", keep that level. Do not use led, managed, oversaw, supervised, spearheaded, drove, owned, coordinated, mentored or launched unless the original already says so.
3. Keep every number exactly as written. Do not add numbers.
4. You may borrow the job description's wording ONLY to describe something the bullet already says. Never borrow a duty or skill the bullet doesn't mention.
5. Be plain and specific. Start with a past-tense action verb where the original describes an action. One sentence. Keep it about the same length as the original or shorter.
6. Never use these words or anything like them: passionate, dynamic, results-driven, detail-oriented, hard-working, motivated, dedicated, proactive, innovative, team player, self-starter, leverage, utilise, seamless, robust, synergy, spearheaded, fast-paced, proven track record, excellent communication skills, foster, empower, elevate, showcase, navigate, streamline, optimise, enhance, impactful, exceptional, outstanding, pivotal, instrumental.
7. Use British spelling unless the original uses American spelling.
8. If you cannot improve a bullet honestly, return it unchanged.
9. For the profile (if given): write 2 or 3 short, concrete sentences using ONLY facts found in the profile or the bullets provided. No personality adjectives. No claims about passion or enthusiasm. If no profile is given, return an empty string.

Reply with JSON only, no other text, in exactly this shape:
{"bullets":[{"id":"<same id>","text":"<your version>"}],"profile":"<text or empty string>"}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/tailor') {
      return handleTailor(request, env, url);
    }
    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not_found' }, 404);
    }
    // Anything else is the website itself.
    return env.ASSETS.fetch(request);
  },
};

async function handleTailor(request, env, url) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Only this website may use the AI, so other sites can't use up the free allowance.
  const origin = request.headers.get('Origin');
  if (!origin || origin !== url.origin) return json({ error: 'forbidden' }, 403);

  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);

  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const jobTitle = clip(body.jobTitle, 120);
  const jd = clip(body.jd, MAX_JD_CHARS);
  const bullets = Array.isArray(body.bullets)
    ? body.bullets
        .filter((b) => b && typeof b.id === 'string' && typeof b.text === 'string' && /^b\d{1,4}$/.test(b.id))
        .slice(0, MAX_BULLETS)
        .map((b) => ({ id: b.id, text: clip(b.text, MAX_BULLET_CHARS) }))
    : [];
  const profile = body.profile ? clip(body.profile, MAX_PROFILE_CHARS) : '';

  if (!jd || (!bullets.length && !profile)) return json({ error: 'bad_request' }, 400);

  const userMessage =
    `JOB TITLE: ${jobTitle || '(not given)'}\n\n` +
    `JOB DESCRIPTION:\n${jd}\n\n` +
    `CV BULLETS (rephrase each one, keep the same id):\n${JSON.stringify(bullets)}\n\n` +
    `PROFILE:\n${profile || '(none — return an empty string for profile)'}`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  let lastError = 'ai_failed';
  for (const model of MODELS) {
    try {
      const input = { messages, max_tokens: 2500, temperature: 0.2 };
      if (model.jsonMode) input.response_format = { type: 'json_schema', json_schema: RESPONSE_SCHEMA };
      const result = await withTimeout(env.AI.run(model.id, input), MODEL_TIMEOUT_MS);
      const parsed = parseModelJson(extractText(result));
      if (parsed) {
        const known = new Set(bullets.map((b) => b.id));
        const cleanBullets = (Array.isArray(parsed.bullets) ? parsed.bullets : [])
          .filter((b) => b && known.has(b.id) && typeof b.text === 'string')
          .map((b) => ({ id: b.id, text: b.text.slice(0, MAX_BULLET_CHARS * 2) }));
        const cleanProfile = profile && typeof parsed.profile === 'string' ? parsed.profile.slice(0, MAX_PROFILE_CHARS * 2) : '';
        return json({ bullets: cleanBullets, profile: cleanProfile });
      }
      lastError = 'ai_unreadable';
    } catch (err) {
      const msg = String((err && err.message) || err);
      // The free daily allowance has run out (resets at midnight UTC).
      if (/neuron|quota|allocation|daily|4006|429|capacity/i.test(msg)) {
        return json({ error: 'daily_limit' }, 429);
      }
      lastError = /timeout/i.test(msg) ? 'ai_timeout' : 'ai_failed';
    }
  }
  return json({ error: lastError }, 502);
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); }),
  ]);
}

/** Different models return text in slightly different shapes. */
function extractText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result.response === 'string') return result.response;
  if (result.response && typeof result.response === 'object') return JSON.stringify(result.response);
  const choice = result.choices && result.choices[0];
  if (choice && choice.message && typeof choice.message.content === 'string') return choice.message.content;
  if (choice && typeof choice.text === 'string') return choice.text;
  if (result.result) return extractText(result.result);
  return '';
}

function parseModelJson(text) {
  if (!text) return null;
  let t = String(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(t.slice(start, end + 1));
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

function clip(value, max) {
  return typeof value === 'string' ? value.slice(0, max).trim() : '';
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
