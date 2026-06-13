#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

info() { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*"; }
error() { printf 'ERROR: %s\n' "$*"; }

run_root() {
    if [ "${EUID:-$(id -u)}" -eq 0 ]; then
        "$@"
    else
        if command -v sudo >/dev/null 2>&1; then
            sudo "$@"
        else
            error "This script needs root privileges or sudo."
            exit 1
        fi
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

install_docker_on_debian() {
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

ensure_docker() {
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        return 0
    fi

    if [ -f /etc/os-release ]; then
        . /etc/os-release
        case "${ID:-}" in
            ubuntu|debian)
                install_docker_on_debian
                ;;
            *)
                error "Automatic Docker installation is only implemented for Debian/Ubuntu systems."
                exit 1
                ;;
        esac
    else
        error "Cannot determine the operating system. Install Docker and Docker Compose manually."
        exit 1
    fi

    if ! docker compose version >/dev/null 2>&1; then
        error "Docker Compose is still not available after installation."
        exit 1
    fi
}

wait_for_backend() {
    info "Waiting for the backend to become healthy..."
    for _ in $(seq 1 60); do
        if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
            info "Backend is healthy."
            return 0
        fi
        sleep 2
    done
    error "Backend did not become healthy in time."
    exit 1
}

show_summary() {
    local local_ip=""
    local external_ip=""
    local access_ip=""

    local_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
    external_ip="${EXTERNAL_IP:-}"
    access_ip="${local_ip:-$external_ip}"

    echo ""
    echo "============================================"
    echo "  GonoPBX Installation Complete!"
    echo "============================================"
    echo ""
    echo "  Web GUI:    http://${access_ip}:3000"
    echo "  API:        http://${access_ip}:8000"
    if [ -n "${local_ip:-}" ] && [ -n "${external_ip:-}" ] && [ "$local_ip" != "$external_ip" ]; then
        echo ""
        echo "  Local network: http://${local_ip}:3000"
        echo "  External:      http://${external_ip}:3000"
        echo "                 (Port 3000 must be forwarded in your router)"
    fi
    echo ""
    printf '  Login:      admin / %s\n' "$ADMIN_PASSWORD"
    echo ""
    echo "  Credentials are saved in .env"
    echo "============================================"
}

configure_existing_installation() {
    info "Existing installation found."
    echo ""
    echo "  [1] Update      - Refresh code, keep data and passwords"
    echo "  [2] Reinstall   - Remove everything and start over"
    echo ""
    read -r -p "Choice [1]: " INSTALL_MODE
    if [ "${INSTALL_MODE:-1}" = "2" ]; then
        echo ""
        warn "All data (extensions, trunks, call history) will be removed!"
        read -r -p "Do you really want to delete everything? [y/N]: " CONFIRM_DELETE
        if [ "${CONFIRM_DELETE:-n}" != "y" ] && [ "${CONFIRM_DELETE:-n}" != "Y" ]; then
            info "Aborted."
            exit 0
        fi
        info "Stopping containers and removing data..."
        run_compose down -v >/dev/null 2>&1 || true
        rm -f .env asterisk/config/manager.conf
        info "Old installation removed."
    else
        info "Updating GonoPBX..."
        # shellcheck disable=SC1091
        . ./.env
        sed "s/%%AMI_PASSWORD%%/${AMI_PASSWORD}/" asterisk/config/manager.conf.template > asterisk/config/manager.conf
        info "manager.conf updated."
        info "Restarting containers..."
        run_compose up -d --build
        ./provision-defaults.sh
        show_summary
        return 0
    fi
}

ensure_docker
info "[OK] Docker and Docker Compose are available."

if [ -f .env ]; then
    configure_existing_installation
    if [ -f .env ]; then
        # Update path already returned after summary.
        exit 0
    fi
fi

info "Detecting external IP address..."
DETECTED_IP=$(curl -fsS --max-time 5 ifconfig.me 2>/dev/null || curl -fsS --max-time 5 icanhazip.com 2>/dev/null || true)
if [ -n "$DETECTED_IP" ]; then
    info "Detected external IP: $DETECTED_IP"
    read -r -p "Use this IP? [Y/n]: " USE_DETECTED
    if [ "${USE_DETECTED:-y}" = "n" ] || [ "${USE_DETECTED:-y}" = "N" ]; then
        read -r -p "Enter external IP: " EXTERNAL_IP
    else
        EXTERNAL_IP="$DETECTED_IP"
    fi
else
    warn "Could not detect the external IP automatically."
    read -r -p "Enter external IP: " EXTERNAL_IP
fi

info ""
info "Are you using a reverse proxy (for example Nginx) in front of GonoPBX?"
info "  [1] No  - Direct network access (recommended for home or LAN use)"
info "  [2] Yes - Access only through localhost / reverse proxy"
read -r -p "Choice [1]: " PROXY_CHOICE
if [ "${PROXY_CHOICE:-1}" = "2" ]; then
    BIND_ADDRESS="127.0.0.1"
    info "-> Bind address: 127.0.0.1 (localhost only)"
else
    BIND_ADDRESS="0.0.0.0"
    info "-> Bind address: 0.0.0.0 (network access)"
fi

info ""
info "Web interface language"
info "  [1] German"
info "  [2] English"
read -r -p "Choice [1]: " UI_LANG_CHOICE
if [ "${UI_LANG_CHOICE:-1}" = "2" ]; then
    UI_LANG="en"
else
    UI_LANG="de"
fi

info ""
info "SIP port for Asterisk (default: 5060)"
info "Change this if your router has SIP ALG enabled."
read -r -p "SIP port [5060]: " SIP_PORT
SIP_PORT="${SIP_PORT:-5060}"
info "-> SIP port: $SIP_PORT"

info ""
printf 'Set admin password (leave empty to auto-generate): '
IFS= read -r ADMIN_PASSWORD
if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d '/+=' | head -c 20)
    printf 'Generated admin password: %s\n' "$ADMIN_PASSWORD"
else
    printf 'Password set: %s\n' "$ADMIN_PASSWORD"
fi

JWT_SECRET=$(openssl rand -base64 48 | tr -d '/+=')
DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
AMI_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')

info ""
info "Home Assistant integration (optional)"
read -r -p "Generate API key for Home Assistant? [y/N]: " HA_CHOICE
if [ "${HA_CHOICE:-n}" = "y" ] || [ "${HA_CHOICE:-n}" = "Y" ]; then
    HA_API_KEY=$(openssl rand -hex 32)
    printf 'Generated HA API key: %s\n' "$HA_API_KEY"
    echo ""
    read -r -p "MQTT broker address (leave empty to skip): " MQTT_BROKER
    if [ -n "${MQTT_BROKER:-}" ]; then
        read -r -p "MQTT port [1883]: " MQTT_PORT
        MQTT_PORT="${MQTT_PORT:-1883}"
        read -r -p "MQTT user (leave empty if none): " MQTT_USER
        if [ -n "${MQTT_USER:-}" ]; then
            printf 'MQTT password: '
            IFS= read -r MQTT_PASSWORD
        fi
    fi
else
    HA_API_KEY=""
    MQTT_BROKER=""
fi

info ""
info "Generating configuration..."
cat > .env <<'ENVEOF'
# GonoPBX Configuration - generated by install.sh
ENVEOF
{
    printf 'EXTERNAL_IP=%s\n' "$EXTERNAL_IP"
    printf 'ADMIN_PASSWORD=%s\n' "$ADMIN_PASSWORD"
    printf 'JWT_SECRET=%s\n' "$JWT_SECRET"
    printf 'DB_PASSWORD=%s\n' "$DB_PASSWORD"
    printf 'AMI_PASSWORD=%s\n' "$AMI_PASSWORD"
    printf 'BIND_ADDRESS=%s\n' "$BIND_ADDRESS"
    printf 'SIP_PORT=%s\n' "$SIP_PORT"
    printf 'PROJECT_DIR=%s\n' "$PROJECT_DIR"
    printf 'UI_LANG=%s\n' "$UI_LANG"
    printf 'HA_API_KEY=%s\n' "${HA_API_KEY:-}"
    printf 'MQTT_BROKER=%s\n' "${MQTT_BROKER:-}"
    printf 'MQTT_PORT=%s\n' "${MQTT_PORT:-1883}"
    printf 'MQTT_USER=%s\n' "${MQTT_USER:-}"
    printf 'MQTT_PASSWORD=%s\n' "${MQTT_PASSWORD:-}"
} >> .env
info "[OK] .env created"

sed "s/%%AMI_PASSWORD%%/${AMI_PASSWORD}/" asterisk/config/manager.conf.template > asterisk/config/manager.conf
info "[OK] manager.conf updated"

if [ ! -f /var/lib/fail2ban/fail2ban.sqlite3 ]; then
    run_root mkdir -p /var/lib/fail2ban
    run_root touch /var/lib/fail2ban/fail2ban.sqlite3
    info "[OK] Created fail2ban database placeholder"
fi
if [ ! -S /var/run/fail2ban/fail2ban.sock ] && [ ! -e /var/run/fail2ban/fail2ban.sock ]; then
    run_root mkdir -p /var/run/fail2ban
    run_root touch /var/run/fail2ban/fail2ban.sock
    info "[OK] Created fail2ban socket placeholder"
fi

info "Starting containers..."
run_compose up -d --build
./provision-defaults.sh
show_summary
