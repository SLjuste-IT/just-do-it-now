/// <reference path="../pb_data/types.d.ts" />
/**
 * calendar_feed.pb.js — read-only ICS calendar feed + opt-in management.
 * ----------------------------------------------------------------------------
 * The feed is authorized by a per-user secret token stored in the hidden
 * users.calendarToken field (added by 1785200000_add_calendar_token.js). No
 * token = feature off. The public feed URL carries the token (calendar apps
 * can't send auth headers), so the token IS the credential — treat it like a
 * password; users can rotate it to invalidate a leaked link.
 *
 * Not gated to self-host: this works on production and self-hosted installs
 * alike. The ICS builder lives in calendar_feed_core.js, require()'d inside the
 * handler (PocketBase handlers run in an isolated context).
 *
 *   GET  /api/jdin/calendar/{token}      (public) -> text/calendar
 *   POST /api/jdin/calendar/status       (auth)   -> { enabled, token }
 *   POST /api/jdin/calendar/enable       (auth)   -> { enabled:true, token }
 *   POST /api/jdin/calendar/disable      (auth)   -> { ok:true }
 *   POST /api/jdin/calendar/regenerate   (auth)   -> { enabled:true, token }
 */

// --- public feed ------------------------------------------------------------
routerAdd("GET", "/api/jdin/calendar/{token}", (e) => {
  let raw = "";
  try { raw = e.request.pathValue("token") || ""; } catch (_) { raw = ""; }
  const token = String(raw).replace(/\.ics$/i, "").trim();
  // Tokens are 42 chars; reject anything implausibly short before hitting the DB.
  if (token.length < 20) throw new NotFoundError("Not found.");

  let user = null;
  try { user = $app.findFirstRecordByFilter("users", "calendarToken = {:t}", { t: token }); }
  catch (_) { user = null; }
  if (!user) throw new NotFoundError("Not found.");

  let appData = null;
  try {
    const s = user.getString("appData");
    if (s && s.trim()) appData = JSON.parse(s);
  } catch (_) { appData = null; }
  if (appData == null) {
    try {
      const v = user.get("appData");
      if (typeof v === "string") appData = JSON.parse(v);
      else if (v != null) appData = JSON.parse(JSON.stringify(v));
    } catch (_) { appData = null; }
  }

  const cal = require(`${__hooks}/calendar_feed_core.js`);
  const ics = cal.buildCalendar(appData || {}, {
    calName: "Just Do It Now",
    appUrl: $os.getenv("JDIN_APP_URL") || "",
  });
  return e.blob(200, "text/calendar; charset=utf-8", ics);
});

// --- opt-in management (authenticated) --------------------------------------
function genCalendarToken() {
  return $security.randomStringWithAlphabet(42, "abcdefghijklmnopqrstuvwxyz0123456789");
}

routerAdd("POST", "/api/jdin/calendar/status", (e) => {
  if (!e.auth) throw new UnauthorizedError("Sign in first.");
  const t = e.auth.getString("calendarToken");
  return e.json(200, { enabled: !!t, token: t || "" });
});

routerAdd("POST", "/api/jdin/calendar/enable", (e) => {
  if (!e.auth) throw new UnauthorizedError("Sign in first.");
  let t = e.auth.getString("calendarToken");
  if (!t) {
    t = genCalendarToken();
    e.auth.set("calendarToken", t);
    e.app.save(e.auth);
  }
  return e.json(200, { enabled: true, token: t });
});

routerAdd("POST", "/api/jdin/calendar/disable", (e) => {
  if (!e.auth) throw new UnauthorizedError("Sign in first.");
  e.auth.set("calendarToken", "");
  e.app.save(e.auth);
  return e.json(200, { ok: true });
});

routerAdd("POST", "/api/jdin/calendar/regenerate", (e) => {
  if (!e.auth) throw new UnauthorizedError("Sign in first.");
  const t = genCalendarToken();
  e.auth.set("calendarToken", t);
  e.app.save(e.auth);
  return e.json(200, { enabled: true, token: t });
});
