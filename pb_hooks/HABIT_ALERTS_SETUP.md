# Habit "starting soon" reminder emails — setup

`habit_alerts.pb.js` + `habit_alerts_core.js` form a **PocketBase hook**, not part of
the website. Every minute it checks each user's habits (from the `appData` blob) and
emails **15 minutes before** a habit's alert time — e.g. a habit set for 8:00 PM mails
at 7:45 PM. Habits due at the same minute are batched into one email, and a habit
already checked off for the day sends no reminder.

## Install
Same as the weekly report: copy both files into `<your-pocketbase-dir>/pb_hooks/` and
restart PocketBase. On boot the log prints `[habitAlerts] registered job 'jdinHabitAlerts'`.

## Configure
Edit the `CONFIG` block at the top of `habit_alerts_core.js`:

| Key | Default | Meaning |
|-----|---------|---------|
| `leadMinutes` | `15` | How many minutes before `alertTime` the email goes out. |
| `onlyVerified` | `true` | Only email accounts with `verified == true`. |
| `allowEmails` | `[]` | `[]` = every eligible user; or `["you@example.com"]` to restrict. |
| `skipIfDoneToday` | `true` | Habit already checked off today → stay silent. |
| `tz` | US Eastern | `{ stdOffsetHours: -5, dstOffsetHours: -4, useUSDstRule: true }`. The server runs UTC and PocketBase's JS runtime has no `Intl`, so the user's wall clock is derived from this rule (EST/EDT switch on the 2nd Sunday of March / 1st Sunday of November). |

The in-app **Settings → Reminders → Emails** toggle is honored: turning it off
(`appData.emailReminders === false`) silences these reminders without a redeploy.

## Test it now
1. In the app, set one habit's alert time ~20 minutes ahead.
2. In `CONFIG`, set `testMode: true` (restricts recipients to `testEmail` and logs each
   minute's evaluation), restart PocketBase.
3. The email should arrive exactly `leadMinutes` before the alert time. Then set
   `testMode: false` and restart.

## Notes
- Matching is exact-to-the-minute against an every-minute cron, so each habit reminds
  once per day with **no stored state**. If PocketBase happens to be down during that
  exact minute, that day's reminder is skipped.
- An alert time within 15 minutes after midnight wraps correctly: the reminder goes out
  the evening before, and "done today" refers to the alert's day.
- `dueHabits`/`tzOffsetHours`/`renderAlertHTML` are PocketBase-independent and
  unit-testable under Node, same as the weekly report core.
