# God's Eye View — free browser deployment

This isolated branch deploys the real open-source
[`bilawalsidhu/gods-eye-view`](https://github.com/bilawalsidhu/gods-eye-view)
revision `314a0e1c2ef668cb110674b737e19a44ff6fc1ef`. It does not replace the project
with a mock interface.

## Deploy free — no supported payment card required

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dream-unity/experimental-three-world-problem/tree/cloudrun-gods-eye-view)

The root `render.yaml` selects Render's Free Docker web-service plan.

## What was adapted for free hosting

The upstream application normally requires a Google Maps key before startup.
This branch instead boots with the project's existing keyless OpenStreetMap +
Re:Earth terrain stack when Google credentials are absent.

The original browser application is compiled once while the container image is
built. At runtime the server serves that prebuilt frontend directly while the
upstream Vite middleware remains active for the real live-data proxy routes.
This avoids runtime Cesium/esbuild compilation on a 512 MB free instance.

The upstream civilian-flight client already sends the current camera latitude
and longitude. In `GEV_LOW_MEMORY=1` mode the server uses the upstream project's
existing adsb.lol 250-nautical-mile regional live feed around that camera point
instead of holding a worldwide OpenSky snapshot in Node memory. Moving the globe
therefore moves the live aircraft window with it.

No API secrets are committed. Optional keyed features can be added later without
being required to boot the public application.

This branch is isolated from `main`; Dream Unity's deployed application is not
modified.
