# SmartStore AI — portable image for Fly.io / a VPS / any Docker host.
# Render and Railway do NOT need this file (they build Next.js automatically);
# see docs/deployment.md.
#
# NOTE: `NEXT_PUBLIC_*` values are inlined at BUILD time, and src/libs/Env.ts
# validates the required server vars while `next build` evaluates pages. So the
# required vars must be present during the build, passed as --build-arg, e.g.:
#
#   docker build \
#     --build-arg DATABASE_URL="postgres://...neon.../db?sslmode=require" \
#     --build-arg CLERK_SECRET_KEY="sk_live_..." \
#     --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..." \
#     --build-arg NEXT_PUBLIC_APP_URL="https://smartstore-ai.com" \
#     -t smartstore-ai .
#
# Provide ALL runtime env (the full set from docs/deployment.md) at `docker run`
# / the platform's runtime env — not just the build args above.

# ---- dependencies ----
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:24-slim AS build
WORKDIR /app

# Required at build (Env validation + NEXT_PUBLIC inlining).
ARG DATABASE_URL
ARG CLERK_SECRET_KEY
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_LOGGING_LEVEL
ENV DATABASE_URL=$DATABASE_URL \
    CLERK_SECRET_KEY=$CLERK_SECRET_KEY \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_LOGGING_LEVEL=$NEXT_PUBLIC_LOGGING_LEVEL \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SENTRY_DISABLED=true

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Run as a non-root user.
RUN useradd --system --uid 1001 nextjs
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
USER nextjs

EXPOSE 3000
CMD ["npm", "start"]
