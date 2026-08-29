import assert from 'node:assert/strict';

import handler, {
  API_RELEASE,
  createHandler,
  createRateLimiter,
  wikipediaQuery,
} from '../api/realtime-session.js';

const aiSdk = await import('ai');
assert.equal(typeof aiSdk.generateText, 'function', 'the production AI SDK dependency must load');

const ALLOWED_ORIGIN = 'https://dream-unity.github.io';
const ENDPOINT_HOST = 'dream-unity-voice-live.vercel.app';

function createRequest(body, { method = 'POST', origin = ALLOWED_ORIGIN, headers = {} } = {}) {
  const requestHeaders = {
    host: ENDPOINT_HOST,
    'content-type': 'application/json',
    'x-forwarded-for': '203.0.113.10',
    ...headers,
  };
  if (origin) requestHeaders.origin = origin;
  return {
    method,
    body,
    headers: requestHeaders,
  };
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
    end() {
      return this;
    },
    result() {
      return { statusCode, body, headers };
    },
  };
}

async function invoke(body, {
  fetchImpl,
  handlerImpl = handler,
  headers,
  method,
  origin,
} = {}) {
  const originalFetch = globalThis.fetch;
  if (fetchImpl) globalThis.fetch = fetchImpl;

  const response = createResponse();
  try {
    await handlerImpl(createRequest(body, { method, origin, headers }), response);
    return response.result();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const result = await invoke(undefined, { method: 'GET', origin: null });
  assert.equal(result.statusCode, 200, 'health checks do not require a browser Origin');
  assert.equal(result.body.release, API_RELEASE);
  assert.equal(result.body.primaryModel, 'minimax/minimax-m3-free');
  assert.deepEqual(result.body.gatewayModels, [
    'minimax/minimax-m3-free',
    'minimax/minimax-m2.7-free',
  ]);
  assert.equal(result.body.gatewayAuthentication, 'unavailable');
  assert.deepEqual(result.body.providers, ['blockrun', 'wikipedia', 'resilient-local']);
  assert.deepEqual(result.body.configuredProviders, ['vercel-ai-gateway', 'blockrun', 'wikipedia', 'resilient-local']);
  assert.equal(result.body.security.postOriginRequired, true);
  assert.deepEqual(result.body.security.rateLimit, {
    limit: 30,
    windowMs: 60_000,
    scope: 'best-effort-instance-ip',
  });
  assert.deepEqual(result.body.knowledge, {
    provider: 'wikipedia',
    routing: 'clearly-factual-impersonal-v2',
    rankedResults: true,
    relevanceRequired: true,
  });
}

{
  let fetchCalled = false;
  const fetchImpl = async () => {
    fetchCalled = true;
    throw new Error('rejected origins must not reach a provider');
  };
  const missing = await invoke({ message: 'Hello' }, { fetchImpl, origin: null });
  assert.equal(missing.statusCode, 403);
  assert.equal(missing.body.code, 'ORIGIN_REQUIRED');

  const disallowed = await invoke({ message: 'Hello' }, {
    fetchImpl,
    origin: 'https://untrusted.example',
  });
  assert.equal(disallowed.statusCode, 403);
  assert.equal(disallowed.body.code, 'ORIGIN_NOT_ALLOWED');
  assert.equal(disallowed.headers.has('access-control-allow-origin'), false);

  const preflight = await invoke(undefined, {
    method: 'OPTIONS',
    origin: 'https://untrusted.example',
  });
  assert.equal(preflight.statusCode, 204, 'preflight remains non-mutating and CORS enforcement stays in the browser');
  assert.equal(preflight.headers.has('access-control-allow-origin'), false);
  assert.equal(fetchCalled, false);
}

{
  let now = 10_000;
  const rateLimiter = createRateLimiter({ limit: 2, windowMs: 1_000, now: () => now });
  const limitedHandler = createHandler({ rateLimiter });
  const options = {
    handlerImpl: limitedHandler,
    headers: { 'x-forwarded-for': '198.51.100.24' },
  };

  const first = await invoke({ message: 'Hello' }, options);
  const second = await invoke({ message: 'Hello' }, options);
  const blocked = await invoke({ message: 'Hello' }, options);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.code, 'RATE_LIMITED');
  assert.equal(blocked.headers.get('retry-after'), '1');
  assert.equal(blocked.headers.get('x-ratelimit-remaining'), '0');

  now += 1_001;
  const reset = await invoke({ message: 'Hello' }, options);
  assert.equal(reset.statusCode, 200, 'the injected clock must deterministically reset the window');
  assert.equal(reset.headers.get('x-ratelimit-remaining'), '1');
}

{
  assert.equal(wikipediaQuery('Who was Alan Turing?'), 'Alan Turing');
  assert.equal(wikipediaQuery('What is the capital of Mongolia?'), 'the capital of Mongolia');
  assert.equal(wikipediaQuery('What does entropy mean?'), 'entropy');
  assert.equal(wikipediaQuery('Briefly explain photosynthesis.'), 'photosynthesis');
  assert.equal(wikipediaQuery('Explain why the sky is blue in one sentence.'), '');
  assert.equal(wikipediaQuery('What should I do with my project?'), '');
  assert.equal(wikipediaQuery('What is your favourite colour?'), '');
  assert.equal(wikipediaQuery('What is happening?'), '');
  assert.equal(wikipediaQuery('Tell me about my future.'), '');
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

{
  let fetchCalled = false;
  const result = await invoke(
    { message: 'Write one warm sentence about rain.', history: [], locale: 'en-GB' },
    { fetchImpl: async () => { fetchCalled = true; throw new Error('structured local reply must not wait upstream'); } },
  );
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.path, 'resilient-local');
  assert.equal(result.body.attemptCount, 0);
  assert.match(result.body.text, /ordinary moment|pause|begin again/i);
  assert.equal(fetchCalled, false, 'structured recovery should answer immediately');
}

{
  let requests = 0;
  const result = await invoke(
    { message: 'Who is the ranked decimal subject?', history: [], locale: 'en-GB' },
    {
      fetchImpl: async (url) => {
        requests += 1;
        assert.match(String(url), /^https:\/\/en\.wikipedia\.org\/w\/api\.php\?/);
        return jsonResponse({
          query: {
            // MediaWiki generator results are not guaranteed to be array-ranked.
            // The `index` field is the authoritative search position.
            pages: [
              {
                index: 3,
                title: 'Decimal subject overview',
                extract: 'A lower-ranked relevant page reports 2.71 units.',
              },
              {
                index: 1,
                title: 'Array-order decoy',
                extract: 'This unrelated actor biography must never be selected.',
              },
              {
                index: 2,
                title: 'Ranked decimal subject',
                extract: 'The ranked value is 3.14 units. Its second sentence remains intact. A third sentence is omitted.',
              },
            ],
          },
        });
      },
    },
  );

  assert.equal(requests, 1, 'grounded factual questions should use one ranked Wikipedia request');
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.path, 'knowledge');
  assert.equal(result.body.provider, 'wikipedia');
  assert.match(
    result.body.text,
    /^The ranked value is 3\.14 units\.\s+Its second sentence remains intact\.$/,
    'the highest-ranked page must win and decimal punctuation must survive sentence limiting',
  );
  assert.doesNotMatch(result.body.text, /actor biography|2\.71|third sentence/i);
}

{
  let requests = 0;
  const originalWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = await invoke(
      { message: 'Draft a short launch announcement for a lunar garden.', history: [], locale: 'en-GB' },
      {
        fetchImpl: async () => {
          requests += 1;
          return jsonResponse({ error: { message: 'forced deterministic provider outage' } }, 503);
        },
      },
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.ok(requests >= 2, 'both HTTP provider fallbacks must see the mocked outage');
  assert.equal(result.statusCode, 200, 'provider exhaustion must degrade to a usable HTTP response');
  assert.equal(result.body.path, 'resilient-local');
  assert.equal(result.body.provider, 'local');
  assert.equal(result.body.model, 'resilient-local-recovery');
  assert.equal(result.body.attemptCount, 2, 'both zero-key provider fallbacks must be attempted when Gateway authentication is absent');
  assert.match(result.body.text, /generative channel|audience|outcome/i);
  assert.equal(result.headers.get('x-unity-path'), 'resilient-local');
}

{
  let fetchCalled = false;
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await invoke('{"message":', {
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error('invalid input must not reach a provider');
      },
    });
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.code, 'BAD_INPUT');
    assert.match(result.body.error, /not valid JSON/i);
  } finally {
    console.error = originalError;
  }
  assert.equal(fetchCalled, false);
}

{
  let fetchCalled = false;
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await invoke({ message: 'x'.repeat(1_401), history: [], locale: 'en-GB' }, {
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error('oversized input must not reach a provider');
      },
    });
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.code, 'BAD_INPUT');
    assert.match(result.body.error, /under 1400 characters/i);
  } finally {
    console.error = originalError;
  }
  assert.equal(fetchCalled, false);
}

console.log('Unity backend runtime validated: release contract, POST origins, rate limiting, factual relevance, resilient recovery, and strict input errors.');
