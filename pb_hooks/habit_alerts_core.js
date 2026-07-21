/// <reference path="../pb_data/types.d.ts" />
/**
 * habit_alerts_core.js — "habit starts soon" reminder emailer
 * ----------------------------------------------------------------------------
 * A PocketBase pb_hooks job that emails the user CONFIG.leadMinutes before each
 * habit's alertTime — e.g. a habit set for 8:00 PM mails at 7:45 PM. Habits due
 * at the same minute are batched into a single email. A habit already checked
 * off for that day sends no reminder. It reuses the SMTP that PocketBase
 * already uses for password-reset / verification mail.
 *
 * Data source: the `appData` JSON field on the `users` collection, shaped
 * { habits: [{ title, color, alertTime: "HH:MM", history: ["YYYY-MM-DD"] }] }.
 * The in-app "Emails" reminder toggle is honored (appData.emailReminders).
 *
 * Timezone: cron and the JSVM run on the SERVER clock (UTC on this host) and
 * goja has no Intl, so the user's wall clock is derived from a built-in
 * US-Eastern rule (UTC-5, UTC-4 between the 2nd Sunday of March and the 1st
 * Sunday of November). Adjust CONFIG.tz to relocate.
 *
 * Testing: set a habit's alert time ~20 minutes ahead in the app, flip
 * testMode on, restart PocketBase, and watch the logs — the reminder should
 * fire (to testEmail only) exactly leadMinutes before it. Turn testMode off
 * once confirmed.
 *
 * The schedule is registered by the thin entrypoint habit_alerts.pb.js, which
 * require()s this module *inside* the handler (PocketBase cron callbacks run in
 * an isolated context — same pattern as weekly_report_core.js).
 * ============================================================================ */

// ============================ CONFIG ========================================
var CONFIG = {
  leadMinutes: 15,        // email this many minutes before the habit's alertTime

  onlyVerified: true,     // only email users whose account is verified
  allowEmails: ["lejuste.s09@gmail.com"], // [] = every eligible user
  skipIfDoneToday: true,  // habit already checked off today → no reminder

  brandName: "JUST DO IT NOW",
  appUrl: "https://todo.serverkakoulabs.org/",
  accent: "#8c3a3a",      // Parchment & Ink accent, matches the app

  // User's UTC offset. US Eastern: -5 standard, -4 during US daylight saving.
  tz: { stdOffsetHours: -5, dstOffsetHours: -4, useUSDstRule: true },

  // ---- Testing: restrict recipients to testEmail and log every evaluation.
  testMode: false,
  testEmail: "lejuste.s09@gmail.com",
};

// ============================ time helpers ==================================
// All "local" Dates below are UTC-shifted (server UTC + user offset), so they
// must be read with getUTC* — that is the wall clock the user sees.
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function ymdUTC(d) { return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()); }

// The Nth Sunday of a month, at a fixed UTC hour (for US DST boundaries).
function nthSundayUTC(year, monthIdx, nth, hourUTC) {
  var first = new Date(Date.UTC(year, monthIdx, 1));
  var day = 1 + ((7 - first.getUTCDay()) % 7) + (nth - 1) * 7;
  return new Date(Date.UTC(year, monthIdx, day, hourUTC, 0, 0));
}

function tzOffsetHours(utcNow) {
  var tz = CONFIG.tz;
  if (!tz.useUSDstRule) return tz.stdOffsetHours;
  var y = utcNow.getUTCFullYear();
  var dstStart = nthSundayUTC(y, 2, 2, 7);  // 2nd Sun of March, 02:00 EST = 07:00 UTC
  var dstEnd = nthSundayUTC(y, 10, 1, 6);   // 1st Sun of November, 02:00 EDT = 06:00 UTC
  return (utcNow.getTime() >= dstStart.getTime() && utcNow.getTime() < dstEnd.getTime())
    ? tz.dstOffsetHours : tz.stdOffsetHours;
}

// User's current wall clock as a shifted Date (read it with getUTC*).
function userLocalNow(utcNow) { return new Date(utcNow.getTime() + tzOffsetHours(utcNow) * 3600000); }

function parseHHMM(s) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  var h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function fmt12(minOfDay) {
  var h = Math.floor(minOfDay / 60), m = minOfDay % 60;
  var ap = h >= 12 ? "PM" : "AM";
  var h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ":" + pad2(m) + " " + ap;
}

// ============================ core computation ==============================
// Habits whose reminder moment (alertTime - leadMinutes) is exactly localNow's
// minute. The every-minute cron means each habit matches once per day, so no
// sent-state needs to be stored anywhere.
function dueHabits(appData, localNow) {
  var habits = appData && Array.isArray(appData.habits) ? appData.habits : [];
  var nowMin = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();
  var due = [];
  habits.forEach(function (h) {
    var alertMin = parseHHMM(h.alertTime);
    if (alertMin == null) return;
    var remindMin = alertMin - CONFIG.leadMinutes;
    var alertDay = localNow;
    if (remindMin < 0) { // alert just after midnight → reminder fires the evening before
      remindMin += 1440;
      alertDay = new Date(localNow.getTime() + 86400000);
    }
    if (remindMin !== nowMin) return;

    var history = Array.isArray(h.history) ? h.history : [];
    if (CONFIG.skipIfDoneToday && history.indexOf(ymdUTC(alertDay)) !== -1) return;

    var hist = {}; history.forEach(function (d) { hist[d] = true; });
    var streak = 0, cur = new Date(alertDay.getTime() - 86400000);
    while (hist[ymdUTC(cur)]) { streak++; cur = new Date(cur.getTime() - 86400000); }

    due.push({
      title: h.title || "Untitled habit",
      color: /^#[0-9a-fA-F]{3,8}$/.test(h.color || "") ? h.color : CONFIG.accent,
      alertLabel: fmt12(alertMin),
      streak: streak,
    });
  });
  return due;
}

// ============================ HTML renderer =================================
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function renderAlertHTML(due, opts) {
  opts = opts || {};
  var name = esc(opts.name || "there");
  var accent = CONFIG.accent;
  var timeLabel = due[0].alertLabel;

  var rows = due.map(function (h) {
    return '' +
      '<table role="presentation" width="100%" style="margin:0 0 10px"><tr>' +
        '<td width="16" valign="middle"><div style="width:12px;height:12px;border-radius:50%;background:' + h.color + '"></div></td>' +
        '<td valign="middle" style="font-size:15px;font-weight:700;color:#0f172a;font-family:Arial,Helvetica,sans-serif;padding-left:8px">' + esc(h.title) +
          (h.streak > 1 ? ' <span style="color:#f59e0b;font-weight:700">&#128293; ' + h.streak + '</span>' : '') + '</td>' +
        '<td align="right" valign="middle" style="font-size:13px;color:#64748b;white-space:nowrap;font-family:Arial,Helvetica,sans-serif">' + esc(h.alertLabel) + '</td>' +
      '</tr></table>';
  }).join("");

  return '' +
'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>' + esc(CONFIG.brandName) + ' — Habit reminder</title></head>' +
'<body style="margin:0;padding:0;background:#eef2f7;-webkit-font-smoothing:antialiased">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:24px 12px"><tr><td align="center">' +
'<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08)">' +
  '<tr><td style="background:linear-gradient(135deg,' + accent + ',#6f2d2d);padding:22px 26px">' +
    '<div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.8);font-family:Arial,Helvetica,sans-serif">' + esc(CONFIG.brandName) + '</div>' +
    '<div style="font-size:22px;font-weight:800;color:#ffffff;margin-top:6px;font-family:Arial,Helvetica,sans-serif">&#9200; Starting in ' + CONFIG.leadMinutes + ' minutes</div>' +
    '<div style="font-size:13px;color:rgba(255,255,255,.85);margin-top:4px;font-family:Arial,Helvetica,sans-serif">' +
      (due.length === 1 ? 'Your habit is scheduled for ' : due.length + ' habits are scheduled for ') + esc(timeLabel) + '.</div>' +
  '</td></tr>' +
  '<tr><td style="padding:22px 26px">' +
    '<p style="font-size:14px;color:#334155;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif">Hi ' + name + ', a heads-up before it’s time:</p>' +
    rows +
    '<div style="margin-top:22px;text-align:center">' +
      '<a href="' + esc(CONFIG.appUrl) + '" style="display:inline-block;background:' + accent + ';color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:10px;font-family:Arial,Helvetica,sans-serif">Open ' + esc(CONFIG.brandName) + '</a>' +
    '</div>' +
  '</td></tr>' +
  '<tr><td style="padding:14px 26px;border-top:1px solid #eef2f7">' +
    '<div style="font-size:11px;color:#94a3b8;text-align:center;font-family:Arial,Helvetica,sans-serif">You’re getting this because a habit in ' + esc(CONFIG.brandName) + ' has an alert time. Checking a habit off for the day silences its reminder.</div>' +
  '</td></tr>' +
'</table></td></tr></table></body></html>';
}

// ============================ PocketBase glue ===============================
function readAppData(record) {
  try { var s = record.getString("appData"); if (s && s.trim()) return JSON.parse(s); } catch (_) {}
  try {
    var v = record.get("appData");
    if (v == null) return null;
    if (typeof v === "string") return JSON.parse(v);
    return JSON.parse(JSON.stringify(v));
  } catch (_) {}
  return null;
}

function isEligible(record, email) {
  if (!email) return false;
  if (CONFIG.onlyVerified && !record.getBool("verified")) return false;
  if (CONFIG.testMode) return CONFIG.testEmail && email.toLowerCase() === CONFIG.testEmail.toLowerCase();
  if (CONFIG.allowEmails && CONFIG.allowEmails.length) {
    var ok = CONFIG.allowEmails.some(function (e) { return e.toLowerCase() === email.toLowerCase(); });
    if (!ok) return false;
  }
  return true;
}

function sendAlert(email, name, due, html) {
  var settings = $app.settings();
  // Titles come from user data — keep them to one line and a sane length so a
  // crafted title can't splice mail headers or blow up the subject.
  var firstTitle = String(due[0].title).replace(/[\r\n\t]+/g, " ").slice(0, 80);
  var subject = due.length === 1
    ? "Starting soon: " + firstTitle + " (" + due[0].alertLabel + ")"
    : "Starting soon: " + due.length + " habits (" + due[0].alertLabel + ")";
  var message = new MailerMessage({
    from: { address: settings.meta.senderAddress, name: settings.meta.senderName || CONFIG.brandName },
    to: [{ address: email, name: name || "" }],
    subject: subject,
    html: html,
  });
  $app.newMailClient().send(message);
}

function runHabitAlerts() {
  var utcNow = new Date();
  var localNow = userLocalNow(utcNow);
  var users;
  try { users = $app.findAllRecords("users"); }
  catch (e) { $app.logger().error("[habitAlerts] could not load users: " + String(e)); return; }

  var sent = 0;
  users.forEach(function (u) {
    try {
      var email = u.getString("email");
      if (!isEligible(u, email)) return;
      var appData = readAppData(u);
      if (!appData) return;
      if (appData.emailReminders === false) return; // in-app "Emails" toggle off
      var due = dueHabits(appData, localNow);
      if (CONFIG.testMode) {
        $app.logger().info("[habitAlerts] TEST " + email + " local=" +
          pad2(localNow.getUTCHours()) + ":" + pad2(localNow.getUTCMinutes()) + " due=" + due.length);
      }
      if (!due.length) return;
      sendAlert(email, u.getString("name"), due, renderAlertHTML(due, { name: u.getString("name") || email.split("@")[0] }));
      sent++;
    } catch (err) { $app.logger().error("[habitAlerts] failed for a user: " + String(err)); }
  });
  if (sent) $app.logger().info("[habitAlerts] sent " + sent + " reminder email(s)");
}

module.exports = {
  runHabitAlerts: runHabitAlerts,
  dueHabits: dueHabits,
  renderAlertHTML: renderAlertHTML,
  userLocalNow: userLocalNow,
  tzOffsetHours: tzOffsetHours,
  CONFIG: CONFIG,
};
