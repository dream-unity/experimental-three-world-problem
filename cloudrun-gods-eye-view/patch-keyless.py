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
