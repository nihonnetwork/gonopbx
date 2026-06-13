#!/bin/bash
set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_header() {
    echo -e "\n${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}\n"
}

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

check_root() {
    if [ "${EUID:-$(id -u)}" -eq 0 ]; then
        print_warning "Do not run this script as root."
        exit 1
    fi
}

install_docker() {
    print_info "Checking Docker installation..."
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        print_success "Docker and Docker Compose are available."
        return 0
    fi

    print_warning "Docker or Docker Compose is missing. Installing..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    print_success "Docker installed."
}

configure_firewall() {
    print_info "Configuring firewall rules..."
    if command -v ufw >/dev/null 2>&1; then
        if sudo ufw status | grep -q "Status: active"; then
            sudo ufw allow 5060/udp comment "PBX SIP" 2>/dev/null || true
            sudo ufw allow 5060/tcp comment "PBX SIP TCP" 2>/dev/null || true
            sudo ufw allow 10000:10100/udp comment "PBX RTP" 2>/dev/null || true
            sudo ufw allow 8000/tcp comment "PBX Backend API" 2>/dev/null || true
            sudo ufw allow 3000/tcp comment "PBX Frontend" 2>/dev/null || true
            print_success "UFW rules added."
        else
            print_warning "UFW is installed, but it is not active."
        fi
    else
        print_warning "UFW not found. Configure your firewall manually."
    fi
}

main() {
    print_header "GonoPBX Setup"
    check_root
    install_docker

    print_header "Project Directory"
    PROJECT_DIR="$HOME/gonopbx"
    if [ -d "$PROJECT_DIR" ]; then
        print_warning "Project directory already exists: $PROJECT_DIR"
        read -r -p "Overwrite it? (y/N) " -n 1 REPLY
        echo
        if [[ ! ${REPLY:-} =~ ^[Yy]$ ]]; then
            print_info "Setup aborted."
            exit 0
        fi
        rm -rf "$PROJECT_DIR"
    fi

    print_info "Creating project directory: $PROJECT_DIR"
    mkdir -p "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    print_success "Project directory created."

    print_header "Build Images"
    print_info "Running docker compose build..."
    docker compose build
    print_success "Docker images built."

    print_header "Start Services"
    print_info "Starting containers..."
    docker compose up -d
    print_success "Services started."

    print_header "Wait for Readiness"
    print_info "Waiting 10 seconds for initialization..."
    sleep 10
    print_info "Checking service status..."
    docker compose ps

    print_header "Firewall"
    configure_firewall

    print_header "Setup Complete"
    print_success "GonoPBX is ready."
    echo ""
    echo -e "${GREEN}GUI access:${NC}"
    echo -e "  Frontend: ${BLUE}http://$(hostname -I | awk '{print $1}'):3000${NC}"
    echo -e "  Backend:  ${BLUE}http://$(hostname -I | awk '{print $1}'):8000${NC}"
    echo -e "  API Docs: ${BLUE}http://$(hostname -I | awk '{print $1}'):8000/docs${NC}"
    echo ""
    echo -e "${GREEN}Test credentials:${NC}"
    echo -e "  Extensions: ${YELLOW}1000 / test1000${NC} and ${YELLOW}1001 / test1001${NC}"
    echo -e "  Echo test: ${YELLOW}*43${NC}"
    echo -e "  Playback test: ${YELLOW}*44${NC}"
    echo ""
    echo -e "${GREEN}Docker commands:${NC}"
    echo -e "  Logs: ${BLUE}docker compose logs -f${NC}"
    echo -e "  Stop: ${BLUE}docker compose down${NC}"
    echo -e "  Restart: ${BLUE}docker compose restart${NC}"
    echo -e "  Asterisk CLI: ${BLUE}docker exec -it pbx_asterisk asterisk -rvvv${NC}"
    echo ""
    echo -e "${YELLOW}Note:${NC} Make sure the ports are open in your firewall:"
    echo -e "  - 5060/UDP (SIP)"
    echo -e "  - 10000-10100/UDP (RTP)"
    echo -e "  - 8000/TCP (Backend)"
    echo -e "  - 3000/TCP (Frontend)"
}

main
