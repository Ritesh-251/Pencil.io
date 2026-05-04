#!/bin/sh
docker run --rm -v "$PWD":/app -w /app node:20-alpine sh -c "apk add --no-cache libc6-compat && npm install -g pnpm && pnpm install && pnpm turbo run build --filter=http-backend --force && ls -la packages/redis/dist"
