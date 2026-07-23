#!/usr/bin/env bash

# Copyright (c) 2021-2026 community-scripts ORG
# Author: Scott Lejuste (SLjuste-IT)
# License: MIT | https://github.com/community-scripts/ProxmoxVED/raw/main/LICENSE
# Source: https://todo.serverkakoulabs.org/ | Github: https://github.com/SLjuste-IT/just-do-it-now

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

# ---------------------------------------------------------------------------
# App source. Override at test time:  APP_REPO=you/repo APP_REF=main bash ct/...
# APP_REPO must be a PUBLIC GitHub repo holding the self-host build of the app
# (frontend at the repo root, plus pb_hooks/ and pb_migrations/ folders).
# ---------------------------------------------------------------------------
APP_DIR="/opt/just-do-it-now"
APP_REPO="${APP_REPO:-SLjuste-IT/just-do-it-now}"
APP_REF="${APP_REF:-main}"

msg_info "Installing Dependencies"
$STD apt-get install -y curl tar ca-certificates
msg_ok "Installed Dependencies"

# PocketBase engine (single Go binary) -> ${APP_DIR}/pocketbase
fetch_and_deploy_gh_release "pocketbase" "pocketbase/pocketbase" "prebuild" "latest" "${APP_DIR}" "pocketbase*linux_$(arch_resolve).zip"

msg_info "Deploying JUST DO IT NOW app files (${APP_REPO}@${APP_REF})"
mkdir -p "${APP_DIR}/pb_public" "${APP_DIR}/pb_hooks" "${APP_DIR}/pb_migrations"
tmpd="$(mktemp -d)"
curl -fsSL "https://github.com/${APP_REPO}/archive/refs/heads/${APP_REF}.tar.gz" | tar xz -C "$tmpd" --strip-components=1

# Static PWA -> pb_public (PocketBase serves this at /).
cp -r "$tmpd"/. "${APP_DIR}/pb_public/"
# Cron hooks + schema migrations -> their PocketBase locations.
[ -d "$tmpd/pb_hooks" ] && cp -rf "$tmpd/pb_hooks/." "${APP_DIR}/pb_hooks/"
[ -d "$tmpd/pb_migrations" ] && cp -rf "$tmpd/pb_migrations/." "${APP_DIR}/pb_migrations/"
# Never expose server-side sources / tooling / VCS through the static server.
rm -rf \
  "${APP_DIR}/pb_public/pb_hooks" \
  "${APP_DIR}/pb_public/pb_migrations" \
  "${APP_DIR}/pb_public/proxmox" \
  "${APP_DIR}/pb_public/docs" \
  "${APP_DIR}/pb_public/.claude" \
  "${APP_DIR}/pb_public/.github" \
  "${APP_DIR}/pb_public/.git" \
  "${APP_DIR}/pb_public/_worker.js" \
  "${APP_DIR}/pb_public/.assetsignore"
rm -rf "$tmpd"
msg_ok "Deployed app files"

msg_info "Creating Service"
cat <<EOF >/etc/systemd/system/just-do-it-now.service
[Unit]
Description = JUST DO IT NOW (PocketBase)
After       = network.target

[Service]
Type             = simple
WorkingDirectory = ${APP_DIR}
Environment      = JDIN_SELFHOST=1
LimitNOFILE      = 4096
Restart          = always
RestartSec       = 5s
StandardOutput   = append:${APP_DIR}/errors.log
StandardError    = append:${APP_DIR}/errors.log
ExecStart        = ${APP_DIR}/pocketbase serve --http=0.0.0.0:8080

[Install]
WantedBy = multi-user.target
EOF
systemctl enable -q --now just-do-it-now
msg_ok "Created Service"

# ---- first-login account (random password, shown at the end) ---------------
ADMIN_EMAIL="admin@localhost.com"
CRED_FILE="${APP_DIR}/.first_login"
FIRST_URL="http://$(hostname -I 2>/dev/null | awk '{print $1}'):8080/"
if [ ! -f "$CRED_FILE" ]; then
  msg_info "Creating first-login account"
  ADMIN_PW="$(cat /proc/sys/kernel/random/uuid)"; ADMIN_PW="${ADMIN_PW//-/}"; ADMIN_PW="${ADMIN_PW:0:16}"
  for _ in $(seq 1 20); do curl -sf "http://127.0.0.1:8080/api/health" >/dev/null 2>&1 && break; sleep 1; done
  JDIN_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:8080/api/collections/users/records" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PW}\",\"passwordConfirm\":\"${ADMIN_PW}\",\"name\":\"Admin\"}" || echo 000)"
  if [ "$JDIN_CODE" = "200" ] || [ "$JDIN_CODE" = "201" ]; then
    printf '%s\n%s\n' "$ADMIN_EMAIL" "$ADMIN_PW" >"$CRED_FILE"
    chmod 600 "$CRED_FILE"
    JDIN_NEW_LOGIN=1
    msg_ok "Created first-login account"
  else
    msg_ok "Sign-up is open (first-login account skipped)"
  fi
fi

motd_ssh
customize

msg_info "Cleaning up"
$STD apt-get -y autoremove
$STD apt-get -y autoclean
msg_ok "Cleaned"

if [ "${JDIN_NEW_LOGIN:-}" = "1" ]; then
  echo ""
  echo -e " ${GN}First-login credentials (you'll be prompted to change them):${CL}"
  echo -e "   URL:      ${FIRST_URL}"
  echo -e "   Email:    ${ADMIN_EMAIL}"
  echo -e "   Password: ${ADMIN_PW}"
  echo ""
fi
