import { createHash } from 'node:crypto';
import { gateway } from 'ai';

const MODEL = 'openai/gpt-realtime-2.1';
const TOKEN_TTL_SECONDS = 30;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT = 6;
const rateBuckets = new Map();

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

async function mintGatewayToken() {
  const secret = await gateway.experimental_realtime.getToken({
    model: MODEL,
    expiresAfterSeconds: TOKEN_TTL_SECONDS
  });
  return {
    token: secret.token,
    url: secret.url,
    expiresAt: secret.expiresAt,
    tools: [],
    model: MODEL
  };
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
      service: 'dream-unity-realtime-voice',
      model: MODEL,
      configured: true,
      credentialMode: 'vercel-oidc-ai-gateway',
      providerCredentialsRequired: false
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (rateLimited(req)) {
    return res.status(429).json({
      code: 'VOICE_RATE_LIMIT',
      error: 'Voice session limit reached. Try again later.'
    });
  }

  try {
    return res.status(200).json(await mintGatewayToken());
  } catch (error) {
    const status = Number(error?.statusCode || error?.status) || 502;
    console.error('Dream Unity AI Gateway realtime token failure', status, error?.message || 'unknown');
    if (status === 401 || status === 403) {
      return res.status(503).json({
        code: 'GATEWAY_AUTH_FAILED',
        error: 'Dream Unity AI Gateway authentication is unavailable.'
      });
    }
    if (status === 402) {
      return res.status(402).json({
        code: 'GATEWAY_CREDIT_REQUIRED',
        error: 'Dream Unity AI Gateway requires available usage credit.'
      });
    }
    return res.status(502).json({
      code: 'VOICE_SESSION_FAILED',
      error: 'Voice session could not be created.'
    });
  }
}
