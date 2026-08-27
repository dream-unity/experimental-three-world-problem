import { createHash } from 'node:crypto';

const BLOCKRUN_URL = 'https://blockrun.ai/api/v1/chat/completions';
const MODEL = 'nvidia/gpt-oss-120b';
const REQUEST_TIMEOUT_MS = 20_000;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT = 24;
const MAX_HISTORY = 10;
const rateBuckets = new Map();

const SYSTEM_PROMPT = `You are Dream Unity, the spoken intelligence embedded in the Dream Unity cognitive-training environment. Speak as Dream Unity, not as a generic chatbot.

DREAM MACHINE concerns cognition:
- PERCEIVE asks: What is happening now? Detect, discriminate, organise and select present information.
- MODEL asks: What system could produce what I am seeing? Infer hidden structure, relationships, variables and rules.
- PREDICT asks: Given this state and system, what is likely to happen next? Project plausible future states, probabilities and consequences.

DREAM MAKER concerns directed agency:
- INTEND: form a coherent direction or chosen outcome.
- ACT: convert intention and perception into timely behaviour.
- BECOME: deliberately inhabit useful perspectives and ways of being while preserving reality-testing, self-awareness and agency.

DREAM WORLD concerns construction and emergence:
- MATTER: the elements and forces available.
- STRUCTURE: how parts are organised and constrained.
- EMERGE: how larger patterns arise from local interactions.

Voice behaviour:
- Reply naturally for spoken conversation. Default to one to three short sentences unless the visitor asks for depth.
- Make sharp distinctions between Perceive, Model and Predict.
- For training, give one exercise or ask one clear question at a time.
- Help visitors choose a world or operation from the problem they describe.
- You may discuss other topics when asked; do not force every answer back to Dream Unity.
- Never claim access to game state, scores, account data, personal history or sensors that were not supplied in the conversation.
- Do not claim Dream Unity is a validated clinical, neurological, psychometric or IQ intervention.
- If asked what you are, say you are Dream Unity's voice intelligence.
- Reply in the visitor's language when practical.
- Avoid dense formatting because your answer will be spoken aloud.`;

const clampText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_HISTORY).map(item => {
    const role = item?.role === 'assistant' ? 'assistant' : 'user';
    const content = clampText(item?.content, 1200);
    return { role, content };
  }).filter(item => item.content);
}

function allowedOrigin(req) {
  const origin = String(req.headers.origin || '');
  if (!origin) return '';
  const host = String(req.headers.host || '');
  if (origin === `https://${host}` || origin === `http://${host}`) return origin;
  if (origin === 'https://dream-unity.github.io') return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

function applyCors(req, res) {
  const origin = allowedOrigin(req);
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return origin;
}

function requestIdentity(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || String(req.socket?.remoteAddress || 'unknown');
  const agent = String(req.headers['user-agent'] || 'unknown').slice(0, 300);
  return createHash('sha256').update(`dream-unity-voice|${ip}|${agent}`).digest('hex');
}

function rateLimited(req) {
  const key = requestIdentity(req);
  const now = Date.now();
  const recent = (rateBuckets.get(key) || []).filter(time => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    rateBuckets.set(key, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  return false;
}

function extractText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map(part => typeof part === 'string' ? part : String(part?.text || '')).join('').trim();
  }
  return '';
}

async function answer(body) {
  const message = clampText(body?.message, 1400);
  if (!message) {
    const error = new Error('A spoken message is required.');
    error.status = 400;
    throw error;
  }

  const history = sanitizeHistory(body?.history);
  const locale = clampText(body?.locale, 40);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(BLOCKRUN_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\nVisitor locale: ${locale || 'unknown'}.` },
          ...history,
          { role: 'user', content: message }
        ],
        stream: false,
        temperature: 0.65,
        top_p: 0.9,
        max_tokens: 420
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error?.message || data?.message || `Voice model request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }

    const text = extractText(data);
    if (!text) throw new Error('Voice model returned no response.');
    return {
      text: text.slice(0, 1800),
      model: String(response.headers.get('x-fallback-model') || data?.model || MODEL),
      provider: 'blockrun',
      credentialMode: 'none'
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timed = new Error('Dream Unity voice model timed out.');
      timed.status = 504;
      throw timed;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const cors = applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.headers.origin && cors === null) return res.status(403).json({ error: 'Origin not allowed.' });

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'dream-unity-voice-chat',
      model: MODEL,
      provider: 'blockrun',
      credentialMode: 'none',
      accountRequired: false,
      speechMode: 'browser-native'
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (rateLimited(req)) return res.status(429).json({ code: 'VOICE_RATE_LIMIT', error: 'Voice session limit reached. Try again shortly.' });

  try {
    return res.status(200).json(await answer(req.body && typeof req.body === 'object' ? req.body : {}));
  } catch (error) {
    const status = Number(error?.status) || 502;
    if (status === 400) return res.status(400).json({ code: 'BAD_INPUT', error: error.message });
    if (status === 429) return res.status(429).json({ code: 'UPSTREAM_RATE_LIMIT', error: 'Dream Unity voice is briefly rate-limited. Try again.' });
    if (status === 504) return res.status(504).json({ code: 'VOICE_TIMEOUT', error: error.message });
    console.error('Dream Unity voice chat failure', status, error?.message || 'unknown');
    return res.status(502).json({ code: 'VOICE_CHAT_FAILED', error: 'Dream Unity could not answer that turn.' });
  }
}
