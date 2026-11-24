# syntax=docker/dockerfile:1
#
# Stages:
#   deps     - npm ci (shared)
#   dev      - `next dev` with the source mounted (docker-compose.dev.yml)
#   builder  - prisma generate + next build (standalone output)
#   migrate  - one-shot `prisma migrate deploy` (has the Prisma CLI and migrations)
#   runner   - production image: only .next/standalone + static assets, runs `node server.js`

FROM node:24.22.3-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS dev
COPY . .
EXPOSE 3002
CMD ["npm", "run", "dev"]

FROM deps AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
# No DB access or secrets are needed here: the Prisma client connects lazily at runtime.
# prisma.config.ts builds a datasource URL from POSTGRES_* when loaded, so `generate` (which never
# connects) gets throwaway values just for this command.
RUN POSTGRES_USER=build POSTGRES_PASSWORD=build POSTGRES_DB=build npx prisma generate \
 && npx next build

FROM builder AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24.22.3-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3002 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3002
CMD ["node", "server.js"]
