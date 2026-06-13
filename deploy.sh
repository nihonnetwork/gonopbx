#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${BLUE}$1${NC}"; }
success() { echo -e "${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }

run_root() {
    if [ "${EUID:-$(id -u)}" -eq 0 ]; then
        "$@"
    else
        sudo "$@"
    fi
}

run_docker() {
    if docker info >/dev/null 2>&1; then
        docker "$@"
    else
        run_root docker "$@"
    fi
}

run_compose() {
    run_docker compose "$@"
}

install_docker() {
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        return 0
    fi

    info "Installing Docker and Docker Compose..."
    run_root apt-get update
    run_root apt-get install -y ca-certificates curl gnupg
    run_root install -m 0755 -d /etc/apt/keyrings
    if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | run_root gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        run_root chmod a+r /etc/apt/keyrings/docker.gpg
    fi
    if [ ! -f /etc/apt/sources.list.d/docker.list ]; then
        . /etc/os-release
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" | run_root tee /etc/apt/sources.list.d/docker.list >/dev/null
    fi
    run_root apt-get update
    run_root apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

wait_for_backend() {
    info "Waiting for backend health..."
    for _ in $(seq 1 60); do
        if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
            success "Backend is healthy."
            return 0
        fi
        sleep 2
    done
    warn "Backend is still not ready. Continuing with provisioning may fail."
    return 1
}

install_docker

info "Preparing project..."
info "Project directory: $PROJECT_DIR"

if [ -f .env ]; then
    info "Existing .env file found."
else
    warn "No .env file found. Run ./install.sh first if this is a new deployment."
fi

info "Stopping existing containers..."
run_compose down 2>/dev/null || true

info "Building images..."
run_compose build
success "Images built."

info "Starting services..."
run_compose up -d
success "Services started."

wait_for_backend
./provision-defaults.sh

SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "============================================"
echo "  GonoPBX Deployment complete"
echo "============================================"
echo ""
echo -e "  Frontend:  ${BLUE}http://$SERVER_IP:3000${NC}"
echo -e "  Backend:   ${BLUE}http://$SERVER_IP:8000${NC}"
echo -e "  API Docs:  ${BLUE}http://$SERVER_IP:8000/docs${NC}"
echo ""
echo -e "  Default extensions: ${GREEN}1000-1004${NC}"
echo -e "  Default ring groups: ${GREEN}2000-2002${NC}"
echo -e "  Default IVR: ${GREEN}3000${NC}"
echo ""
echo -e "  Logs:      ${BLUE}docker compose logs -f${NC}"
echo -e "  Stop:      ${BLUE}docker compose down${NC}"
echo -e "  Restart:   ${BLUE}docker compose restart${NC}"
echo -e "  Asterisk:  ${BLUE}docker exec -it pbx_asterisk asterisk -rvvv${NC}"
echo ""
echo -e "  Ports to open: ${YELLOW}5060/UDP+TCP, 10000-10100/UDP, 8000/TCP, 3000/TCP${NC}"
echo ""
