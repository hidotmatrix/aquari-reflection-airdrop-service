# ═══════════════════════════════════════════════════════════
# AQUARI Airdrop - Production Dockerfile
# ═══════════════════════════════════════════════════════════
#
# Build:
#   npm run build
#   docker build -t aquari-airdrop .
#
# Run:
#   docker run -p 3000:3000 --env-file .env.production aquari-airdrop
#
# ═══════════════════════════════════════════════════════════

FROM node:20-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files
COPY dist ./dist

# Copy EJS views (not compiled by TypeScript)
COPY src/admin/views ./dist/admin/views

# Copy public assets
COPY public ./public

# Copy scripts
COPY scripts ./scripts

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Run app
CMD ["node", "dist/index.js"]
