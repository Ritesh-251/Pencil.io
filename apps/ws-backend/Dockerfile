FROM node:20-alpine

WORKDIR /app
RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=ws-backend

ENV NODE_ENV=production
EXPOSE 3003

CMD ["pnpm", "--filter", "ws-backend", "start"]
