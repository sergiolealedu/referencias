#!/usr/bin/env bash
#
# Instala e inicia a aplicação Referências em um Droplet DigitalOcean (Ubuntu 22.04/24.04).
#
# Uso (como root ou com sudo):
#   curl -fsSL https://raw.githubusercontent.com/sergiolealedu/referencias/main/scripts/deploy/digitalocean-install.sh | sudo bash
#
# Ou, a partir do repositório clonado:
#   sudo bash scripts/deploy/digitalocean-install.sh
#
# Variáveis opcionais (export antes de executar):
#   APP_DIR=/opt/referencias          Diretório da aplicação
#   APP_USER=referencias              Usuário de sistema dedicado
#   GIT_REPO=...                      Repositório Git (clone fresco)
#   GIT_BRANCH=main                   Branch a implantar
#   DOMAIN=refs.exemplo.com           Domínio para Nginx (opcional; default: _)
#   PORT=3001                         Porta interna da API
#   SQLITE_DB_PATH=data/referencias.db Caminho relativo ou absoluto do SQLite
#   ALLOWED_PDF_ROOTS=/var/lib/referencias/pdfs  Raiz(es) de PDFs (; para várias)
#   INSTALL_CERTBOT=true              Solicitar certificado Let's Encrypt (requer DOMAIN)
#   CERTBOT_EMAIL=admin@exemplo.com   E-mail para Let's Encrypt
#   SKIP_APT=false                    Pular apt update/install (reexecução)
#   SKIP_CLONE=false                  Não clonar; usar APP_DIR existente
#
set -euo pipefail

# ── Configuração padrão ──────────────────────────────────────────────────────
APP_DIR="${APP_DIR:-/opt/referencias}"
APP_USER="${APP_USER:-referencias}"
GIT_REPO="${GIT_REPO:-https://github.com/sergiolealedu/referencias.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
DOMAIN="${DOMAIN:-_}"
PORT="${PORT:-3001}"
SQLITE_DB_PATH="${SQLITE_DB_PATH:-data/referencias.db}"
ALLOWED_PDF_ROOTS="${ALLOWED_PDF_ROOTS:-/var/lib/referencias/pdfs}"
INSTALL_CERTBOT="${INSTALL_CERTBOT:-false}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
SKIP_APT="${SKIP_APT:-false}"
SKIP_CLONE="${SKIP_CLONE:-false}"
NODE_MAJOR="${NODE_MAJOR:-20}"

PM2_APP_NAME="referencias-api"
NGINX_SITE="referencias"
PDF_DIR="/var/lib/referencias/pdfs"

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { printf '\033[1;34m[referencias]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[referencias]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[referencias] ERRO:\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    die "Execute como root: sudo bash $0"
  fi
}

detect_os() {
  [[ -f /etc/os-release ]] || die "Sistema não suportado (esperado Ubuntu)."
  # shellcheck source=/dev/null
  source /etc/os-release
  [[ "${ID:-}" == "ubuntu" ]] || die "Este script foi testado para Ubuntu (encontrado: ${ID:-desconhecido})."
  log "Sistema: ${PRETTY_NAME:-Ubuntu}"
}

install_system_packages() {
  if [[ "${SKIP_APT}" == "true" ]]; then
    log "SKIP_APT=true — pulando pacotes do sistema."
    return
  fi

  log "Atualizando pacotes do sistema..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq \
    ca-certificates curl git nginx ufw \
    build-essential python3 \
    >/dev/null

  if [[ ! -x /usr/bin/node ]] || ! node -v 2>/dev/null | grep -q "v${NODE_MAJOR}\."; then
    log "Instalando Node.js ${NODE_MAJOR}.x..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y -qq nodejs >/dev/null
  fi

  if ! command -v pm2 >/dev/null 2>&1; then
    log "Instalando PM2 globalmente..."
    npm install -g pm2 >/dev/null
  fi

  log "Node $(node -v) | npm $(npm -v)"
}

configure_firewall() {
  if ! command -v ufw >/dev/null 2>&1; then
    return
  fi
  if ufw status | grep -q "Status: active"; then
    log "UFW já ativo — garantindo regras HTTP/HTTPS/SSH."
  else
    log "Configurando UFW (SSH + HTTP + HTTPS)..."
    ufw --force reset >/dev/null
    ufw default deny incoming >/dev/null
    ufw default allow outgoing >/dev/null
    ufw allow OpenSSH >/dev/null
  fi
  ufw allow 'Nginx Full' >/dev/null 2>&1 || { ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; }
  ufw --force enable >/dev/null
}

ensure_app_user() {
  if id "${APP_USER}" >/dev/null 2>&1; then
    log "Usuário ${APP_USER} já existe."
  else
    log "Criando usuário ${APP_USER}..."
    useradd --system --create-home --shell /bin/bash "${APP_USER}"
  fi
}

deploy_source() {
  mkdir -p "${APP_DIR}"
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

  if [[ "${SKIP_CLONE}" == "true" ]]; then
    [[ -f "${APP_DIR}/package.json" ]] || die "SKIP_CLONE=true mas ${APP_DIR}/package.json não existe."
    log "Usando código existente em ${APP_DIR}."
    return
  fi

  if [[ -d "${APP_DIR}/.git" ]]; then
    log "Atualizando repositório em ${APP_DIR}..."
    sudo -u "${APP_USER}" git -C "${APP_DIR}" fetch origin
    sudo -u "${APP_USER}" git -C "${APP_DIR}" checkout "${GIT_BRANCH}"
    sudo -u "${APP_USER}" git -C "${APP_DIR}" pull --ff-only origin "${GIT_BRANCH}"
  else
    log "Clonando ${GIT_REPO} (branch ${GIT_BRANCH})..."
    rm -rf "${APP_DIR:?}"/*
    sudo -u "${APP_USER}" git clone --branch "${GIT_BRANCH}" --depth 1 "${GIT_REPO}" "${APP_DIR}"
  fi
}

setup_data_dirs() {
  log "Preparando diretórios de dados..."
  mkdir -p "${APP_DIR}/data" "${PDF_DIR}"
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}/data" "${PDF_DIR}"
  chmod 750 "${PDF_DIR}"
}

build_pdf_roots_json() {
  local roots_json=""
  local IFS=';'
  read -ra roots <<< "${ALLOWED_PDF_ROOTS}"
  for root in "${roots[@]}"; do
    root="$(echo "${root}" | xargs)"
    [[ -n "${root}" ]] || continue
    roots_json="${roots_json}$( [[ -n "${roots_json}" ]] && echo , )\"${root}\""
  done
  printf '[%s]' "${roots_json:-\"${PDF_DIR}\"}"
}

write_app_config() {
  local db_path="${SQLITE_DB_PATH}"
  local pdf_roots_json
  if [[ "${db_path}" != /* ]]; then
    db_path="${APP_DIR}/${db_path}"
  fi
  pdf_roots_json="$(build_pdf_roots_json)"

  log "Gravando app.config.json e .env..."
  cat >"${APP_DIR}/app.config.json" <<EOF
{
  "sqliteDbPath": "${db_path}",
  "allowedPdfRoots": ${pdf_roots_json}
}
EOF

  cat >"${APP_DIR}/.env" <<EOF
PORT=${PORT}
SQLITE_DB_PATH=${db_path}
ALLOWED_PDF_ROOTS=${ALLOWED_PDF_ROOTS}
EOF

  chown "${APP_USER}:${APP_USER}" "${APP_DIR}/app.config.json" "${APP_DIR}/.env"
  chmod 640 "${APP_DIR}/.env"
}

build_and_install_deps() {
  log "Instalando dependências e compilando..."
  sudo -u "${APP_USER}" bash -lc "
    set -euo pipefail
    cd '${APP_DIR}'
    npm ci
    npm run build
  "
}

configure_pm2_startup() {
  log "Configurando PM2 para iniciar no boot..."
  local pm2_bin
  pm2_bin="$(command -v pm2)"

  # Executado como root: PM2 grava o unit systemd do usuário da aplicação.
  if env PATH="${PATH}" "${pm2_bin}" startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}" --force >/dev/null 2>&1; then
    systemctl enable "pm2-${APP_USER}" >/dev/null 2>&1 || true
    log "PM2 startup configurado (systemd: pm2-${APP_USER})."
    return
  fi

  # Fallback: PM2 imprime uma linha "sudo env ..." para copiar e executar.
  local startup_cmd
  startup_cmd="$(
    env PATH="${PATH}" "${pm2_bin}" startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}" 2>&1 \
      | grep '^sudo env' \
      | head -1 \
      || true
  )"
  if [[ -n "${startup_cmd}" ]]; then
    bash -c "${startup_cmd}"
    log "PM2 startup configurado."
  else
    warn "Não foi possível registrar PM2 no systemd automaticamente."
    warn "Execute manualmente: sudo env PATH=\$PATH pm2 startup systemd -u ${APP_USER} --hp /home/${APP_USER}"
  fi
}

start_api_with_pm2() {
  log "Iniciando API com PM2 (porta ${PORT})..."
  sudo -u "${APP_USER}" bash -lc "
    set -euo pipefail
    cd '${APP_DIR}'
    pm2 delete '${PM2_APP_NAME}' 2>/dev/null || true
    PORT='${PORT}' pm2 start npm --name '${PM2_APP_NAME}' -- start
    pm2 save
  "

  configure_pm2_startup
}

write_nginx_config() {
  local server_name="${DOMAIN}"
  [[ "${server_name}" == "_" ]] && server_name="_"

  log "Configurando Nginx (server_name: ${server_name})..."
  cat >/etc/nginx/sites-available/${NGINX_SITE} <<EOF
# Gerado por scripts/deploy/digitalocean-install.sh
server {
    listen 80;
    listen [::]:80;
    server_name ${server_name};

    client_max_body_size 20m;

    root ${APP_DIR}/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    access_log /var/log/nginx/referencias-access.log;
    error_log  /var/log/nginx/referencias-error.log;
}
EOF

  ln -sf "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
  rm -f /etc/nginx/sites-enabled/default

  nginx -t
  systemctl enable nginx
  systemctl reload nginx
}

maybe_install_ssl() {
  if [[ "${INSTALL_CERTBOT}" != "true" ]]; then
    return
  fi
  [[ "${DOMAIN}" != "_" ]] || die "INSTALL_CERTBOT=true requer DOMAIN definido."
  [[ -n "${CERTBOT_EMAIL}" ]] || die "INSTALL_CERTBOT=true requer CERTBOT_EMAIL."

  log "Instalando Certbot e emitindo certificado para ${DOMAIN}..."
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${CERTBOT_EMAIL}" --redirect
}

health_check() {
  log "Verificando saúde da API..."
  sleep 2
  local tries=0
  until curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; do
    tries=$((tries + 1))
    [[ "${tries}" -lt 15 ]] || die "API não respondeu em http://127.0.0.1:${PORT}/api/health"
    sleep 2
  done
  log "API OK: $(curl -fsS "http://127.0.0.1:${PORT}/api/health")"
}

print_summary() {
  local public_url="http://$(curl -fsS -4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
  [[ "${DOMAIN}" != "_" ]] && public_url="http://${DOMAIN}"
  [[ "${INSTALL_CERTBOT}" == "true" && "${DOMAIN}" != "_" ]] && public_url="https://${DOMAIN}"

  cat <<EOF

══════════════════════════════════════════════════════════════
  Referências — instalação concluída
══════════════════════════════════════════════════════════════
  Aplicação : ${APP_DIR}
  Usuário   : ${APP_USER}
  API (int) : http://127.0.0.1:${PORT}/api/health
  Web       : ${public_url}

  Comandos úteis:
    sudo -u ${APP_USER} pm2 status
    sudo -u ${APP_USER} pm2 logs ${PM2_APP_NAME}
    sudo systemctl status nginx

  Atualizar após git push:
    cd ${APP_DIR} && sudo -u ${APP_USER} git pull && \\
    sudo -u ${APP_USER} npm ci && sudo -u ${APP_USER} npm run build && \\
    sudo -u ${APP_USER} pm2 restart ${PM2_APP_NAME}

  Primeiro acesso (sem dispositivos cadastrados):
    O token de convite é exibido nos logs ao iniciar a API (pm2 logs).
    Na interface, use "Obter acesso inicial" ou cole o token em Entrar com token.

  PDFs: coloque arquivos em ${PDF_DIR} (ou ajuste ALLOWED_PDF_ROOTS).
  Banco SQLite: ${APP_DIR}/data/referencias.db (criado no primeiro uso).
══════════════════════════════════════════════════════════════
EOF
}

main() {
  require_root
  detect_os
  install_system_packages
  configure_firewall
  ensure_app_user
  deploy_source
  setup_data_dirs
  write_app_config
  build_and_install_deps
  start_api_with_pm2
  write_nginx_config
  maybe_install_ssl
  health_check
  print_summary
}

main "$@"
