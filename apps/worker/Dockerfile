# Production image for the queue worker (SRS ARC 003, OPS 002/003).
# Built from the repository root: docker build -f apps/worker/Dockerfile .
FROM node:24.19.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/database/package.json packages/database/
COPY packages/domain/package.json packages/domain/
COPY packages/mail/package.json packages/mail/
RUN pnpm install --frozen-lockfile --filter worker... --filter @adelaide-sphere/database... --filter @adelaide-sphere/domain... --filter @adelaide-sphere/mail...

FROM deps AS build
COPY . .
RUN pnpm db:build && pnpm domain:build && pnpm mail:build && pnpm --filter worker build

FROM base AS runtime
ENV NODE_ENV=production
USER node
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=node:node /app/apps/worker/package.json ./apps/worker/
# The worker drains on SIGTERM (see main.ts); give the orchestrator time to wait.
STOPSIGNAL SIGTERM
CMD ["node", "apps/worker/dist/main.js"]
