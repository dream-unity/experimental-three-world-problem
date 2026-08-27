import { createHash } from 'node:crypto';

const OPENAI_URL = 'https://api.openai.com/v1/realtime/client_secrets';
const MODEL = 'gpt-realtime-2.1';
const TOKEN_TTL_SECONDS = 30;
const REQUEST_TIMEOUT_MS = 8_000;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT = 6;
const rateBuckets = new Map();

const SYSTEM_PROMPT = `You are Dream Unity, the spoken intelligence embedded inside the Dream Unity cognitive-training environment. Speak as Dream Unity, not as ChatGPT.

Your job is to help a visitor understand, navigate and train the operations represented by the three worlds.

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
- Be natural, intelligent and concise. Default to one to three short sentences unless the visitor asks for depth.
- For training, ask one clear question or give one exercise at a time.
- Make sharp distinctions between Perceive, Model and Predict. Do not collapse modelling into prediction or perception.
- Help the visitor choose a world or operation based on the cognitive problem they describe.
- You may discuss other topics when asked; do not force every answer back to Dream Unity.
- Never pretend you can see a game state, score, personal history, account data or sensor information you have not actually received.
- Do not claim Dream Unity is a validated clinical, neurological, psychometric or IQ intervention. It is an experimental training environment.
- If the visitor asks what you are, say you are Dream Unity's realtime voice intelligence.
- Keep spoken wording easy to follow. Avoid dense lists unless specifically requested.`;

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
  const recent = (rateBuckets.get(key) || []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    rateBuckets.set(key, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  return false;
}

async function mintClientSecret(req) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': requestIdentity(req)
      },
      body: JSON.stringify({
        expires_after: {
          anchor: 'created_at',
          seconds: TOKEN_TTL_SECONDS
        },
        session: {
          type: 'realtime',
          model: MODEL,
          output_modalities: ['audio'],
          instructions: SYSTEM_PROMPT,
          max_output_tokens: 900,
          audio: {
            input: {
              turn_detection: {
                type: 'server_vad',
                create_response: true,
                interrupt_response: true
              }
            },
            output: {
              voice: 'marin',
              speed: 1.0
            }
          }
        }
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.value) {
      const error = new Error(`OpenAI client-secret request failed (${response.status}).`);
      error.status = response.status || 502;
      throw error;
    }

    return {
      value: data.value,
      expires_at: data.expires_at,
      model: String(data.session?.model || MODEL)
    };
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

  const configured = Boolean(process.env.OPENAI_API_KEY);

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'dream-unity-realtime-voice',
      model: MODEL,
      configured,
      credentialMode: 'ephemeral-client-secret'
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!configured) {
    return res.status(503).json({
      code: 'VOICE_NOT_CONFIGURED',
      error: 'Voice backend is not configured.'
    });
  }
  if (rateLimited(req)) {
    return res.status(429).json({
      code: 'VOICE_RATE_LIMIT',
      error: 'Voice session limit reached. Try again later.'
    });
  }

  try {
    return res.status(200).json(await mintClientSecret(req));
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ code: 'OPENAI_TIMEOUT', error: 'Voice service timed out.' });
    }
    console.error('Dream Unity voice client-secret failure', Number(error?.status) || 502);
    return res.status(502).json({ code: 'VOICE_SESSION_FAILED', error: 'Voice session could not be created.' });
  }
}
