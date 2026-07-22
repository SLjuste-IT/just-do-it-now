# JUST DO IT NOW — Proxmox VE Helper-Script (community-scripts)

Native LXC install of the app: one **PocketBase** process serves the web PWA at `/`
and its API at `/api/*` on port **8080** — no Docker, no reverse proxy, no CORS.

```
proxmox/
├─ install-lxc.sh                    # ONE-COMMAND: run on the PVE host -> creates a dedicated LXC + installs
├─ quick-install.sh                  # PORTABLE: run INSIDE an existing Debian LXC/VM/TrueNAS
├─ ct/just-do-it-now.sh              # community-scripts: creates the LXC, calls installer, updates
├─ install/just-do-it-now-install.sh # community-scripts: runs INSIDE the container (needs build.func)
└─ json/just-do-it-now.json          # community-scripts website metadata (-> frontend/public/json/)

Run **`install-lxc.sh`** on the Proxmox host for the full one-command experience
(wizard -> new LXC with its own IP -> app installed -> prints `http://<IP>:8080/`).
It runs the community-scripts framework from a temp copy, so it works before the
script is merged. This is the pre-merge stand-in for the official website one-liner.
```

Two independent distribution routes:

- **`quick-install.sh`** — a standalone installer you fully own. Works today, no
  framework, covers Proxmox LXC **and** VMs / TrueNAS / bare metal. See below.
- **`ct/` + `install/` + `json/`** — the community-scripts package, targeting
  **community-scripts/ProxmoxVED** (the dev repo). New scripts must be submitted there
  first — PRs against ProxmoxVE are closed unreviewed. Once merged you get the official
  one-liner + website listing.

---

## Portable one-liner (`quick-install.sh`)

The one-liner you control. Create a fresh **Debian 12/13** (or Ubuntu) LXC/VM, then
inside it as root:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SLjuste-IT/just-do-it-now/main/proxmox/quick-install.sh)"
```

Installs the PocketBase engine + web app + hooks + schema as the `just-do-it-now`
systemd service on port 8080. Re-run the same command any time to update. Override
defaults inline, e.g. `PORT=9000 APP_REF=v1.2.0 bash -c "$(curl -fsSL .../quick-install.sh)"`.

It does **not** create the container (that's what the community-scripts wizard does) —
you make the LXC/VM first, which is what makes it portable beyond Proxmox.

---

## Optional: two-factor login (email code)

The app already includes two-step login (password → a one-time code by email) — it's
just **off by default**, because the code is emailed and a fresh install has no mail
server. Turning it on needs **SMTP** (a Gmail app password, Brevo, SendGrid, Mailgun…).
Do this **after** the first-run credential setup, and confirm SMTP works first, or
users can't receive the code and get locked out.

Inside the container:

```bash
# 1) create an admin (superuser) once
cd /opt/just-do-it-now && ./pocketbase superuser upsert you@example.com 'a-strong-password'
# 2) temporarily reveal the hidden dashboard
systemctl set-environment SHOW_ADMIN=1 && systemctl restart just-do-it-now
```

Open `http://<IP>:8080/_/`, log in, then:
- **Settings → Mail settings** → enter your SMTP details → Save (send a test email to confirm).
- **Collections → `users` → Options** → enable **MFA** and **OTP** → Save.

Hide the dashboard again:

```bash
systemctl unset-environment SHOW_ADMIN && systemctl restart just-do-it-now
```

Every login now asks for the emailed code as a second factor.

---

## ⚠️ Prerequisites (do these before the script can work)

The installer downloads the app from a **public GitHub repo** (`APP_REPO`). It is
not published yet, so:

1. **Push this repo to a public GitHub repo**, then set `APP_REPO` in both scripts
   (search for `SLjuste-IT/just-do-it-now`). Layout the installer expects:
   frontend files at the repo root, plus `pb_hooks/` and `pb_migrations/` folders
   (already true for this repo).

2. **Make the build self-host-ready** (otherwise a fresh install is broken):
   - **Same-origin backend** — [`index.html:1961`](../index.html) hardcodes `PB_URL`
     to your VPS. Change it to `const PB_URL = window.location.origin;` so the
     installed app talks to its **own** container PocketBase, not your production one.
   - **Ship the full schema as migrations** — `pb_migrations/` currently only has
     `attachments`. A fresh PocketBase won't have your custom `users` fields
     (`appData`, MFA setting), mail templates, or any other collection. Export the
     live schema (Admin UI → *Settings → Export collections*, or
     `./pocketbase migrations collections`) and commit the generated migration
     file(s) so a new install auto-provisions on first boot.
   - **Recommended:** drop Matomo ([`index.html:714`](../index.html)) and vendor the
     jsDelivr scripts locally so the app works offline and doesn't phone home to your
     infra. Set `allowEmails: []` and a neutral `appUrl` in
     [`pb_hooks/weekly_report_core.js:33`](../pb_hooks/weekly_report_core.js).

SMTP is already clean — the hooks reuse PocketBase's built-in mailer, which each
self-hoster configures in their own admin panel (nothing hardcoded).

---

## Testing on your Proxmox host (no publish required)

Run these **on the PVE host shell** (not inside a container).

### Method A — local checkout (fastest iteration)

ProxmoxVED's `build.func` reads its funcs **and your install script** from a local
checkout when `COMMUNITY_SCRIPTS_DIR` / `COMMUNITY_SCRIPTS_ROOT` are set. Nothing is
pushed to GitHub — only the PocketBase binary and your `APP_REPO` app files are
fetched.

```bash
git clone https://github.com/community-scripts/ProxmoxVED
cd ProxmoxVED
cp /root/just-do-it-now/proxmox/ct/just-do-it-now.sh              ct/
cp /root/just-do-it-now/proxmox/install/just-do-it-now-install.sh install/
cp /root/just-do-it-now/proxmox/json/just-do-it-now.json          frontend/public/json/

export COMMUNITY_SCRIPTS_DIR="$PWD/misc"
export COMMUNITY_SCRIPTS_ROOT="$PWD"

# APP_REPO/APP_REF override where the app files come from during this test run.
APP_REPO="SLjuste-IT/just-do-it-now" APP_REF="main" bash ct/just-do-it-now.sh
```

Debugging: set `dev_mode=1` (or individual `DEV_MODE_KEEP=true`, `DEV_MODE_TRACE=true`,
`DEV_MODE_PAUSE=true`) so the container is **kept on failure** and you get a trace —
see <https://community-scripts.org/docs/contribution>.

### Method B — PVE Scripts Local

Web UI on the host that discovers and runs local/fork scripts with a live terminal.
See <https://github.com/community-scripts/ProxmoxVE-Local>. Good once the scripts are
basically working and you want a nicer run/inspect loop.

### Method C — app-only smoke test (skip the framework)

Fastest way to prove the **app** works before wrestling with the framework. Make a
Debian 13 LXC (e.g. `bash -c "$(curl -fsSL .../ct/debian.sh)"`), then inside it:

```bash
mkdir -p /opt/jdin && cd /opt/jdin
# grab the latest PocketBase linux build for your arch, unzip to ./pocketbase
curl -fsSL https://github.com/SLjuste-IT/just-do-it-now/archive/refs/heads/main.tar.gz \
  | tar xz --strip-components=1 -C pb_public
./pocketbase serve --http=0.0.0.0:8080
```

Then hit `http://<lxc-ip>:8080/` (app) and `/_/` (admin). Confirms same-origin
`PB_URL`, migrations applying, and static serving — independent of build.func.

### What to verify each run
- `http://<ip>:8080/` loads the app; sign-up/login works against the **local** PB.
- `http://<ip>:8080/_/` prompts to create the first superuser.
- `systemctl status just-do-it-now` is active; `journalctl -u just-do-it-now` / the
  container's `/opt/just-do-it-now/errors.log` show the hooks registering.
- Server-side paths are NOT web-exposed: `http://<ip>:8080/pb_migrations/` → 404.
- Re-run `bash ct/just-do-it-now.sh` and pick **Update** to test `update_script`.

---

## Submitting to community-scripts.org

1. Fork **community-scripts/ProxmoxVED**, branch e.g. `add/just-do-it-now`.
2. Add the three files (`ct/`, `install/`, `frontend/public/json/`).
3. `shellcheck` both scripts; follow <https://community-scripts.org/docs/contribution>
   (one service per script, quote all vars, no hardcoded secrets).
4. Confirm `categories` in the JSON against a current similar app (the `12` here is a
   placeholder) and fill in the author fields.
5. Open the PR against **ProxmoxVED**. After it's validated there it graduates to
   ProxmoxVE and appears on the site.

## Notes / decisions baked in
- **Slug/name:** `just-do-it-now` / "JUST DO IT NOW". Rename by search-replace if you
  prefer something shorter (e.g. `jdin`).
- **Resources:** 1 vCPU / 512 MB / 4 GB disk, Debian 13, unprivileged, arm64 allowed —
  matches the upstream PocketBase script; bump disk if you expect many attachments.
- **Updates** pull the app from a **branch** (`APP_REF=main`). For releaseable,
  pinnable updates, cut Git tags and switch the fetch to
  `.../archive/refs/tags/<tag>.tar.gz`.
