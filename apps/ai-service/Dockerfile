FROM node:20-alpine

WORKDIR /app
RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=ai-service

ENV NODE_ENV=production
EXPOSE 3004

CMD ["pnpm", "--filter", "ai-service", "start"]
