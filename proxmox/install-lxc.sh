#!/usr/bin/env bash
# ============================================================================
#  JUST DO IT NOW - one-command Proxmox LXC installer
# ----------------------------------------------------------------------------
#  Run this on the PROXMOX VE HOST shell (the 'root@pve:~#' prompt). It creates
#  a NEW, dedicated LXC container - with the storage wizard and its own IP -
#  and installs the app inside it, printing http://<IP>:8080/ at the end.
#  This is the full "helper script" experience (like Hermes and the others).
#
#      bash -c "$(curl -fsSL https://raw.githubusercontent.com/SLjuste-IT/just-do-it-now/main/proxmox/install-lxc.sh)"
#
#  It runs the community-scripts framework from a temporary local copy, so it
#  works TODAY - before the script is merged into community-scripts.org. Once
#  merged, the official one-liner from the website replaces this.
# ============================================================================
set -euo pipefail

REPO="${REPO:-SLjuste-IT/just-do-it-now}"   # your app repo
REF="${REF:-main}"                          # branch or tag

if ! command -v pct >/dev/null 2>&1; then
  echo "ERROR: 'pct' not found. Run this on the Proxmox VE HOST, not inside a container." >&2
  exit 1
fi

WORK="$(mktemp -d)"

echo "-> Fetching the community-scripts framework ..."
curl -fsSL "https://github.com/community-scripts/ProxmoxVED/archive/refs/heads/main.tar.gz" \
  | tar xz -C "$WORK" --strip-components=1

echo "-> Adding the JUST DO IT NOW scripts ..."
curl -fsSL "https://raw.githubusercontent.com/${REPO}/${REF}/proxmox/ct/just-do-it-now.sh" \
  -o "$WORK/ct/just-do-it-now.sh"
curl -fsSL "https://raw.githubusercontent.com/${REPO}/${REF}/proxmox/install/just-do-it-now-install.sh" \
  -o "$WORK/install/just-do-it-now-install.sh"
# The framework builds the installer's name from the app name; provide both the
# hyphenated and space-stripped forms so it always resolves to our file.
cp -f "$WORK/install/just-do-it-now-install.sh" "$WORK/install/justdoitnow-install.sh"

# Tell the framework to use this local copy (funcs + our install script)
export COMMUNITY_SCRIPTS_DIR="$WORK/misc"
export COMMUNITY_SCRIPTS_ROOT="$WORK"
# Where the container pulls the app files from
export APP_REPO="$REPO" APP_REF="$REF"

echo "-> Launching the installer (a menu will appear) ..."
cd "$WORK"
bash ct/just-do-it-now.sh
