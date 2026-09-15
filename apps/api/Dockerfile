# Production image for the API (SRS OPS 002: immutable, reproducible builds).
# Built from the repository root: docker build -f apps/api/Dockerfile .
FROM node:24.19.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/database/package.json packages/database/
COPY packages/domain/package.json packages/domain/
COPY packages/mail/package.json packages/mail/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter api... --filter @adelaide-sphere/database... --filter @adelaide-sphere/domain... --filter @adelaide-sphere/mail...

FROM deps AS build
COPY . .
RUN pnpm db:build && pnpm domain:build && pnpm mail:build && pnpm --filter api build

FROM base AS runtime
ENV NODE_ENV=production
# Never run as root; the image carries no shell tooling it does not need.
USER node
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/
EXPOSE 3001
# Readiness and liveness are separate endpoints (SRS OPS 003); the orchestrator
# probes /api/v1/health/ready before sending traffic.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
