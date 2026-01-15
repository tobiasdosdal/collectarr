# Build stage - Frontend
FROM node:25-alpine AS frontend-builder

WORKDIR /app

# Copy root package.json (contains all dependencies)
COPY package*.json ./

# Install all dependencies (including frontend)
RUN npm ci

# Copy frontend source
COPY client ./client

# Build frontend (from client directory, using npx to find vite in parent node_modules)
WORKDIR /app/client
RUN npx vite build
WORKDIR /app

# Build stage - Backend
FROM node:25-alpine AS backend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

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

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Copy from builders
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/package*.json ./
COPY --from=backend-builder /app/prisma ./prisma
COPY --from=backend-builder /app/dist ./dist
COPY --from=frontend-builder /app/dist ./dist

# Create data directory for SQLite
RUN mkdir -p /app/data

# Copy entrypoint script
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Environment
ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/collectarr.db"
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Auto-generates secrets if not provided
ENTRYPOINT ["/app/docker-entrypoint.sh"]
