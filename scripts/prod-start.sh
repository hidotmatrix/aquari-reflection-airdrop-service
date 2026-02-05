#!/bin/bash

# Ensure public directory exists
mkdir -p public

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build the project (required for Dockerfile COPY dist)
echo "Building project..."
npm run build

# Start all services
echo "Starting Production Environment (Self-Hosted)..."
docker compose -f docker-compose.prod.yml --profile self-hosted up -d

echo "Services started!"
echo "Dashboard: https://redis.aquari.org/admin"
