#!/bin/bash
#
# Log Management Helper Script
# Provides easy access to container logs with various filters
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

COMPOSE_FILE="docker-compose.prod.yml"

# Display usage
usage() {
    echo -e "${BLUE}Container Log Management${NC}"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  tail [container]     - Follow live logs (default: all containers)"
    echo "  show [container]     - Show recent logs (last 100 lines)"
    echo "  search <term>        - Search logs for a term"
    echo "  errors [container]   - Show only error messages"
    echo "  export [container]   - Export logs to file"
    echo "  size                 - Show log disk usage"
    echo "  clean                - Clean up old logs (with confirmation)"
    echo ""
    echo "Containers: app, mongodb, redis, all (default)"
    echo ""
    echo "Examples:"
    echo "  $0 tail app              # Follow app logs"
    echo "  $0 show mongodb          # Show last 100 MongoDB logs"
    echo "  $0 search \"snapshot\"     # Search for 'snapshot' in all logs"
    echo "  $0 errors                # Show errors from all containers"
    echo "  $0 export app            # Export app logs to file"
    echo ""
}

# Get container name
get_container_name() {
    case "$1" in
        app) echo "aquari-airdrop" ;;
        mongodb) echo "aquari-mongodb-prod" ;;
        redis) echo "aquari-redis-prod" ;;
        all|"") echo "" ;;
        *) echo "Unknown container: $1" >&2; exit 1 ;;
    esac
}

# Follow live logs
tail_logs() {
    local container=$(get_container_name "$1")
    
    echo -e "${GREEN}Following live logs...${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo ""
    
    if [ -z "$container" ]; then
        docker compose -f "$COMPOSE_FILE" logs -f
    else
        docker logs -f "$container"
    fi
}

# Show recent logs
show_logs() {
    local container=$(get_container_name "$1")
    local lines="${2:-100}"
    
    echo -e "${GREEN}Showing last $lines lines...${NC}"
    echo ""
    
    if [ -z "$container" ]; then
        docker compose -f "$COMPOSE_FILE" logs --tail "$lines"
    else
        docker logs --tail "$lines" "$container"
    fi
}

# Search logs
search_logs() {
    local term="$1"
    local container=$(get_container_name "$2")
    
    if [ -z "$term" ]; then
        echo -e "${RED}Error: Search term required${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Searching for: ${YELLOW}$term${NC}"
    echo ""
    
    if [ -z "$container" ]; then
        for c in aquari-airdrop aquari-mongodb-prod aquari-redis-prod; do
            if docker ps --format '{{.Names}}' | grep -q "^$c$"; then
                echo -e "${BLUE}=== $c ===${NC}"
                docker logs "$c" 2>&1 | grep -i "$term" || echo "No matches"
                echo ""
            fi
        done
    else
        docker logs "$container" 2>&1 | grep -i "$term"
    fi
}

# Show errors only
show_errors() {
    local container=$(get_container_name "$1")
    
    echo -e "${RED}Showing errors...${NC}"
    echo ""
    
    if [ -z "$container" ]; then
        for c in aquari-airdrop aquari-mongodb-prod aquari-redis-prod; do
            if docker ps --format '{{.Names}}' | grep -q "^$c$"; then
                echo -e "${BLUE}=== $c ===${NC}"
                docker logs "$c" 2>&1 | grep -iE "error|exception|failed|fatal" || echo "No errors found"
                echo ""
            fi
        done
    else
        docker logs "$container" 2>&1 | grep -iE "error|exception|failed|fatal"
    fi
}

# Export logs
export_logs() {
    local container=$(get_container_name "$1")
    local timestamp=$(date +%Y%m%d-%H%M%S)
    
    if [ -z "$container" ]; then
        echo -e "${RED}Error: Container name required for export${NC}"
        echo "Usage: $0 export [app|mongodb|redis]"
        exit 1
    fi
    
    local filename="logs-${container}-${timestamp}.log"
    
    echo -e "${GREEN}Exporting logs to: ${YELLOW}$filename${NC}"
    docker logs "$container" > "$filename" 2>&1
    
    echo -e "${GREEN}✓ Exported $(wc -l < "$filename") lines${NC}"
    echo -e "File size: $(du -h "$filename" | cut -f1)"
}

# Show disk usage
show_size() {
    echo -e "${BLUE}Docker Disk Usage:${NC}"
    echo ""
    docker system df
    echo ""
    
    echo -e "${BLUE}Container Log Sizes:${NC}"
    echo ""
    
    for c in aquari-airdrop aquari-mongodb-prod aquari-redis-prod; do
        if docker ps -a --format '{{.Names}}' | grep -q "^$c$"; then
            local logpath=$(docker inspect --format='{{.LogPath}}' "$c" 2>/dev/null)
            if [ -n "$logpath" ] && [ -f "$logpath" ]; then
                local size=$(du -h "$logpath" | cut -f1)
                echo -e "  $c: ${YELLOW}$size${NC}"
            fi
        fi
    done
}

# Clean logs
clean_logs() {
    echo -e "${RED}WARNING: This will restart containers and clear their logs${NC}"
    echo -e "${YELLOW}This action cannot be undone${NC}"
    echo ""
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        echo "Cancelled."
        exit 0
    fi
    
    echo ""
    echo -e "${GREEN}Restarting containers...${NC}"
    docker compose -f "$COMPOSE_FILE" restart
    
    echo -e "${GREEN}✓ Containers restarted with fresh logs${NC}"
}

# Main command handler
case "${1:-}" in
    tail)
        tail_logs "$2"
        ;;
    show)
        show_logs "$2" "$3"
        ;;
    search)
        search_logs "$2" "$3"
        ;;
    errors)
        show_errors "$2"
        ;;
    export)
        export_logs "$2"
        ;;
    size)
        show_size
        ;;
    clean)
        clean_logs
        ;;
    help|--help|-h|"")
        usage
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        usage
        exit 1
        ;;
esac
