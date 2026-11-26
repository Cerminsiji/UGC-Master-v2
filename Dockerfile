# Multi-stage Dockerfile for Next.js 15 + Python 3 + FFmpeg
# Optimized for UGC Master & MetaCleaner AIO Engine

FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install runtime dependencies: Python 3 and FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Stage 1: Install Node.js dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* bun.lock* ./
RUN npm install --legacy-peer-deps

# Stage 2: Build the Next.js application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build standalone Next.js bundle and execute prepare-standalone script
RUN npm run build

# Stage 3: Production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root system user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application assets and standalone output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/scripts ./scripts

# Ensure /tmp has correct read/write permissions for video processing
RUN mkdir -p /tmp && \
    chown -R nextjs:nodejs /app /tmp && \
    chmod 1777 /tmp

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
