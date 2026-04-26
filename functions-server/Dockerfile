# ── deps stage ────────────────────────────────────────────────────────────────
FROM oven/bun:1.1-alpine AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production
 
# ── runtime stage ─────────────────────────────────────────────────────────────
FROM oven/bun:1.1-alpine AS runner
WORKDIR /app
 
COPY --from=deps /app/node_modules ./node_modules
COPY . .
 
USER bun
EXPOSE 9000
 
HEALTHCHECK --interval=5s --timeout=3s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:9000/health || exit 1
 
CMD ["bun", "run", "server.ts"]