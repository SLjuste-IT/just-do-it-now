# Weekly "week in review" email — setup

`weekly_report.pb.js` is a **PocketBase hook**, not part of the website. It runs on
your PocketBase server every Sunday morning, reads each user's `appData`, builds a
"last week" report (tasks completed, project progress, habit check-ins/streaks) and
emails it using the SMTP you already configured for password-reset mail.

It covers the **previous 7 days** (run on Sunday → the Sun–Sat week that just ended).

## Requirements
- PocketBase **v0.22+** (modern JSVM API: `cronAdd`, `MailerMessage`, `$app.newMailClient`).
- Working SMTP in PocketBase (Settings → Mail settings). Send a test mail there first —
  if password resets work, this will too.

## Install
1. Copy the `pb_hooks/` folder next to your PocketBase executable, so the file lives at:
   ```
   <your-pocketbase-dir>/pb_hooks/weekly_report.pb.js
   ```
2. Restart PocketBase. On boot it logs nothing unless the job runs; check the logs on
   Sunday (or use Test mode below).

> This folder belongs on the **PocketBase server**, not in the website deploy. It holds
> no secrets, but if you publish the site with `npx wrangler deploy` from this directory,
> consider excluding `pb_hooks/` so server code isn't downloadable from the web root.

## Configure
Edit the `CONFIG` block at the top of `weekly_report_core.js` (the `.pb.js` entrypoint reads it from there):

| Key | Default | Meaning |
|-----|---------|---------|
| `cron` | `"0 12 * * 0"` | When to send. `min hour dom mon dow`, **server local time (UTC on this host)**. `0 12 * * 0` = 12:00 UTC Sun = **08:00 EDT** for the US-Eastern user. Change the hour to retarget. |
| `onlyVerified` | `true` | Only email accounts with `verified == true`. |
| `allowEmails` | `[]` | `[]` = every eligible user. Set to `["you@example.com"]` to send only to yourself. |
| `skipEmptyWeeks` | `true` | Don't email if you completed 0 tasks **and** logged 0 habits that week. |
| `appUrl` / `accent` / `brandName` | … | Branding used in the email. |

> **Timezone:** PocketBase cron uses the server's local time. If your server runs UTC and
> you want 8 AM your time, set the hour accordingly (e.g. UTC server, US-Eastern user →
> `0 12 * * 0`).

## Test it now (don't wait for Sunday)
1. In `CONFIG`, set:
   ```js
   testMode: true,
   testEmail: "you@example.com",
   ```
2. Restart PocketBase. With `testMode` on, the job runs **every minute**, only to
   `testEmail`, and ignores `skipEmptyWeeks` — so you get a mail within ~60s even on a
   quiet week.
3. Confirm the email looks right, then set `testMode: false` and restart again.

## Notes / tweaks
- **PDF:** the email body *is* the printable report — open it in your mail app and use
  Print → "Save as PDF" to keep a copy. (PocketBase's JS runtime can't render PDFs
  server-side, so a true PDF attachment isn't included.)
- The report logic (`computeWeekly`, `renderReportHTML`) is plain JS with no PocketBase
  dependencies, so it's easy to unit-test under Node or reuse for an in-app "Download
  report" button later if you want one.
- If your PocketBase is **older than v0.22**, the mailer/query API names differ
  (`$app.dao()`, `$mailClient`, etc.) — upgrading is the simplest path.
