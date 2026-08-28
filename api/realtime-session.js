import { randomBytes } from 'node:crypto';

const BLOCKRUN_URL = 'https://blockrun.ai/api/v1/chat/completions';
const MODELS = [
  'nvidia/nemotron-nano-9b-v2',
  'nvidia/mistral-nemotron'
];
const TOTAL_UPSTREAM_BUDGET_MS = 8_000;
const MODEL_ATTEMPT_LIMIT_MS = 4_500;
const MIN_FALLBACK_BUDGET_MS = 1_200;
const MAX_HISTORY = 6;
const MAX_HISTORY_CHARS = 2_400;

const GENERAL_SYSTEM_PROMPT = `You are Unity Oracle, Dream Unity's voice intelligence. Reply directly and naturally to the latest message, like a normal human conversation.

Give only the answer. Do not discuss the question, its wording, meaning, intent, or how you will answer it unless the person explicitly asks you to analyse those things. Never narrate planning, reasoning, rules, instructions, drafts, language choice, response strategy or limitations unless the limitation itself is essential to the answer. Use plain spoken language with no headings. For an ordinary question, use one or two sentences and at most 45 words. Give more detail only when explicitly requested. If asked what you are, say you are Unity Oracle, Dream Unity's voice intelligence.`;

const DREAM_UNITY_CONTEXT = `Dream Unity has three worlds. Dream Machine concerns cognition: PERCEIVE identifies what is happening now; MODEL infers the system producing it; PREDICT projects likely next states. Dream Maker concerns agency: INTEND chooses direction; ACT converts it into behaviour; BECOME deliberately adopts useful perspectives while preserving reality-testing and agency. Dream World concerns construction: MATTER is what is available; STRUCTURE is how parts are organised; EMERGE is how larger patterns arise. Do not claim Dream Unity is a validated clinical, neurological, psychometric or IQ intervention.`;

const META_PROCESS_PATTERN = /\b(?:visitor|user)[- ]facing\b|\b(?:internal|private|hidden)\s+(?:reasoning|analysis|instructions?)\b|\b(?:system|developer)\s+(?:prompt|instructions?)\b|\bas per (?:the )?(?:instructions?|prompt|default behaviou?r)\b|\b(?:the )?(?:response|answer) should\b|\bsince (?:the user|they) (?:asked|requested|wants?)\b|\bi(?:['’]ll| will| should| must| need to)\s+(?:answer|respond|state|mention|avoid|use|keep|explain|clarify)\b/i;

const NUMBER_WORDS = Object.freeze({
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20
});
const SPOKEN_NUMBERS = Object.freeze(Object.fromEntries(Object.entries(NUMBER_WORDS).map(([word, number]) => [number, word])));

const clampText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  let remaining = MAX_HISTORY_CHARS;
  const recent = value.slice(-MAX_HISTORY).reverse();
  for (const item of recent) {
    if (remaining <= 0) break;
    const content = clampText(item?.content, Math.min(600, remaining));
    if (!content) continue;
    result.unshift({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content
    });
    remaining -= content.length;
  }
  return result;
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
  res.setHeader('Access-Control-Expose-Headers', 'Server-Timing, X-Unity-Path');
  return origin;
}

function extractText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map(part => typeof part === 'string' ? part : String(part?.text || '')).join('').trim();
  return '';
}

function parseOperand(value) {
  const token = String(value || '').trim().toLowerCase();
  if (Object.hasOwn(NUMBER_WORDS, token)) return NUMBER_WORDS[token];
  if (/^-?\d+(?:\.\d+)?$/.test(token)) return Number(token);
  return null;
}

function formatCalculation(value) {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.abs(value) < 1e-12 ? 0 : Number(value.toFixed(8));
  if (Number.isInteger(rounded) && Object.hasOwn(SPOKEN_NUMBERS, rounded)) {
    const word = SPOKEN_NUMBERS[rounded];
    return `${word[0].toUpperCase()}${word.slice(1)}.`;
  }
  return `${rounded}.`;
}

function calculateSimpleQuestion(message) {
  const operand = '(?:-?\\d+(?:\\.\\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
  const pattern = new RegExp(`^(?:what(?:'s| is)|calculate|work out)?\\s*(${operand})\\s*(plus|minus|times|multiplied by|divided by|over|[+\\-x×*÷/])\\s*(${operand})[?.!]*$`, 'i');
  const match = clampText(message, 180).match(pattern);
  if (!match) return '';
  const left = parseOperand(match[1]);
  const right = parseOperand(match[3]);
  if (left === null || right === null) return '';
  const operator = match[2].toLowerCase();
  if ((operator === 'divided by' || operator === 'over' || operator === '/' || operator === '÷') && right === 0) {
    return "You can't divide by zero.";
  }
  if (operator === 'plus' || operator === '+') return formatCalculation(left + right);
  if (operator === 'minus' || operator === '-') return formatCalculation(left - right);
  if (operator === 'times' || operator === 'multiplied by' || ['x', '×', '*'].includes(operator)) return formatCalculation(left * right);
  return formatCalculation(left / right);
}

export function instantAnswer(value) {
  const message = clampText(value, 220);
  const normalized = message.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (/^(?:(?:hi|hello|hey)[, ]+)?(?:how (?:are you|are you doing|are you going|is it going)|how's it going)[?.!]*$/.test(normalized)) {
    return "I'm doing well, thank you. How are you?";
  }
  if (/^(?:hi|hello|hey|good morning|good afternoon|good evening)(?:,? unity| there)?[?.!]*$/.test(normalized)) {
    return 'Hello.';
  }
  if (/^(?:are you there|can you hear me)[?.!]*$/.test(normalized)) return "Yes, I'm here.";
  if (/^(?:who|what) are you[?.!]*$|^what(?:'s| is) your name[?.!]*$/.test(normalized)) {
    return "I'm Unity Oracle, Dream Unity's voice intelligence.";
  }
  if (/^(?:thanks|thank you|cheers)(?: very much| so much)?[?.!]*$/.test(normalized)) return "You're welcome.";
  if (/^(?:goodbye|bye|see you|see you later)[?.!]*$/.test(normalized)) return 'Goodbye.';
  return calculateSimpleQuestion(normalized);
}

export function publicAnswer(value, nonce) {
  if (typeof value !== 'string' || !/^[a-f0-9]{16}$/.test(nonce) || value.length > 12_000) return '';
  const open = `<<UNITY_PUBLIC:${nonce}>>`;
  const close = `<<END_UNITY_PUBLIC:${nonce}>>`;
  const start = value.indexOf(open);
  if (start < 0 || value.indexOf(open, start + open.length) >= 0) return '';
  const end = value.indexOf(close, start + open.length);
  if (end < 0 || value.indexOf(close, end + close.length) >= 0) return '';
  let answer = value.slice(start + open.length, end).trim();
  if (!answer || answer.length > 1_800 || /<\/?think\b/i.test(answer) || /<<(?:END_)?UNITY_PUBLIC:/i.test(answer) || META_PROCESS_PATTERN.test(answer)) return '';
  answer = answer.replace(/^```(?:text|markdown)?\s*|\s*```$/gi, '').trim();
  return answer.slice(0, 1_800);
}

function needsDreamUnityContext(message, history) {
  const recent = [message, ...history.slice(-2).map(item => item.content)].join(' ');
  return /\bdream unity\b|\bunity oracle\b|\bdream machine\b|\bdream maker\b|\bdream world\b|\bcognitive training\b|\bperceive,?\s+model,?\s+(?:and\s+)?predict\b|\bintend,?\s+act,?\s+(?:and\s+)?become\b|\bmatter,?\s+structure,?\s+(?:and\s+)?emerge\b/i.test(recent);
}

function wantsDepth(message) {
  return /\b(?:in detail|detailed|deeply|thoroughly|comprehensive|step by step|long answer|expand on|explain fully)\b/i.test(message);
}

function tokenBudget(message) {
  if (wantsDepth(message)) return 280;
  return message.length <= 100 ? 80 : 120;
}

function answerProtocol(nonce) {
  return `Your entire public response must use this exact private envelope:\n<<UNITY_PUBLIC:${nonce}>>\nYour final spoken answer\n<<END_UNITY_PUBLIC:${nonce}>>\nWrite exactly one envelope. Do not write anything outside it.`;
}

async function callFreeModel(model, messages, nonce, maxTokens, timeoutMs) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(BLOCKRUN_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: 0.2,
        top_p: 0.85,
        max_tokens: maxTokens
      })
    });
    const data = await response.json().catch(() => null);
    const text = publicAnswer(extractText(data), nonce);
    if (response.ok && text) {
      return { text, model: String(data?.model || model), requestedModel: model, status: response.status, latencyMs: Date.now() - startedAt };
    }
    return {
      error: new Error(response.ok ? 'Model did not return one safe public answer.' : (data?.error?.message || data?.error || data?.message || `Voice model request failed (${response.status}).`)),
      status: response.status,
      requestedModel: model,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return { error, status: error?.name === 'AbortError' ? 504 : 502, requestedModel: model, latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timeout);
  }
}

async function firstCleanAnswer(messages, nonce, maxTokens) {
  const deadline = Date.now() + TOTAL_UPSTREAM_BUDGET_MS;
  const attempts = [];
  let lastFailure = { error: new Error('No voice model returned a clean answer.'), status: 502 };

  for (const model of MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_FALLBACK_BUDGET_MS) break;
    const result = await callFreeModel(model, messages, nonce, maxTokens, Math.min(MODEL_ATTEMPT_LIMIT_MS, remaining));
    attempts.push({ model, status: result.status, latencyMs: result.latencyMs });
    if (result.text) return { ...result, attempts };
    lastFailure = result;
    if (Number(result.status) === 429) break;
  }

  return { ...lastFailure, attempts };
}

async function answer(body) {
  const startedAt = Date.now();
  const message = clampText(body?.message, 1_400);
  if (!message) {
    const error = new Error('A spoken message is required.');
    error.status = 400;
    throw error;
  }

  const local = instantAnswer(message);
  if (local) {
    return {
      text: local,
      model: 'deterministic-fast-path',
      provider: 'local',
      credentialMode: 'none',
      path: 'instant',
      attemptCount: 0,
      latencyMs: Date.now() - startedAt
    };
  }

  const history = sanitizeHistory(body?.history);
  const locale = clampText(body?.locale, 40);
  const nonce = randomBytes(8).toString('hex');
  const system = [
    GENERAL_SYSTEM_PROMPT,
    needsDreamUnityContext(message, history) ? DREAM_UNITY_CONTEXT : '',
    `Visitor locale: ${locale || 'unknown'}.`,
    answerProtocol(nonce)
  ].filter(Boolean).join('\n\n');
  const messages = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: message }
  ];

  const result = await firstCleanAnswer(messages, nonce, tokenBudget(message));
  if (result.text) {
    return {
      text: result.text,
      model: result.model,
      requestedModel: result.requestedModel,
      provider: 'blockrun',
      credentialMode: 'none',
      path: 'model',
      attemptCount: result.attempts.length,
      latencyMs: Date.now() - startedAt
    };
  }

  const error = result?.error instanceof Error ? result.error : new Error('No free voice model is currently available.');
  error.status = Number(result?.status) || 502;
  error.attempts = result?.attempts || [];
  error.latencyMs = Date.now() - startedAt;
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
      responseStrategy: 'instant-local-or-eight-second-bounded-failover',
      applicationRateLimit: 'none',
      totalUpstreamBudgetMs: TOTAL_UPSTREAM_BUDGET_MS
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  try {
    const payload = await answer(req.body && typeof req.body === 'object' ? req.body : {});
    res.setHeader('Server-Timing', `unity;dur=${payload.latencyMs}`);
    res.setHeader('X-Unity-Path', payload.path);
    console.log('Unity voice turn complete', JSON.stringify({ path: payload.path, latencyMs: payload.latencyMs, model: payload.model, requestedModel: payload.requestedModel || null, attemptCount: payload.attemptCount }));
    return res.status(200).json(payload);
  } catch (error) {
    const status = Number(error?.status) || 502;
    const latencyMs = Number(error?.latencyMs) || 0;
    if (latencyMs) res.setHeader('Server-Timing', `unity;dur=${latencyMs}`);
    console.error('Unity voice turn failed', JSON.stringify({ status, latencyMs, attempts: error?.attempts || [], message: error?.message || 'unknown' }));
    if (status === 400) return res.status(400).json({ code: 'BAD_INPUT', error: error.message });
    if (status === 429) {
      res.setHeader('Retry-After', '2');
      return res.status(503).json({ code: 'VOICE_BACKENDS_BUSY', error: 'Unity could not reach an answer service for that turn.' });
    }
    if (status === 504) return res.status(504).json({ code: 'VOICE_TIMEOUT', error: 'Unity could not answer within the voice latency budget.' });
    return res.status(502).json({ code: 'VOICE_CHAT_FAILED', error: 'Unity could not answer that turn.' });
  }
}
