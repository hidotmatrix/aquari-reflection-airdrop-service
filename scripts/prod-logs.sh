#!/bin/bash

# View logs
if [ "$1" == "app" ]; then
    echo "Showing App logs..."
    docker compose -f docker-compose.prod.yml --profile self-hosted logs -f app
else
    echo "Showing All logs (App, Mongo, Redis)... (Pass 'app' argument to see only app logs)"
    docker compose -f docker-compose.prod.yml --profile self-hosted logs -f
fi
