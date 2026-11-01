# syntax=docker/dockerfile:1
# Emergency self-hosted build for Truvora (any non-Vercel host).
# Full checklist: deploy/README.md
#
# Build:
#   docker build -t truvora \
#     --build-arg NEXT_PUBLIC_APP_URL=https://app.example.com \
#     --secret id=database_url,env=DATABASE_URL \
#     .
# Run:
#   docker run -d --env-file .env -p 127.0.0.1:3000:3000 truvora

FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# --- deps: everything needed to build --------------------------------------
FROM base AS deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# --- build ------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Baked into the client bundle; must be the real production origin.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# DATABASE_URL is passed as a BuildKit *secret*, never ARG/ENV, so it is not
# recorded in image layers. Only needed if a route touches the DB during
# prerendering; omit the secret and the build still succeeds for anything
# that does not read the DB at build time.
RUN --mount=type=secret,id=database_url,required=false \
    if [ -f /run/secrets/database_url ]; then \
        export DATABASE_URL="$(cat /run/secrets/database_url)"; \
    fi; \
    npm run build

# --- runtime ------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
# Bind 0.0.0.0 so the published port is reachable from outside the container.
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=build --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next ./.next
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
CMD ["npm", "start"]
