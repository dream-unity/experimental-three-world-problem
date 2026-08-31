# Free-host wrapper for the official open-source God's Eye View.
# The official app's live feeds are Vite server middleware, so this deliberately
# runs that real server instead of replacing it with a static imitation.

FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=development \
    OPENSKY_AUTH_MODE=anon \
    GEV_LOW_MEMORY=1 \
    NODE_OPTIONS=--max-old-space-size=352 \
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

# Hosted Vite settings: no HMR, no filesystem watcher, public hosts allowed.
COPY vite.hosted.config.mjs ./vite.hosted.config.mjs

RUN npm ci --no-audit --no-fund

EXPOSE 8080

CMD ["sh", "-c", "npm run dev -- --host 0.0.0.0 --port ${PORT:-8080} --config vite.hosted.config.mjs"]
