#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVED/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG
# Author: Scott Lejuste (SLjuste-IT)
# License: MIT | https://github.com/community-scripts/ProxmoxVED/raw/main/LICENSE
# Source: https://todo.serverkakoulabs.org/ | Github: https://github.com/SLjuste-IT/just-do-it-now

APP="JUST DO IT NOW"
var_tags="${var_tags:-todo;productivity;pocketbase}"
var_cpu="${var_cpu:-1}"
var_ram="${var_ram:-512}"
var_disk="${var_disk:-3}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_arm64="${var_arm64:-yes}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources
  if [[ ! -f /etc/systemd/system/just-do-it-now.service || ! -x /opt/just-do-it-now/pocketbase ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi

  APP_DIR="/opt/just-do-it-now"
  APP_REPO="${APP_REPO:-SLjuste-IT/just-do-it-now}"
  APP_REF="${APP_REF:-main}"

  msg_info "Stopping Service"
  systemctl stop just-do-it-now
  msg_ok "Stopped Service"

  msg_info "Updating PocketBase engine"
  "${APP_DIR}/pocketbase" update >/dev/null 2>&1 || true
  msg_ok "Updated PocketBase engine"

  msg_info "Updating ${APP} app files (${APP_REPO}@${APP_REF})"
  tmpd="$(mktemp -d)"
  if curl -fsSL "https://github.com/${APP_REPO}/archive/refs/heads/${APP_REF}.tar.gz" | tar xz -C "$tmpd" --strip-components=1; then
    rm -rf "${APP_DIR}/pb_public"
    mkdir -p "${APP_DIR}/pb_public"
    cp -r "$tmpd"/. "${APP_DIR}/pb_public/"
    [ -d "$tmpd/pb_hooks" ] && cp -rf "$tmpd/pb_hooks/." "${APP_DIR}/pb_hooks/"
    [ -d "$tmpd/pb_migrations" ] && cp -rf "$tmpd/pb_migrations/." "${APP_DIR}/pb_migrations/"
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
    msg_ok "Updated ${APP} app files"
  else
    msg_error "Failed to download app files from ${APP_REPO}@${APP_REF}"
  fi
  rm -rf "$tmpd"

  msg_info "Starting Service"
  systemctl start just-do-it-now
  msg_ok "Started Service"
  msg_ok "Updated successfully!"
  exit
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW}Open the app:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:8080/${CL}"
echo -e "${INFO}${YW}Create the admin account (first run) and set SMTP:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:8080/_/${CL}"
echo -e "${INFO}${YW}Sign-up / login codes require SMTP (admin -> Settings -> Mail).${CL}"
