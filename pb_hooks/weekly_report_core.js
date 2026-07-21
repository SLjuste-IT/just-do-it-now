/// <reference path="../pb_data/types.d.ts" />
/**
 * weekly_report.pb.js — JUST DO IT NOW "week in review" emailer
 * ----------------------------------------------------------------------------
 * A PocketBase pb_hooks job that, every Sunday morning, emails each user a
 * report of the previous 7 days: tasks completed (grouped by project), project
 * progress, and habit check-ins / streaks. It reuses the SMTP that PocketBase
 * already uses for password-reset / verification mail — no extra service and no
 * credentials live in this file.
 *
 * Data source: the `appData` JSON field on the `users` collection (the same
 * blob the web app reads/writes), shaped { todos, projects, habits, ... }.
 *
 * Requires PocketBase v0.22+ (modern JSVM API: cronAdd, MailerMessage,
 * $app.newMailClient(), $app.findAllRecords). See WEEKLY_REPORT_SETUP.md.
 *
 * The pure functions below (date math, computeWeekly, renderReportHTML) are
 * PocketBase-independent so they can be unit-tested under Node. Only the glue at
 * the bottom touches PocketBase globals, and that part is skipped when this file
 * is require()'d outside PocketBase.
 * ============================================================================ */

// ============================ CONFIG ========================================
var CONFIG = {
  // When to send. Cron is "min hour dom mon dow" in the SERVER's local timezone.
  // This server runs on UTC, and the user is US-Eastern (UTC-4 in summer / EDT),
  // so to land at ~08:00 their time we schedule 12:00 UTC every Sunday.
  // "0 12 * * 0" = 12:00 UTC Sun = 08:00 EDT (summer) / 07:00 EST (winter — the
  // 1h DST drift is unavoidable with PocketBase's fixed-offset cron).
  cron: "0 12 * * 0",

  onlyVerified: true,     // only email users whose account is verified
  allowEmails: ["lejuste.s09@gmail.com"], // [] = every eligible user. Or ["you@example.com"] to restrict.
  skipEmptyWeeks: false,  // always send the weekly summary, even on a zero-activity week

  brandName: "JUST DO IT NOW",
  appUrl: "https://todo.serverkakoulabs.org/",
  accent: "#6366f1",

  // ---- Testing: flip testMode on, restart PocketBase, and the job runs every
  //      minute, only to testEmail, ignoring skipEmptyWeeks. Turn it back off
  //      once you've confirmed the email arrives.
  testMode: false,
  testEmail: "lejuste.s09@gmail.com",
};

// ============================ date helpers ==================================
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function ymd(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function parseYmd(s) { var p = String(s).split("-"); return new Date(+p[0], (+p[1]) - 1, +p[2]); }
function prettyDate(d) {
  var M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return M[d.getMonth()] + " " + d.getDate();
}

// "last week" = the 7 full days BEFORE today. Run on Sunday this is Sun–Sat of
// the week that just finished. Returned oldest→newest.
function lastWeekDays(now) {
  var today0 = startOfDay(now);
  var days = [];
  for (var i = 7; i >= 1; i--) { var d = new Date(today0); d.setDate(d.getDate() - i); days.push(ymd(d)); }
  return days;
}

// ============================ core computation ==============================
function computeWeekly(appData, now) {
  appData = appData || {};
  var todos = Array.isArray(appData.todos) ? appData.todos : [];
  var projects = Array.isArray(appData.projects) ? appData.projects : [];
  var habits = Array.isArray(appData.habits) ? appData.habits : [];

  var weekDays = lastWeekDays(now);
  var weekSet = {}; weekDays.forEach(function (d) { weekSet[d] = true; });
  var startD = parseYmd(weekDays[0]);
  var endD = parseYmd(weekDays[6]);
  var todayStr = ymd(startOfDay(now));
  var periodLabel = prettyDate(startD) + " – " + prettyDate(endD) + ", " + endD.getFullYear();
  var dayLabels = weekDays.map(function (d) { return "SMTWTFS".charAt(parseYmd(d).getDay()); });

  function tsYmd(v) { if (!v) return null; var d = new Date(v); return isNaN(d.getTime()) ? null : ymd(d); }

  var completedThisWeek = todos.filter(function (t) { var d = tsYmd(t.completedAt); return d && weekSet[d]; });
  var createdThisWeek = todos.filter(function (t) { var d = tsYmd(t.createdAt); return d && weekSet[d]; });

  // Tasks completed this week, grouped by project (unprojected tasks last).
  var projById = {}; projects.forEach(function (p) { projById[p.id] = p; });
  var groupMap = {};
  completedThisWeek.forEach(function (t) {
    var key = (t.projectId && projById[t.projectId]) ? t.projectId : "__none__";
    if (!groupMap[key]) groupMap[key] = { project: key === "__none__" ? null : projById[key], tasks: [] };
    groupMap[key].tasks.push({ title: t.title || "Untitled task", day: tsYmd(t.completedAt), priority: (t.priority || "medium") });
  });
  var groups = Object.keys(groupMap).map(function (k) { return groupMap[k]; });
  groups.forEach(function (g) { g.tasks.sort(function (a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : 0; }); });
  groups.sort(function (a, b) {
    if (!a.project) return 1; if (!b.project) return -1;
    return String(a.project.name || "").localeCompare(String(b.project.name || ""));
  });

  // Per-project progress (all-time completion %, plus what moved this week).
  var projectStats = projects.map(function (p) {
    var all = todos.filter(function (t) { return t.projectId === p.id; });
    var done = all.filter(function (t) { return t.completed; }).length;
    var doneWeek = completedThisWeek.filter(function (t) { return t.projectId === p.id; }).length;
    return {
      name: p.name || "Untitled project", color: p.color || CONFIG.accent,
      total: all.length, done: done, doneWeek: doneWeek,
      pct: all.length ? Math.round((done / all.length) * 100) : 0,
      status: p.status || "active",
    };
  }).filter(function (p) { return p.total > 0; })
    .sort(function (a, b) { return b.doneWeek - a.doneWeek || b.pct - a.pct; });

  // Habits: 7-day grid for the week, count, and streak as of end-of-week.
  var habitStats = habits.map(function (h) {
    var history = Array.isArray(h.history) ? h.history : [];
    var hist = {}; history.forEach(function (d) { hist[d] = true; });
    var grid = weekDays.map(function (d) { return !!hist[d]; });
    var count = grid.filter(Boolean).length;
    var streak = 0, cur = new Date(endD);
    while (hist[ymd(cur)]) { streak++; cur.setDate(cur.getDate() - 1); }
    return { title: h.title || "Untitled habit", color: h.color || "#10b981", grid: grid, count: count, streak: streak };
  });

  var habitChecks = habitStats.reduce(function (s, h) { return s + h.count; }, 0);
  var habitPossible = habits.length * 7;
  var openTasks = todos.filter(function (t) { return !t.completed; });
  var overdue = openTasks.filter(function (t) { return t.dueDate && t.dueDate < todayStr; }).length;

  return {
    period: { label: periodLabel, start: weekDays[0], end: weekDays[6], weekDays: weekDays, dayLabels: dayLabels },
    totals: {
      tasksDone: completedThisWeek.length,
      tasksCreated: createdThisWeek.length,
      openTasks: openTasks.length,
      overdue: overdue,
      activeHabits: habits.length,
      habitChecks: habitChecks,
      habitPossible: habitPossible,
      habitPct: habitPossible ? Math.round((habitChecks / habitPossible) * 100) : 0,
    },
    groups: groups,
    projectStats: projectStats,
    habitStats: habitStats,
  };
}

// ============================ HTML renderer =================================
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function renderReportHTML(report, opts) {
  opts = opts || {};
  var name = esc(opts.name || "there");
  var accent = CONFIG.accent;
  var t = report.totals;

  function statCell(num, label, color) {
    return '' +
      '<td align="center" style="padding:14px 8px;background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;">' +
        '<div style="font-size:26px;font-weight:800;line-height:1;color:' + (color || "#0f172a") + ';font-family:Arial,Helvetica,sans-serif">' + num + '</div>' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#64748b;margin-top:6px">' + esc(label) + '</div>' +
      '</td>';
  }

  // Stat row (2x2 grid of cells)
  var stats =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate"><tr>' +
      statCell(t.tasksDone, "Tasks done", accent) +
      statCell(t.habitPct + "%", "Habits hit", "#10b981") +
    '</tr><tr>' +
      statCell(t.tasksCreated, "Tasks added", "#0f172a") +
      statCell(t.overdue, "Overdue now", t.overdue ? "#e11d48" : "#0f172a") +
    '</tr></table>';

  // Projects with progress bars
  var projectsHtml = "";
  if (report.projectStats.length) {
    projectsHtml += sectionTitle("Projects");
    report.projectStats.forEach(function (p) {
      var safeColor = /^#[0-9a-fA-F]{3,8}$/.test(p.color) ? p.color : accent;
      projectsHtml += '' +
        '<div style="margin:0 0 12px">' +
          '<table role="presentation" width="100%"><tr>' +
            '<td style="font-size:14px;font-weight:700;color:#0f172a;font-family:Arial,Helvetica,sans-serif">' + esc(p.name) + '</td>' +
            '<td align="right" style="font-size:12px;color:#64748b;font-family:Arial,Helvetica,sans-serif">' +
              (p.doneWeek ? '<span style="color:' + accent + ';font-weight:700">+' + p.doneWeek + ' this week</span> · ' : '') +
              p.done + '/' + p.total + ' · ' + p.pct + '%' +
            '</td>' +
          '</tr></table>' +
          '<div style="height:8px;background:#eef2ff;border-radius:999px;overflow:hidden;margin-top:6px">' +
            '<div style="height:8px;width:' + p.pct + '%;background:' + safeColor + ';border-radius:999px"></div>' +
          '</div>' +
        '</div>';
    });
  }

  // Completed tasks grouped by project
  var tasksHtml = "";
  if (report.groups.length) {
    tasksHtml += sectionTitle("What you finished");
    report.groups.forEach(function (g) {
      var heading = g.project ? esc(g.project.name) : "No project";
      tasksHtml += '<div style="font-size:12px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:#94a3b8;margin:14px 0 6px">' + heading + '</div>';
      g.tasks.forEach(function (task) {
        var d = parseYmd(task.day);
        tasksHtml += '' +
          '<table role="presentation" width="100%" style="margin:0 0 4px"><tr>' +
            '<td width="18" valign="top" style="font-size:14px;color:#10b981">&#10003;</td>' +
            '<td style="font-size:14px;color:#334155;font-family:Arial,Helvetica,sans-serif">' + esc(task.title) + '</td>' +
            '<td align="right" width="48" style="font-size:11px;color:#94a3b8;white-space:nowrap;font-family:Arial,Helvetica,sans-serif">' + prettyDate(d) + '</td>' +
          '</tr></table>';
      });
    });
  } else {
    tasksHtml += '<div style="text-align:center;color:#94a3b8;font-size:14px;padding:18px;border:1px dashed #e2e8f0;border-radius:12px;margin-top:8px">No tasks were completed last week.</div>';
  }

  // Habits
  var habitsHtml = "";
  if (report.habitStats.length) {
    habitsHtml += sectionTitle("Habits");
    // weekday header
    var headCells = report.period.dayLabels.map(function (l) {
      return '<td align="center" width="22" style="font-size:10px;color:#cbd5e1;font-family:Arial,Helvetica,sans-serif">' + esc(l) + '</td>';
    }).join("");
    habitsHtml += '<table role="presentation" width="100%"><tr><td></td><td><table role="presentation"><tr>' + headCells + '</tr></table></td><td></td></tr></table>';

    report.habitStats.forEach(function (h) {
      var safeColor = /^#[0-9a-fA-F]{3,8}$/.test(h.color) ? h.color : "#10b981";
      var dots = h.grid.map(function (on) {
        var bg = on ? safeColor : "#ffffff";
        var bd = on ? safeColor : "#e2e8f0";
        return '<td align="center" width="22"><div style="width:14px;height:14px;border-radius:50%;background:' + bg + ';border:1px solid ' + bd + ';margin:0 auto"></div></td>';
      }).join("");
      habitsHtml += '' +
        '<table role="presentation" width="100%" style="margin:4px 0"><tr>' +
          '<td style="font-size:13px;font-weight:600;color:#334155;font-family:Arial,Helvetica,sans-serif">' + esc(h.title) +
            (h.streak > 1 ? ' <span style="color:#f59e0b;font-weight:700">&#128293; ' + h.streak + '</span>' : '') + '</td>' +
          '<td><table role="presentation"><tr>' + dots + '</tr></table></td>' +
          '<td align="right" width="40" style="font-size:12px;font-weight:700;color:' + safeColor + ';font-family:Arial,Helvetica,sans-serif">' + h.count + '/7</td>' +
        '</tr></table>';
    });
  }

  return '' +
'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>' + esc(CONFIG.brandName) + ' — Weekly report</title></head>' +
'<body style="margin:0;padding:0;background:#eef2f7;-webkit-font-smoothing:antialiased">' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:24px 12px"><tr><td align="center">' +
'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08)">' +
  // header band
  '<tr><td style="background:linear-gradient(135deg,' + accent + ',#7c3aed);padding:26px 28px">' +
    '<div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.8);font-family:Arial,Helvetica,sans-serif">' + esc(CONFIG.brandName) + '</div>' +
    '<div style="font-size:24px;font-weight:800;color:#ffffff;margin-top:6px;font-family:Arial,Helvetica,sans-serif">Your week in review</div>' +
    '<div style="font-size:13px;color:rgba(255,255,255,.85);margin-top:4px;font-family:Arial,Helvetica,sans-serif">' + esc(report.period.label) + '</div>' +
  '</td></tr>' +
  '<tr><td style="padding:24px 28px">' +
    '<p style="font-size:15px;color:#334155;margin:0 0 18px;font-family:Arial,Helvetica,sans-serif">Hi ' + name + ', here’s what last week looked like.</p>' +
    stats +
    projectsHtml +
    tasksHtml +
    habitsHtml +
    '<div style="margin-top:24px;text-align:center">' +
      '<a href="' + esc(CONFIG.appUrl) + '" style="display:inline-block;background:' + accent + ';color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:10px;font-family:Arial,Helvetica,sans-serif">Open ' + esc(CONFIG.brandName) + '</a>' +
    '</div>' +
  '</td></tr>' +
  '<tr><td style="padding:16px 28px;border-top:1px solid #eef2f7">' +
    '<div style="font-size:11px;color:#94a3b8;text-align:center;font-family:Arial,Helvetica,sans-serif">You’re getting this weekly summary from ' + esc(CONFIG.brandName) + '. Tip: use your mail app’s Print → Save as PDF to keep a copy.</div>' +
  '</td></tr>' +
'</table></td></tr></table></body></html>';

  function sectionTitle(txt) {
    return '<div style="font-size:15px;font-weight:800;color:#0f172a;margin:22px 0 10px;font-family:Arial,Helvetica,sans-serif">' + esc(txt) + '</div>';
  }
}

// ============================ PocketBase glue ===============================
// Everything below only runs inside PocketBase (cronAdd / $app exist there).
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

function sendReport(email, name, report, html) {
  var settings = $app.settings();
  var message = new MailerMessage({
    from: { address: settings.meta.senderAddress, name: settings.meta.senderName || CONFIG.brandName },
    to: [{ address: email, name: name || "" }],
    subject: "Your week in review · " + report.period.label,
    html: html,
  });
  $app.newMailClient().send(message);
}

function runWeeklyReport() {
  var now = new Date();
  var users;
  try { users = $app.findAllRecords("users"); }
  catch (e) { $app.logger().error("[weeklyReport] could not load users: " + String(e)); return; }

  var sent = 0, skipped = 0;
  users.forEach(function (u) {
    try {
      var email = u.getString("email");
      if (!isEligible(u, email)) { skipped++; return; }
      var appData = readAppData(u);
      if (!appData) { skipped++; return; }
      var report = computeWeekly(appData, now);
      if (!CONFIG.testMode && CONFIG.skipEmptyWeeks && report.totals.tasksDone === 0 && report.totals.habitChecks === 0) { skipped++; return; }
      var html = renderReportHTML(report, { name: u.getString("name") || email.split("@")[0] });
      sendReport(email, u.getString("name"), report, html);
      sent++;
    } catch (err) { $app.logger().error("[weeklyReport] failed for a user: " + String(err)); }
  });
  $app.logger().info("[weeklyReport] finished. sent=" + sent + " skipped=" + skipped + (CONFIG.testMode ? " (TEST MODE)" : ""));
}

// NOTE: the cron is registered by the thin entrypoint weekly_report.pb.js, which
// require()s this module *inside* the handler. PocketBase runs cron callbacks in
// an isolated context that cannot see a file's other top-level functions, so all
// the logic must live together in one require()d module like this one.
module.exports = {
  runWeeklyReport: runWeeklyReport,
  computeWeekly: computeWeekly,
  renderReportHTML: renderReportHTML,
  lastWeekDays: lastWeekDays,
  CONFIG: CONFIG,
};
