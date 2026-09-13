# Console image — pinned so a fresh clone builds identically everywhere.
#
# Nothing here depends on a developer having Node, npm or the right version of
# either: `docker compose up` is the whole setup step.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` installs exactly the lockfile, never a drifting resolution.
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Baked in at build time: Next inlines NEXT_PUBLIC_* into the client bundle.
ARG NEXT_PUBLIC_API_URL=/api/backend
ARG BACKEND_API_URL=http://host.docker.internal:8000
ENV BACKEND_API_URL=$BACKEND_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# Also set at runtime: the build bakes the proxy target into the route
# manifest, but a server that re-reads the config must resolve the same host.
ARG BACKEND_API_URL=http://host.docker.internal:8000
ENV BACKEND_API_URL=$BACKEND_API_URL
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run unprivileged; the standalone bundle needs nothing writable.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
