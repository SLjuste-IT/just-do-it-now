# Security Policy

Thank you for helping keep JUST DO IT NOW and the people who self-host it safe.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Instead, use one of these private channels:

1. **GitHub private vulnerability reporting (preferred):**
   Go to the repository's **Security** tab → **Report a vulnerability**.
   This opens a private advisory that only the maintainer can see.

2. **Email:** [support@serverkakoulabs.org](mailto:support@serverkakoulabs.org)
   Include "SECURITY" in the subject line.

### What to include

- A description of the issue and its impact
- Steps to reproduce (a proof-of-concept is welcome)
- The version/commit you tested and how it was deployed
  (hosted app, Proxmox LXC one-command install, or `quick-install.sh`)

### What to expect

- An acknowledgment within **72 hours**
- A status update within **7 days**
- Credit in the fix's release notes if you'd like it (or anonymity if you prefer)

Please give us a reasonable window to ship a fix before any public disclosure.

## Scope

In scope:

- The web app (`index.html`, service worker) and its authentication flows
  (sign-up, first-run credential setup, TOTP two-factor)
- Server-side hooks in `pb_hooks/` (custom endpoints, cron jobs)
- Database access rules shipped in `pb_migrations/`
- The installers in `proxmox/` (`install-lxc.sh`, `quick-install.sh`)

Out of scope:

- Vulnerabilities in PocketBase itself → report to
  [pocketbase/pocketbase](https://github.com/pocketbase/pocketbase/security)
- Issues that require an already-compromised server or superuser account
- Self-hosted instances exposed to the internet without HTTPS or a reverse
  proxy (deployment hardening is the operator's responsibility, but we're
  happy to improve the docs — open a regular issue for that)

## Supported versions

Only the latest commit on `main` is supported. Self-hosters can update any
time by re-running the installer or choosing **Update** in the LXC script.
