import assert from 'node:assert/strict';
import fs from 'node:fs';

import handler, { API_RELEASE } from '../api/realtime-session.js';

const EXPECTED_RELEASE = '20260829-unity-backend-paused-1';
const ALLOWED_ORIGIN = 'https://dream-unity.github.io';
const ENDPOINT_HOST = 'dream-unity-voice-live.vercel.app';
const source = fs.readFileSync(new URL('../api/realtime-session.js', import.meta.url), 'utf8');

function createRequest({ method = 'GET', origin = ALLOWED_ORIGIN, body } = {}) {
  const headers = {
    host: ENDPOINT_HOST,
    'content-type': 'application/json',
  };
  if (origin) headers.origin = origin;
  return { method, headers, body };
}

function createResponse() {
  const headers = new Map();
  let statusCode = 200;
  let body;

  return {
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
      return this;
    },
    status(value) {
      statusCode = Number(value);
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
    send(value) {
      body = value;
      return this;
    },
    end(value) {
      if (value !== undefined) body = value;
      return this;
    },
    result() {
      return { statusCode, body, headers };
    },
  };
}

async function invoke(options) {
  const response = createResponse();
  await handler(createRequest(options), response);
  return response.result();
}

assert.equal(API_RELEASE, EXPECTED_RELEASE, 'the public endpoint must identify the paused release');
assert.doesNotMatch(source, /\bfrom\s+["']ai["']|\bgenerateText\s*\(|blockrun\.ai|wikipedia\.org|process\.env/i, 'the paused endpoint must contain no model, provider or credential route');
assert.doesNotMatch(source, /\bfetch\s*\(/, 'the paused endpoint must not make upstream requests');

let providerCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  providerCalls += 1;
  throw new Error('the paused endpoint must never call fetch');
};

try {
  for (const origin of [ALLOWED_ORIGIN, 'https://untrusted.example', null]) {
    const preflight = await invoke({ method: 'OPTIONS', origin });
    assert.equal(preflight.statusCode, 204, 'all preflights must terminate without invoking a provider');
    assert.equal(preflight.body, undefined);
  }

  for (const request of [
    { method: 'GET', origin: null },
    { method: 'POST', body: { message: 'Hello' } },
    { method: 'POST', body: '{not-json' },
    { method: 'PUT', origin: 'https://untrusted.example', body: { message: 'Hello' } },
  ]) {
    const result = await invoke(request);
    assert.equal(result.statusCode, 410, `${request.method} must return the reversible voice tombstone`);
    assert.equal(result.body?.release, EXPECTED_RELEASE);
    assert.equal(result.body?.code, 'VOICE_DISABLED');
    assert.match(String(result.body?.error || result.body?.message || ''), /voice.*(?:disabled|paused|unavailable)|(?:disabled|paused|unavailable).*voice/i);
  }
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(providerCalls, 0, 'the paused endpoint attempted an upstream provider call');

console.log('Unity backend tombstone validated: every non-preflight request returns 410 without provider activity.');
