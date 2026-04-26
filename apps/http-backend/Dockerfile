FROM node:20-alpine

WORKDIR /app
RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=http-backend

ENV NODE_ENV=production
EXPOSE 3001

CMD ["pnpm", "--filter", "http-backend", "start"]
