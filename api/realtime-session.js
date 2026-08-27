import { createHash } from 'node:crypto';

const GATEWAY_CLIENT_SECRET_URL = 'https://ai-gateway.vercel.sh/v1/realtime/client-secrets';
const GATEWAY_REALTIME_URL = 'https://ai-gateway.vercel.sh/v4/ai/realtime-model';
const MODEL = 'openai/gpt-realtime-2.1';
const TOKEN_TTL_SECONDS = 30;
const REQUEST_TIMEOUT_MS = 8_000;
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
  return createHash('sha256').update(`dream-unity-realtime|${ip}|${agent}`).digest('hex');
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

function oidcToken(req) {
  const header = req.headers['x-vercel-oidc-token'];
  if (Array.isArray(header) && header[0]) return header[0];
  if (typeof header === 'string' && header) return header;
  return process.env.VERCEL_OIDC_TOKEN || '';
}

function realtimeUrl() {
  const url = new URL(GATEWAY_REALTIME_URL);
  url.protocol = 'wss:';
  url.searchParams.set('ai-model-id', MODEL);
  return url.toString();
}

async function mintGatewayToken(req) {
  const oidc = oidcToken(req);
  if (!oidc) {
    const error = new Error('Vercel OIDC is not available to this deployment.');
    error.status = 503;
    error.code = 'OIDC_NOT_AVAILABLE';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(GATEWAY_CLIENT_SECRET_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${oidc}`,
        'Content-Type': 'application/json',
        'ai-gateway-protocol-version': '0.0.1',
        'ai-gateway-auth-method': 'oidc'
      },
      body: JSON.stringify({
        model: MODEL,
        expiresIn: TOKEN_TTL_SECONDS
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.token) {
      const error = new Error(data?.error?.message || data?.error || data?.message || `AI Gateway client-secret request failed (${response.status}).`);
      error.status = response.status || 502;
      error.code = response.status === 402 ? 'GATEWAY_BUDGET'
        : response.status === 429 ? 'GATEWAY_RATE_LIMIT'
          : response.status === 401 || response.status === 403 ? 'GATEWAY_AUTH'
            : 'GATEWAY_SESSION_FAILED';
      throw error;
    }

    return {
      token: data.token,
      url: realtimeUrl(),
      expiresAt: data.expiresAt ?? null,
      model: MODEL,
      tools: []
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timed = new Error('AI Gateway did not mint a realtime session in time.');
      timed.status = 504;
      timed.code = 'GATEWAY_TIMEOUT';
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
      service: 'dream-unity-realtime-voice',
      model: MODEL,
      provider: 'vercel-ai-gateway',
      configured: Boolean(oidcToken(req)),
      credentialMode: 'vercel-oidc',
      permanentProviderKeyRequired: false,
      speechMode: 'realtime-websocket'
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (rateLimited(req)) {
    return res.status(429).json({ code: 'VOICE_RATE_LIMIT', error: 'Voice session limit reached. Try again shortly.' });
  }

  try {
    return res.status(200).json(await mintGatewayToken(req));
  } catch (error) {
    const status = Number(error?.status) || 502;
    const code = String(error?.code || 'VOICE_SESSION_FAILED');
    console.error('Dream Unity AI Gateway realtime session failure', status, code);
    if (status === 402) return res.status(402).json({ code: 'GATEWAY_BUDGET', error: 'Dream Unity AI Gateway usage credit is unavailable.' });
    if (status === 429) return res.status(429).json({ code: 'GATEWAY_RATE_LIMIT', error: 'Dream Unity realtime voice is briefly rate-limited.' });
    if (status === 504) return res.status(504).json({ code: 'GATEWAY_TIMEOUT', error: 'Dream Unity realtime voice session timed out.' });
    if (status === 401 || status === 403) return res.status(status).json({ code: 'GATEWAY_AUTH', error: 'Dream Unity could not authenticate its AI Gateway session.' });
    if (status === 503) return res.status(503).json({ code, error: 'Dream Unity realtime voice is not available in this deployment.' });
    return res.status(502).json({ code, error: 'Dream Unity could not create a realtime voice session.' });
  }
}
