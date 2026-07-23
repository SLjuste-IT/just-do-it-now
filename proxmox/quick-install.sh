#!/usr/bin/env bash
# ============================================================================
#  JUST DO IT NOW - portable one-line installer
# ----------------------------------------------------------------------------
#  Installs the app (PocketBase engine + web PWA + cron hooks + schema) as a
#  systemd service on ANY Debian/Ubuntu box: a Proxmox LXC, a VM, a TrueNAS
#  jail/VM, or bare metal. One PocketBase process serves the app at / and the
#  API at /api/* on port 8080 - no Docker, no reverse proxy, no CORS.
#
#  Run it INSIDE a fresh Debian 12/13 (or Ubuntu) container/VM, as root:
#
#      bash -c "$(curl -fsSL https://raw.githubusercontent.com/SLjuste-IT/just-do-it-now/main/proxmox/quick-install.sh)"
#
#  Re-run any time to update to the latest PocketBase + app files.
#
#  Override defaults with env vars, e.g.:
#      PORT=9000 APP_REF=v1.2.0 bash -c "$(curl -fsSL .../quick-install.sh)"
# ============================================================================
set -euo pipefail

# ---- config (env-overridable) ---------------------------------------------
APP_REPO="${APP_REPO:-SLjuste-IT/just-do-it-now}"   # public GitHub repo with the self-host build
APP_REF="${APP_REF:-main}"                             # branch or tag to deploy
INSTALL_DIR="${INSTALL_DIR:-/opt/just-do-it-now}"
SERVICE="${SERVICE:-just-do-it-now}"
RUN_USER="${RUN_USER:-just-do-it-now}"
PORT="${PORT:-8080}"

# ---- pretty logging --------------------------------------------------------
BL='\033[36m'; GN='\033[1;92m'; RD='\033[01;31m'; CL='\033[m'
msg()  { echo -e " ${BL}*${CL} $1"; }
ok()   { echo -e " ${GN}+${CL} $1"; }
die()  { echo -e " ${RD}x ERROR:${CL} $1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root (sudo)."
command -v systemctl >/dev/null 2>&1 || die "systemd is required (run inside a normal Debian/Ubuntu container or VM)."

# ---- architecture ----------------------------------------------------------
case "$(uname -m)" in
  x86_64 | amd64) ARCH="amd64" ;;
  aarch64 | arm64) ARCH="arm64" ;;
  *) die "Unsupported architecture: $(uname -m)" ;;
esac

# ---- dependencies ----------------------------------------------------------
msg "Installing dependencies"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl tar unzip ca-certificates >/dev/null
ok "Dependencies installed"

# ---- stop existing service (so this doubles as an updater) -----------------
if systemctl list-unit-files | grep -q "^${SERVICE}.service"; then
  msg "Stopping existing ${SERVICE} service"
  systemctl stop "$SERVICE" || true
fi

# ---- PocketBase engine (latest release) ------------------------------------
msg "Resolving latest PocketBase release"
PB_VERSION="$(curl -fsSL https://api.github.com/repos/pocketbase/pocketbase/releases/latest \
  | grep -oE '"tag_name":[[:space:]]*"v[0-9]+\.[0-9]+\.[0-9]+"' \
  | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
[ -n "$PB_VERSION" ] || die "Could not determine the latest PocketBase version."
PB_ZIP="pocketbase_${PB_VERSION}_linux_${ARCH}.zip"

msg "Downloading PocketBase ${PB_VERSION} (${ARCH})"
mkdir -p "$INSTALL_DIR"
tmpzip="$(mktemp)"
curl -fsSL -o "$tmpzip" "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${PB_ZIP}"
unzip -o -q "$tmpzip" -d "$INSTALL_DIR" pocketbase
rm -f "$tmpzip"
chmod +x "$INSTALL_DIR/pocketbase"
ok "PocketBase ${PB_VERSION} installed"

# ---- app files (frontend + hooks + migrations) -----------------------------
msg "Deploying app files from ${APP_REPO}@${APP_REF}"
install -d "$INSTALL_DIR/pb_public" "$INSTALL_DIR/pb_hooks" "$INSTALL_DIR/pb_migrations"
tmpd="$(mktemp -d)"
curl -fsSL "https://github.com/${APP_REPO}/archive/refs/heads/${APP_REF}.tar.gz" \
  | tar xz -C "$tmpd" --strip-components=1 \
  || die "Failed to download app files. Is ${APP_REPO} public and does ${APP_REF} exist?"

# Fresh copy of the static site; leave pb_data (the database) untouched.
rm -rf "${INSTALL_DIR:?}/pb_public"
mkdir -p "$INSTALL_DIR/pb_public"
cp -r "$tmpd"/. "$INSTALL_DIR/pb_public/"
[ -d "$tmpd/pb_hooks" ] && cp -rf "$tmpd/pb_hooks/." "$INSTALL_DIR/pb_hooks/"
[ -d "$tmpd/pb_migrations" ] && cp -rf "$tmpd/pb_migrations/." "$INSTALL_DIR/pb_migrations/"
# Never expose server-side sources / tooling / VCS through the static server.
rm -rf \
  "$INSTALL_DIR/pb_public/pb_hooks" \
  "$INSTALL_DIR/pb_public/pb_migrations" \
  "$INSTALL_DIR/pb_public/proxmox" \
  "$INSTALL_DIR/pb_public/docs" \
  "$INSTALL_DIR/pb_public/.claude" \
  "$INSTALL_DIR/pb_public/.github" \
  "$INSTALL_DIR/pb_public/.git" \
  "$INSTALL_DIR/pb_public/_worker.js" \
  "$INSTALL_DIR/pb_public/.assetsignore"
rm -rf "$tmpd"
ok "App files deployed"

# ---- service account + permissions ----------------------------------------
if ! id -u "$RUN_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$RUN_USER"
fi
chown -R "$RUN_USER:$RUN_USER" "$INSTALL_DIR"

# ---- systemd service -------------------------------------------------------
msg "Creating systemd service"
cat >"/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=JUST DO IT NOW (PocketBase)
After=network.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_USER}
WorkingDirectory=${INSTALL_DIR}
Environment=JDIN_SELFHOST=1
LimitNOFILE=4096
Restart=always
RestartSec=5s
StandardOutput=append:${INSTALL_DIR}/errors.log
StandardError=append:${INSTALL_DIR}/errors.log
ExecStart=${INSTALL_DIR}/pocketbase serve --http=0.0.0.0:${PORT}

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable -q --now "$SERVICE"
ok "Service ${SERVICE} is running"

# ---- first-login account (random password) ---------------------------------
ADMIN_EMAIL="admin@localhost.com"
CRED_FILE="${INSTALL_DIR}/.first_login"
if [ ! -f "$CRED_FILE" ]; then
  msg "Creating first-login account"
  ADMIN_PW="$(cat /proc/sys/kernel/random/uuid)"; ADMIN_PW="${ADMIN_PW//-/}"; ADMIN_PW="${ADMIN_PW:0:16}"
  for _ in $(seq 1 20); do curl -sf "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && break; sleep 1; done
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PORT}/api/collections/users/records" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PW}\",\"passwordConfirm\":\"${ADMIN_PW}\",\"name\":\"Admin\"}" || echo 000)"
  if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
    printf '%s\n%s\n' "$ADMIN_EMAIL" "$ADMIN_PW" >"$CRED_FILE"
    chmod 600 "$CRED_FILE"
    JDIN_NEW_LOGIN=1
    ok "First-login account created"
  else
    ok "Sign-up is open (first-login account skipped)"
  fi
fi

# ---- done ------------------------------------------------------------------
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$IP" ] || IP="<this-host-ip>"
echo
ok "JUST DO IT NOW is installed."
echo -e "   ${GN}Open the app:${CL}  http://${IP}:${PORT}/"
if [ "${JDIN_NEW_LOGIN:-}" = "1" ]; then
  echo -e "   ${GN}First login:${CL}   ${ADMIN_EMAIL}"
  echo -e "   ${GN}Password:${CL}      ${ADMIN_PW}"
  echo -e "   ${BL}You'll be asked to set your own email + password.${CL}"
fi
echo -e "   ${BL}Update later:${CL}  re-run this same command."
