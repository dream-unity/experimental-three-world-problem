export const API_RELEASE = '20260829-unity-backend-paused-1';

const SERVICE = 'dream-unity-voice-chat';
const ALLOWED_ORIGINS = new Set([
  'https://dream-unity.github.io',
]);

function allowedOrigin(req) {
  const origin = String(req?.headers?.origin || '');
  if (!origin) return '';
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(origin)) return origin;

  const host = String(req?.headers?.host || '').toLowerCase();
  try {
    const parsed = new URL(origin);
    if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.host.toLowerCase() === host) {
      return origin;
    }
  } catch {
    return null;
  }
  return null;
}

function applyCors(req, res) {
  const origin = allowedOrigin(req);
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

export function createHandler() {
  return function pausedUnityVoiceHandler(req, res) {
    applyCors(req, res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req?.method === 'OPTIONS') return res.status(204).end();

    return res.status(410).json({
      ok: false,
      service: SERVICE,
      release: API_RELEASE,
      status: 'paused',
      code: 'VOICE_DISABLED',
      message: 'Unity voice is paused for later work.',
    });
  };
}

export default createHandler();
