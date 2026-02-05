# Build stage - Frontend
FROM node:25-alpine AS frontend-builder

WORKDIR /app

# Install build dependencies for canvas
RUN apk add --no-cache python3 g++ make cairo-dev pango-dev libpng-dev libjpeg-turbo-dev giflib-dev

# Copy package files and strip version to improve caching
# Version changes won't invalidate dependency cache
COPY package*.json ./
RUN apk add --no-cache jq && \
    jq 'del(.version)' package.json > package.tmp.json && \
    mv package.tmp.json package.json

# Install root dependencies
RUN npm ci

# Copy frontend source
COPY client ./client

# Install client dependencies and build
WORKDIR /app/client
RUN npm ci
RUN npx vite build
WORKDIR /app

# Build stage - Backend
FROM node:25-alpine AS backend-builder

WORKDIR /app

# Install build dependencies for canvas
RUN apk add --no-cache python3 g++ make cairo-dev pango-dev libpng-dev libjpeg-turbo-dev giflib-dev

# Copy package files and strip version to improve caching
COPY package*.json ./
COPY prisma ./prisma/
RUN apk add --no-cache jq && \
    jq 'del(.version)' package.json > package.tmp.json && \
    mv package.tmp.json package.json

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and compile TypeScript
COPY src ./src
COPY tsconfig.json ./

# Compile TypeScript
RUN npm run build:server

# Production stage
FROM node:25-alpine

WORKDIR /app

# Install openssl for Prisma, runtime libs for canvas, and fonts for poster generation
RUN apk add --no-cache openssl cairo pango libpng libjpeg-turbo giflib font-liberation font-dejavu

# Copy from builders
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/package*.json ./
COPY --from=backend-builder /app/prisma ./prisma
COPY --from=backend-builder /app/dist-server ./dist-server
COPY --from=frontend-builder /app/dist ./dist

# Copy VERSION file (separate from package.json to improve caching)
COPY VERSION ./

# Create data directory for SQLite
RUN mkdir -p /app/data

# Copy entrypoint script
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Environment
ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/collectarr.db"
ENV PORT=7795
ENV HOST=0.0.0.0

EXPOSE 7795

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:7795/health || exit 1

# Run as non-root user for security
USER node

# Auto-generates secrets if not provided
ENTRYPOINT ["/app/docker-entrypoint.sh"]
