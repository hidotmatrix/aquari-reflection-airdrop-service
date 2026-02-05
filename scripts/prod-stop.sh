#!/bin/bash

# Stop all services
echo "Stopping Production Environment..."
docker compose -f docker-compose.prod.yml --profile self-hosted down

echo "Services stopped."
