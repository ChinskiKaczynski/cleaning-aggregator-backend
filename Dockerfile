FROM docker.io/oven/bun:1.2.2-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
# Instalujemy wszystkie zależności (dev + prod) na etapie budowania
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM docker.io/oven/bun:1.2.2-alpine
WORKDIR /app
COPY package.json bun.lock ./
# W finalnym obrazie instalujemy tylko produkcyjne zależności
RUN bun install --frozen-lockfile --production
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
CMD ["bun", "dist/server.js"]