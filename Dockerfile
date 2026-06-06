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

# Copy package files and built node_modules from builder
# (npm workspaces hoists client deps to root node_modules — no client/node_modules dir)
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/server/node_modules server/node_modules

# Copy built artifacts from builder
COPY --from=builder /app/client/dist client/dist
COPY --from=builder /app/server/dist server/dist

# Copy schema and migration files (not compiled, needed at runtime)
COPY server/src/db/schema.sql server/dist/db/
COPY server/src/db/migrations server/dist/db/migrations

# Expose port
EXPOSE 3001

# Run server
CMD ["node", "server/dist/index.js"]
