# ── Dev stage (default for docker compose) ──────────────────
FROM node:22-slim AS dev
WORKDIR /app

# System deps for Playwright Chromium (node-slim, NOT alpine)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libxshmfence1 libx11-xcb1 libxcb1 \
    libxfixes3 libxkbcommon0 \
    fonts-liberation fonts-noto-color-emoji ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci
RUN npx playwright install chromium

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY scripts ./scripts

EXPOSE 3030
CMD ["npx", "ts-node-dev", "--respawn", "src/index.ts"]

# ── Build stage ────────────────────────���────────────────────
FROM dev AS builder
RUN npm run build

# ── Production stage ─────────────────────────��──────────────
FROM node:22-slim AS production
WORKDIR /app

# Same system deps for Playwright in production
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libxshmfence1 libx11-xcb1 libxcb1 \
    libxfixes3 libxkbcommon0 \
    fonts-liberation fonts-noto-color-emoji ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
RUN npx playwright install chromium

COPY --from=builder /app/build ./build
COPY scripts ./scripts

EXPOSE 3030
CMD ["node", "build/index.js"]
