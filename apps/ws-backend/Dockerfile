FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN pnpm add -g turbo
COPY . .
RUN pnpm install
# Clean all build artifacts
RUN find packages -name "*.tsbuildinfo" -delete
RUN find packages -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
RUN find apps -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
# Now build
RUN pnpm turbo run build --filter=ws-backend

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=builder /app/apps/ws-backend/dist /app/apps/ws-backend/dist
COPY --from=builder /app/apps/ws-backend/node_modules /app/apps/ws-backend/node_modules
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml

ENV NODE_ENV=production
EXPOSE 3002

CMD ["node", "apps/ws-backend/dist/index.js"]
