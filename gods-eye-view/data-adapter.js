(() => {
  'use strict';

  const lowerFetch = window.fetch.bind(window);
  const API_ORIGIN = 'https://gods-eye-view-live.vercel.app';
  const RADIO_HOSTS = [
    'https://de1.api.radio-browser.info',
    'https://de2.api.radio-browser.info',
    'https://at1.api.radio-browser.info',
  ];
  const aircraftCache = new Map();
  const satelliteCache = new Map();
  const MAX_AIRCRAFT_CACHE_MS = 20000;
  const MAX_SATELLITE_CACHE_MS = 60 * 60 * 1000;

  const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Dream-Unity-Data-Adapter': '20260831-earth-fixed-2',
    },
  });

  function routeFromInput(input) {
    try {
      const href = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const url = new URL(href, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return null;
      return url;
    } catch {
      return null;
    }
  }

  async function fetchJSON(url, init = {}) {
    const response = await lowerFetch(url, {
      cache: 'no-store',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.json();
  }

  function normalizeRadioStation(station) {
    const lat = Number(station.geo_lat);
    const lon = Number(station.geo_long);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    const id = String(station.stationuuid || station.changeuuid || '').trim();
    if (!id) return null;
    return {
      id,
      name: String(station.name || 'Unnamed station').trim(),
      lat,
      lon,
      country: station.country || station.countrycode || '',
      language: station.language || '',
      codec: station.codec || '',
      bitrate: Number(station.bitrate) || 0,
      url: station.url_resolved || station.url || '',
    };
  }

  async function radioPayload() {
    let lastError;
    const path = '/json/stations/search?hidebroken=true&limit=450&order=clickcount&reverse=true&has_geo_info=true';
    for (const host of RADIO_HOSTS) {
      try {
        const raw = await fetchJSON(host + path);
        const seen = new Set();
        const stations = [];
        for (const item of Array.isArray(raw) ? raw : []) {
          const station = normalizeRadioStation(item);
          if (!station || seen.has(station.id)) continue;
          seen.add(station.id);
          stations.push(station);
        }
        if (!stations.length) throw new Error(`No geocoded stations returned by ${host}`);
        return { stations, source: 'Radio Browser', spatialModel: 'earth-fixed-wgs84' };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Radio Browser unavailable');
  }

  async function earthquakePayload() {
    return fetchJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
  }

  async function weatherPayload(apiUrl) {
    const lat = Number(apiUrl.searchParams.get('lat'));
    const lon = Number(apiUrl.searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Invalid weather coordinates');
    const upstream = new URL('https://api.open-meteo.com/v1/forecast');
    upstream.searchParams.set('latitude', String(lat));
    upstream.searchParams.set('longitude', String(lon));
    upstream.searchParams.set('current', [
      'temperature_2m',
      'apparent_temperature',
      'wind_speed_10m',
      'wind_direction_10m',
      'cloud_cover',
      'surface_pressure',
    ].join(','));
    upstream.searchParams.set('timezone', 'GMT');
    return fetchJSON(upstream.toString());
  }

  async function searchPayload(apiUrl) {
    const query = String(apiUrl.searchParams.get('q') || '').trim();
    if (!query) return { results: [] };
    const upstream = new URL('https://nominatim.openstreetmap.org/search');
    upstream.searchParams.set('q', query);
    upstream.searchParams.set('format', 'jsonv2');
    upstream.searchParams.set('limit', '5');
    upstream.searchParams.set('addressdetails', '0');
    const raw = await fetchJSON(upstream.toString(), {
      headers: { 'Accept-Language': navigator.language || 'en' },
    });
    return {
      results: (Array.isArray(raw) ? raw : []).map((item) => ({
        name: item.display_name || item.name || query,
        lat: Number(item.lat),
        lon: Number(item.lon),
      })).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon)),
    };
  }

  async function launchPayload() {
    const raw = await fetchJSON('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=30');
    const launches = (raw.results || []).map((launch) => ({
      id: launch.id,
      name: launch.name,
      net: launch.net,
      status: launch.status?.name || '',
      lat: Number(launch.pad?.latitude),
      lon: Number(launch.pad?.longitude),
      pad: launch.pad?.name || '',
      agency: launch.launch_service_provider?.name || '',
    }));
    return { launches };
  }

  function parseJinaJSON(text) {
    let payload = String(text || '');
    const marker = 'Markdown Content:';
    const markerIndex = payload.indexOf(marker);
    if (markerIndex >= 0) payload = payload.slice(markerIndex + marker.length);
    payload = payload.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const objectStart = payload.indexOf('{');
    const arrayStart = payload.indexOf('[');
    let start = -1;
    if (objectStart >= 0 && arrayStart >= 0) start = Math.min(objectStart, arrayStart);
    else start = Math.max(objectStart, arrayStart);
    if (start < 0) throw new Error('Bridge response contains no JSON payload');
    const objectEnd = payload.lastIndexOf('}');
    const arrayEnd = payload.lastIndexOf(']');
    const end = Math.max(objectEnd, arrayEnd);
    if (end < start) throw new Error('Bridge JSON payload is incomplete');
    return JSON.parse(payload.slice(start, end + 1));
  }

  async function viaReaderBridge(apiUrl, cache, maxAgeMs) {
    const path = `${apiUrl.pathname}${apiUrl.search}`;
    const cacheKey = path;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < maxAgeMs) return cached.value;

    const target = new URL(API_ORIGIN + path);
    // Reader caches are useful for orbital elements, but regional ADS-B must
    // remain current. A coarse cache-buster limits upstream load to one request
    // per ~20 seconds per camera cell while avoiding stale cross-continent data.
    if (apiUrl.pathname === '/api/aircraft') {
      target.searchParams.set('_du', String(Math.floor(Date.now() / MAX_AIRCRAFT_CACHE_MS)));
    }
    const bridgeUrl = `https://r.jina.ai/${target.toString()}`;
    const response = await lowerFetch(bridgeUrl, {
      cache: 'no-store',
      headers: { Accept: 'text/plain' },
    });
    if (!response.ok) throw new Error(`Aircraft/orbit bridge HTTP ${response.status}`);
    const value = parseJinaJSON(await response.text());
    cache.set(cacheKey, { at: Date.now(), value });
    return value;
  }

  async function aircraftPayload(apiUrl) {
    const value = await viaReaderBridge(apiUrl, aircraftCache, MAX_AIRCRAFT_CACHE_MS);
    // Never reuse contacts from another camera cell. If the bridge response is
    // malformed, fail closed rather than making aircraft appear to travel with
    // the user in the same way the old radio markers seemed to.
    if (!value || !Array.isArray(value.aircraft)) throw new Error('Invalid aircraft payload');
    return value;
  }

  async function satellitePayload(apiUrl) {
    const value = await viaReaderBridge(apiUrl, satelliteCache, MAX_SATELLITE_CACHE_MS);
    if (!value || typeof value.tle !== 'string') throw new Error('Invalid satellite payload');
    return value;
  }

  async function routeAPI(apiUrl) {
    switch (apiUrl.pathname) {
      case '/api/radio': return radioPayload();
      case '/api/earthquakes': return earthquakePayload();
      case '/api/weather': return weatherPayload(apiUrl);
      case '/api/search': return searchPayload(apiUrl);
      case '/api/launches': return launchPayload();
      case '/api/aircraft': return aircraftPayload(apiUrl);
      case '/api/satellites': return satellitePayload(apiUrl);
      default: throw new Error(`Unsupported Dream Unity data route: ${apiUrl.pathname}`);
    }
  }

  window.fetch = async function dreamUnityBrowserNativeFetch(input, init) {
    const apiUrl = routeFromInput(input);
    if (!apiUrl) return lowerFetch(input, init);
    try {
      return jsonResponse(await routeAPI(apiUrl));
    } catch (error) {
      console.warn('[GodsEye/DataAdapter]', apiUrl.pathname, error);
      return jsonResponse({ error: String(error?.message || error) }, 503);
    }
  };

  window.__dreamUnityDataAdapter = Object.freeze({
    version: '20260831-earth-fixed-2',
    radio: 'direct-radio-browser',
    earthquakes: 'direct-usgs',
    weather: 'direct-open-meteo',
    search: 'direct-nominatim',
    launches: 'direct-launch-library-2',
    aircraft: 'regional-server-bridge',
    satellites: 'orbital-server-bridge',
  });
})();
