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
            res.writeHead(503, buildOpenSkyHeaders({
              cacheStatus: 'MISS',
              requestedMode,
              usedMode: 'none',
              reason: 'regional_anchor_unavailable',
            }));
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
vite_file.write_text(vite_source, encoding="utf-8")
print("Applied low-memory regional adsb.lol flight mode to vite.config.js")
