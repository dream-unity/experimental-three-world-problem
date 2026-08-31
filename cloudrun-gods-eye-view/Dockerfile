# Free-host wrapper for the official open-source God's Eye View.
# The frontend is compiled at image-build time; the runtime Vite process remains
# only because the official live-data proxy stack is implemented there.

FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=development \
    OPENSKY_AUTH_MODE=anon \
    GEV_LOW_MEMORY=1 \
    PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Pin the reviewed upstream revision so our small hosting adaptations remain
# reproducible even if the public repository changes later.
ARG GEV_COMMIT=314a0e1c2ef668cb110674b737e19a44ff6fc1ef
RUN git clone --no-tags https://github.com/bilawalsidhu/gods-eye-view.git /app \
    && cd /app \
    && git checkout "$GEV_COMMIT" \
    && rm -rf .git docs/media qa-shots screenshots output

WORKDIR /app

# Apply two deliberately narrow adaptations:
# 1) keyless OSM/Re:Earth startup when Google credentials are absent;
# 2) current-view adsb.lol live flights instead of a RAM-heavy global snapshot.
COPY patch-keyless.py /tmp/patch-keyless.py
RUN python3 /tmp/patch-keyless.py && rm /tmp/patch-keyless.py

RUN npm ci --no-audit --no-fund

# Compile the browser app while build resources are available. At runtime we
# serve dist/ directly, so the 512 MB free instance never transforms Cesium.
RUN npm run build

COPY vite.hosted.config.mjs ./vite.hosted.config.mjs

# Runtime Node now needs memory only for live proxies/caches, not bundling.
ENV NODE_OPTIONS=--max-old-space-size=256

EXPOSE 8080

CMD ["sh", "-c", "npm run dev -- --host 0.0.0.0 --port ${PORT:-8080} --config vite.hosted.config.mjs"]
