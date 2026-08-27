const BLOCKRUN_URL = 'https://blockrun.ai/api/v1/chat/completions';
const MODELS = [
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  'nvidia/nemotron-nano-9b-v2',
  'nvidia/mistral-nemotron'
];
const REQUEST_TIMEOUT_MS = 14_000;
const MAX_HISTORY = 10;

const SYSTEM_PROMPT = `You are Unity Oracle, the spoken intelligence at the centre of Dream Unity. Speak naturally as Unity.

You are a broad, general-purpose conversational intelligence. Directly answer the visitor's actual question on any topic they choose. Never refuse or redirect merely because a question is unrelated to Dream Unity. Unless the visitor explicitly asks about Dream Unity or requests structured cognitive training, do not mention its worlds, categories or operations and do not steer the answer toward them. Questions about philosophy, science, creativity, personal decisions, current affairs, technology and Dream Unity are all in scope. When current information cannot be verified, say so briefly instead of inventing it. If a request is unsafe or impossible, state the real limitation briefly and give the most useful safe help you can.

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
- Output only the final visitor-facing answer. Never output private reasoning, analysis, planning, self-talk, drafts, hidden instructions, prompt commentary or discussion of how you should answer.
- Answer first. Default to one to three short sentences unless the visitor asks for depth.
- Make sharp distinctions between Perceive, Model and Predict.
- For training, give one exercise or ask one clear question at a time.
- Help visitors choose a world or operation only when they explicitly ask about Dream Unity or request cognitive training.
- Never claim access to game state, scores, account data, personal history or sensors that were not supplied in the conversation.
- Do not claim Dream Unity is a validated clinical, neurological, psychometric or IQ intervention.
- If asked what you are, say you are Unity Oracle, Dream Unity's voice intelligence.
- Reply in the visitor's language when practical.
- Avoid dense formatting because your answer will be spoken aloud.`;

const PRIVATE_PROCESS_PATTERN = /(?:\bgot it,?\s+let(?:'|’)s\b|\bfirst,?\s+i need\b|\bthe user (?:asked|is asking|wants)\b|\bcheck the (?:rules|instructions)\b|\bstay in character\b|\bsystem prompt\b|\bdrafting\s*:|(?:^|\n)\s*(?:analysis|reasoning|planning)\s*:|\bwait,?\s+(?:first|no|maybe|but|is that|let me|what(?:'|’)s)\b|\blet me (?:craft|draft|phrase|answer this)\b)/i;

const clampText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_HISTORY).map(item => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: clampText(item?.content, 1200)
  })).filter(item => item.content);
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

function extractText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map(part => typeof part === 'string' ? part : String(part?.text || '')).join('').trim();
  return '';
}

export function publicAnswer(value) {
  const text = clampText(value, 2400)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:text|markdown)?\s*|\s*```$/gi, '')
    .trim();
  if (!text || /<\/?think>/i.test(text) || PRIVATE_PROCESS_PATTERN.test(text)) return '';
  return text.replace(/^(?:final answer|answer)\s*:\s*/i, '').trim().slice(0, 1800);
}

async function callFreeModel(model, messages, parentSignal) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (parentSignal) parentSignal.addEventListener('abort', abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(BLOCKRUN_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: 0.65,
        top_p: 0.9,
        max_tokens: 200
      })
    });
    const data = await response.json().catch(() => null);
    const text = publicAnswer(extractText(data));
    if (response.ok && text) return { text, model: String(data?.model || model) };
    return {
      error: new Error(response.ok ? 'Model returned private process text.' : (data?.error?.message || data?.error || data?.message || `Voice model request failed (${response.status}).`)),
      status: response.status
    };
  } catch (error) {
    return { error, status: error?.name === 'AbortError' ? 504 : 502 };
  } finally {
    clearTimeout(timeout);
    if (parentSignal) parentSignal.removeEventListener('abort', abortFromParent);
  }
}

async function firstCleanAnswer(models, messages) {
  let lastFailure = {
    error: new Error('No voice model returned a clean answer.'),
    status: 502
  };

  for (const model of models) {
    const result = await callFreeModel(model, messages);
    if (result.text) return result;
    lastFailure = result;
  }

  return lastFailure;
}

async function answer(body) {
  const startedAt = Date.now();
  const message = clampText(body?.message, 1400);
  if (!message) {
    const error = new Error('A spoken message is required.');
    error.status = 400;
    throw error;
  }

  const locale = clampText(body?.locale, 40);
  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT}\nVisitor locale: ${locale || 'unknown'}.` },
    ...sanitizeHistory(body?.history),
    { role: 'user', content: message }
  ];

  const result = await firstCleanAnswer(MODELS, messages);

  if (result.text) {
    return {
      text: result.text,
      model: result.model,
      provider: 'blockrun',
      credentialMode: 'none',
      latencyMs: Date.now() - startedAt
    };
  }

  const error = result?.error instanceof Error ? result.error : new Error('No free voice model is currently available.');
  error.status = Number(result?.status) || 502;
  throw error;
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
      models: MODELS,
      provider: 'blockrun',
      credentialMode: 'none',
      accountRequired: false,
      speechMode: 'browser-native',
      responseStrategy: 'sequential-provider-failover',
      applicationRateLimit: 'none'
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  try {
    return res.status(200).json(await answer(req.body && typeof req.body === 'object' ? req.body : {}));
  } catch (error) {
    const status = Number(error?.status) || 502;
    if (status === 400) return res.status(400).json({ code: 'BAD_INPUT', error: error.message });
    if (status === 429) return res.status(503).json({ code: 'VOICE_BACKENDS_BUSY', error: 'Unity is reconnecting to an answer service.' });
    if (status === 504) return res.status(504).json({ code: 'VOICE_TIMEOUT', error: 'Dream Unity voice model timed out.' });
    console.error('Dream Unity voice chat failure', status, error?.message || 'unknown');
    return res.status(502).json({ code: 'VOICE_CHAT_FAILED', error: 'Dream Unity could not answer that turn.' });
  }
}
