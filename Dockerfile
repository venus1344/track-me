# Multi-stage build for kanban app
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/

# Install dependencies
RUN npm ci

# Copy source code
COPY client client
COPY server server

# Build frontend and backend
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/

RUN npm ci --production

# Copy built artifacts from builder
COPY --from=builder /app/client/dist client/dist
COPY --from=builder /app/server/dist server/dist
COPY server/src/db server/src/db

# Expose port
EXPOSE 3001

# Run server
CMD ["node", "server/dist/index.js"]
