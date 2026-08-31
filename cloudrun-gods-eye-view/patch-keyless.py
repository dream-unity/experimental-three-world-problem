from pathlib import Path

main_file = Path("/app/src/main.js")
source = main_file.read_text(encoding="utf-8")

required_key_block = """    // Set Google Maps API key for 3D Tiles
    const googleApiKey = import.meta.env.GOOGLE_MAPS_API_KEY;
    if (!googleApiKey) {
      throw new Error('GOOGLE_MAPS_API_KEY not found. Set it as an environment variable.');
    }
    Cesium.GoogleMaps.defaultApiKey = googleApiKey;

    // Expose API key globally for geocoding in locations.js
    window.__GOOGLE_MAPS_API_KEY__ = googleApiKey;
"""

keyless_block = """    // Google Photorealistic 3D Tiles are optional in the hosted build.
    // With no key, the existing map stack falls back to keyless OSM imagery
    // plus Re:Earth terrain instead of aborting application startup.
    const googleApiKey = String(import.meta.env.GOOGLE_MAPS_API_KEY || '').trim();
    if (googleApiKey) {
      Cesium.GoogleMaps.defaultApiKey = googleApiKey;

      // Expose the key only when present; locations.js already handles the
      // geocoder being unavailable in keyless mode.
      window.__GOOGLE_MAPS_API_KEY__ = googleApiKey;
    } else {
      console.info('[Init] GOOGLE_MAPS_API_KEY absent; starting keyless OSM globe.');
    }
"""

if required_key_block not in source:
    raise RuntimeError(
        "Upstream src/main.js changed: required Google-key block was not found. "
        "Refusing to produce an unverified image."
    )

source = source.replace(required_key_block, keyless_block, 1)
source = source.replace(
    "    loaderStatus.textContent = 'Loading Google 3D Tiles...';",
    "    loaderStatus.textContent = googleApiKey ? 'Loading Google 3D Tiles...' : 'Loading keyless globe...';",
    1,
)
main_file.write_text(source, encoding="utf-8")
print("Applied verified keyless-start patch to src/main.js")

# Render Free has 512 MB RAM. The upstream OpenSky proxy normally downloads a
# worldwide state-vector snapshot. The client already sends its current camera
# latitude/longitude, and upstream already contains a normalized adsb.lol 250nm
# regional fallback. In low-memory mode, use that existing live regional path
# directly instead of materializing the whole planet in Node memory.
vite_file = Path("/app/vite.config.js")
vite_source = vite_file.read_text(encoding="utf-8")

# Protect the free upstream when users jump rapidly between distant locations.
# Same-anchor calls already coalesce/cache upstream; this tiny global start-rate
# gate additionally prevents distinct anchors from becoming an accidental burst.
adsb_constant_anchor = "const ADSBLOL_POINT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;"
adsb_paced_constants = """const ADSBLOL_POINT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const ADSBLOL_MIN_REQUEST_GAP_MS = 4000;
let _adsbLolPaceTail = Promise.resolve();
let _adsbLolNextAllowedAt = 0;

async function waitForAdsbLolRequestSlot() {
  const previous = _adsbLolPaceTail;
  let release;
  _adsbLolPaceTail = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    const delayMs = Math.max(0, _adsbLolNextAllowedAt - Date.now());
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    _adsbLolNextAllowedAt = Date.now() + ADSBLOL_MIN_REQUEST_GAP_MS;
  } finally {
    release();
  }
}"""

if adsb_constant_anchor not in vite_source:
    raise RuntimeError(
        "Upstream vite.config.js changed: ADS-B fallback constant anchor missing."
    )
vite_source = vite_source.replace(adsb_constant_anchor, adsb_paced_constants, 1)

fallback_request_anchor = """  const request = coalesceProxyRequest(_adsbLolPointInFlight, cacheKey, async () => {
    const controller = new AbortController();
"""
fallback_request_paced = """  const request = coalesceProxyRequest(_adsbLolPointInFlight, cacheKey, async () => {
    await waitForAdsbLolRequestSlot();
    const controller = new AbortController();
"""

if fallback_request_anchor not in vite_source:
    raise RuntimeError(
        "Upstream vite.config.js changed: ADS-B request anchor missing."
    )
vite_source = vite_source.replace(fallback_request_anchor, fallback_request_paced, 1)

opensky_anchor = """          const requestedMode = normalizeOpenSkyAuthMode(process.env.OPENSKY_AUTH_MODE);
          const now = Date.now();
"""
regional_block = """          const requestedMode = normalizeOpenSkyAuthMode(process.env.OPENSKY_AUTH_MODE);
          if (process.env.GEV_LOW_MEMORY === '1') {
            if (await serveAdsbLolPointFallback(
              req,
              res,
              requestedMode,
              'low_memory_regional_mode',
            )) {
              return;
            }
            // Keep the UI alive through transient upstream throttling. The next
            // normal client poll can recover automatically without a red error.
            res.writeHead(200, {
              ...buildOpenSkyHeaders({
                cacheStatus: 'MISS',
                requestedMode,
                usedMode: 'none',
                reason: 'regional_source_temporarily_unavailable',
              }),
              'Retry-After': '10',
              'X-Flight-Source': 'temporarily-unavailable',
            });
            res.end(JSON.stringify({ time: Math.floor(Date.now() / 1000), states: [] }));
            return;
          }
          const now = Date.now();
"""

if opensky_anchor not in vite_source:
    raise RuntimeError(
        "Upstream vite.config.js changed: OpenSky proxy anchor was not found. "
        "Refusing to produce an unverified low-memory image."
    )

vite_source = vite_source.replace(opensky_anchor, regional_block, 1)

# CelesTrak is sometimes unreachable from shared cloud-host egress. Orbicentral
# intentionally exposes a CelesTrak-compatible GP API (same GROUP/FORMAT query
# contract) using public Space-Track orbital elements, so the existing GEV TLE
# parser can continue unchanged. Only low-memory/cloud mode swaps the upstream;
# normal installations keep using CelesTrak exactly as upstream intended.
celestrak_url_anchor = "const url = new URL('https://celestrak.org/NORAD/elements/gp.php');"
cloud_satellite_url = """const url = new URL(
      process.env.GEV_LOW_MEMORY === '1'
        ? 'https://www.orbicentral.net/gp.php'
        : 'https://celestrak.org/NORAD/elements/gp.php'
    );"""
if celestrak_url_anchor not in vite_source:
    raise RuntimeError(
        "Upstream vite.config.js changed: CelesTrak URL anchor missing."
    )
vite_source = vite_source.replace(celestrak_url_anchor, cloud_satellite_url, 1)

vite_file.write_text(vite_source, encoding="utf-8")
print("Applied paced regional flights and Orbicentral cloud satellite source")
