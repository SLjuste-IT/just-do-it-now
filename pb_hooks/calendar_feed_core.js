/// <reference path="../pb_data/types.d.ts" />
/**
 * calendar_feed_core.js — builds a read-only iCalendar (ICS) document from a
 * user's appData (tasks + reminders). Pure, stateless and dependency-free so it
 * runs in PocketBase's goja JSVM. require()'d from calendar_feed.pb.js, and
 * unit-tested from Node.
 *
 * TIMEZONES: times are emitted as FLOATING local time (no trailing Z, no
 * VTIMEZONE). The app stores wall-clock due times with no timezone; floating
 * time displays at that same clock reading in whatever timezone the viewer's
 * calendar uses — exactly the intent, and it sidesteps every server-UTC / DST
 * conversion. Tasks with no time become all-day (VALUE=DATE) events. DTSTAMP is
 * the only UTC timestamp (it marks when the document was generated).
 */

function pad2(n) { return (n < 10 ? "0" : "") + n; }

// RFC 5545 TEXT escaping: backslash, semicolon, comma, and newlines. Applied to
// every user-supplied value so a crafted title/note can't inject ICS properties.
// Trailing pass strips C0 control chars (newlines were already converted above).
var CTRL_RE = new RegExp("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]", "g");
function escText(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(CTRL_RE, "");
}

// Fold content lines toward the 75-octet RFC limit (continuation = CRLF + space).
// Folded by character (conservative 74/73) — task text is overwhelmingly ASCII,
// and parsers accept shorter-than-limit lines, so this never splits a UTF-8 rune
// in practice while keeping strict parsers (e.g. Google) happy.
function fold(line) {
  if (line.length <= 74) return line;
  var out = "", i = 0;
  while (i < line.length) {
    var size = (i === 0) ? 74 : 73;
    out += (i === 0 ? "" : "\r\n ") + line.slice(i, i + size);
    i += size;
  }
  return out;
}

function ymdCompact(ymd) { // "2026-07-25" -> "20260725"
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ""));
  return m ? (m[1] + m[2] + m[3]) : "";
}

// Floating "YYYYMMDDTHHMMSS". Arithmetic is done in UTC purely as a calendar
// (never converted to/from a zone), so the server's own timezone is irrelevant.
function localStamp(ymd, hhmm, addMin) {
  var d = ymdCompact(ymd);
  if (!d) return "";
  var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || "00:00"));
  var hh = m ? Math.min(23, parseInt(m[1], 10) || 0) : 0;
  var mm = m ? Math.min(59, parseInt(m[2], 10) || 0) : 0;
  var base = Date.UTC(+d.slice(0, 4), (+d.slice(4, 6)) - 1, +d.slice(6, 8), hh, mm, 0);
  var dt = new Date(base + (addMin || 0) * 60000);
  return dt.getUTCFullYear().toString()
    + pad2(dt.getUTCMonth() + 1) + pad2(dt.getUTCDate())
    + "T" + pad2(dt.getUTCHours()) + pad2(dt.getUTCMinutes()) + "00";
}

function ymdPlusDays(ymd, days) {
  var d = ymdCompact(ymd); if (!d) return "";
  var dt = new Date(Date.UTC(+d.slice(0, 4), (+d.slice(4, 6)) - 1, +d.slice(6, 8)) + days * 86400000);
  return dt.getUTCFullYear().toString() + pad2(dt.getUTCMonth() + 1) + pad2(dt.getUTCDate());
}

function utcStamp(date) {
  var d = date || new Date();
  return d.getUTCFullYear().toString() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate())
    + "T" + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + "Z";
}

var DOW = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Map the app's recurrence model to an RRULE (best-effort; "" when non-recurring).
function recurrenceRRule(rr, isAllDay) {
  if (!rr || !rr.mode || rr.mode === "none") return "";
  var unit, every = 1, byday = "", tail = "";
  if (rr.mode === "simple") {
    unit = rr.unit;
  } else if (rr.mode === "custom") {
    unit = rr.unit;
    every = Math.max(1, parseInt(rr.every, 10) || 1);
    if (rr.unit === "week" && Array.isArray(rr.weekdays) && rr.weekdays.length) {
      byday = rr.weekdays.map(function (n) { return DOW[n]; }).filter(Boolean).join(",");
    }
    if (rr.endType === "date" && rr.endDate) {
      var u = ymdCompact(rr.endDate);
      if (u) tail = ";UNTIL=" + (isAllDay ? u : (u + "T235959")); // floating UNTIL matches a floating DTSTART
    } else if (rr.endType === "count" && rr.endCount) {
      var c = parseInt(rr.endCount, 10);
      if (c > 0) tail = ";COUNT=" + c;
    }
  } else {
    return "";
  }
  var freq = unit === "day" ? "DAILY" : unit === "week" ? "WEEKLY" : unit === "month" ? "MONTHLY" : unit === "year" ? "YEARLY" : "";
  if (!freq) return "";
  var rule = "FREQ=" + freq;
  if (every > 1) rule += ";INTERVAL=" + every;
  if (byday) rule += ";BYDAY=" + byday;
  return rule + tail;
}

function priorityVal(p) {
  p = String(p || "").toLowerCase();
  return (p === "high" || p === "urgent") ? 1 : (p === "low" ? 9 : 5);
}
function titleCase(s) { s = String(s || ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

function uidSafe(id, suffix) {
  var s = String(id == null ? "" : id).replace(/[^A-Za-z0-9_-]/g, "");
  if (!s) s = "x" + Math.random().toString(36).slice(2, 10);
  return s + (suffix || "") + "@jdin";
}

function buildCalendar(appData, opts) {
  opts = opts || {};
  var calName = opts.calName || "Just Do It Now";
  var appUrl = opts.appUrl || "";
  var todos = (appData && Array.isArray(appData.todos)) ? appData.todos : [];
  var reminders = (appData && Array.isArray(appData.reminders)) ? appData.reminders : [];
  var projById = {};
  ((appData && Array.isArray(appData.projects)) ? appData.projects : []).forEach(function (p) { if (p && p.id) projById[p.id] = p; });

  var stamp = utcStamp(new Date());
  var L = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Just Do It Now//Calendar Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:" + escText(calName),
    "NAME:" + escText(calName),
    "X-WR-CALDESC:" + escText("Tasks and reminders from " + calName),
    "X-PUBLISHED-TTL:PT6H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H"
  ];

  // ---- Tasks (incomplete + dated) ----------------------------------------
  todos.forEach(function (t) {
    if (!t || t.completed || !t.dueDate) return;
    var allDay = !(t.dueTime && /^\d{1,2}:\d{2}/.test(t.dueTime));
    var ev = ["BEGIN:VEVENT", "UID:" + uidSafe(t.id, ""), "DTSTAMP:" + stamp];
    if (allDay) {
      var d0 = ymdCompact(t.dueDate); if (!d0) return;
      ev.push("DTSTART;VALUE=DATE:" + d0);
      ev.push("DTEND;VALUE=DATE:" + ymdPlusDays(t.dueDate, 1)); // DTEND is exclusive
    } else {
      var s0 = localStamp(t.dueDate, t.dueTime, 0); if (!s0) return;
      ev.push("DTSTART:" + s0);
      ev.push("DTEND:" + localStamp(t.dueDate, t.dueTime, 30)); // 30-min block for a timed deadline
    }
    var rr = recurrenceRRule(t.recurrence, allDay);
    if (rr) ev.push("RRULE:" + rr);
    ev.push("SUMMARY:" + escText(t.title || "Untitled task"));
    var parts = [
      "Status: " + (t.status || "New"),
      "Priority: " + (t.priority ? titleCase(t.priority) : "Medium")
    ];
    var proj = (t.projectId && projById[t.projectId]) ? projById[t.projectId] : null;
    if (proj && proj.name) parts.push("Project: " + proj.name);
    if (Array.isArray(t.tags) && t.tags.length) parts.push("Tags: " + t.tags.join(", "));
    if (t.notes) parts.push("\n" + t.notes);
    if (appUrl) parts.push("\nOpen: " + appUrl);
    ev.push("DESCRIPTION:" + escText(parts.join("\n")));
    if (Array.isArray(t.tags) && t.tags.length) ev.push("CATEGORIES:" + t.tags.map(escText).join(","));
    ev.push("PRIORITY:" + priorityVal(t.priority));
    ev.push("END:VEVENT");
    for (var i = 0; i < ev.length; i++) L.push(ev[i]);
  });

  // ---- Reminders (with a display alarm at the reminder time) --------------
  reminders.forEach(function (r) {
    if (!r || !r.date) return;
    var allDay = !(r.time && /^\d{1,2}:\d{2}/.test(r.time));
    var ev = ["BEGIN:VEVENT", "UID:" + uidSafe(r.id || r.title, "-rem"), "DTSTAMP:" + stamp];
    if (allDay) {
      var d0 = ymdCompact(r.date); if (!d0) return;
      ev.push("DTSTART;VALUE=DATE:" + d0);
      ev.push("DTEND;VALUE=DATE:" + ymdPlusDays(r.date, 1));
    } else {
      var s0 = localStamp(r.date, r.time, 0); if (!s0) return;
      ev.push("DTSTART:" + s0);
      ev.push("DTEND:" + localStamp(r.date, r.time, 15));
    }
    ev.push("SUMMARY:" + escText(r.title || "Reminder"));
    ev.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + escText(r.title || "Reminder"), "TRIGGER:PT0M", "END:VALARM");
    ev.push("END:VEVENT");
    for (var i = 0; i < ev.length; i++) L.push(ev[i]);
  });

  L.push("END:VCALENDAR");
  return L.map(fold).join("\r\n") + "\r\n";
}

module.exports = {
  buildCalendar: buildCalendar,
  recurrenceRRule: recurrenceRRule,
  escText: escText,
  fold: fold,
  localStamp: localStamp,
  ymdPlusDays: ymdPlusDays,
};
