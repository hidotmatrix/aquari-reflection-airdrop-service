#!/bin/bash

# Rebuild application after code changes
echo "Rebuilding Application..."

# 1. Build TypeScript locally to ensure dist/ is fresh
echo "Compiling TypeScript..."
npm run build

# 2. Rebuild Docker image
echo "Building Docker Image..."
docker compose -f docker-compose.prod.yml build

# 3. Restart ONLY the app container (keeps DBs running)
echo "Restarting App Container..."
docker compose -f docker-compose.prod.yml --profile self-hosted up -d app

echo "Update Complete!"
