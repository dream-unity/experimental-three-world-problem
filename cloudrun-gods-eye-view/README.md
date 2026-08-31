# God's Eye View — hosted launcher

This isolated deployment wrapper builds the official open-source
[`bilawalsidhu/gods-eye-view`](https://github.com/bilawalsidhu/gods-eye-view)
revision `314a0e1c2ef668cb110674b737e19a44ff6fc1ef` and runs its real Vite live-data
server.

It changes only one startup rule: a Google Maps billing key is no longer
mandatory. Without one, the application uses its existing keyless OpenStreetMap
imagery and Re:Earth terrain path. The free/public aircraft, military ADS-B,
satellites, earthquakes, radio, weather and supported CCTV paths remain in the
actual upstream application. Optional paid/keyed layers remain optional.

## No-card option — Render Free

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dream-unity/experimental-three-world-problem/tree/cloudrun-gods-eye-view)

The branch contains a `render.yaml` Blueprint selecting Render's Free Docker
web-service plan. No payment method is required to create the free service.

## Google Cloud Run

[![Run on Google Cloud](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run?git_repo=https://github.com/dream-unity/experimental-three-world-problem&revision=cloudrun-gods-eye-view&dir=cloudrun-gods-eye-view)

The branch is isolated from `main`; it does not alter Dream Unity's deployed
application.
