/// <reference path="../pb_data/types.d.ts" />
/**
 * totp.pb.js — authenticator-app (TOTP) 2FA endpoints.
 * ----------------------------------------------------------------------------
 * Engine + helpers live in totp_core.js and are require()'d INSIDE each handler
 * (PocketBase handlers run in an isolated context with no access to this file's
 * top-level declarations).
 *
 * SELF-HOST ONLY: routes register only when the service sets JDIN_SELFHOST=1
 * (both installers do). This matters most for /api/jdin/login: it issues
 * sessions via validatePassword + newAuthToken, which would BYPASS PocketBase's
 * built-in email-OTP MFA on a production deployment that uses it.
 *
 * Hardening:
 *  - /2fa/setup refuses while 2FA is enabled (no silent secret reset with a
 *    stolen session — disabling first requires a current code).
 *  - /api/jdin/login rate-limits failures per account: 10 strikes / 15 min,
 *    then 429. Counters live in $app.store() (in-memory; resets on restart,
 *    which is plenty against 6-digit brute force).
 *
 *   POST /api/jdin/2fa/status   (auth)            -> { enabled }
 *   POST /api/jdin/2fa/setup    (auth)            -> { secret, uri }
 *   POST /api/jdin/2fa/enable   (auth) {code}     -> { backupCodes:[...] }
 *   POST /api/jdin/2fa/disable  (auth) {code}     -> { ok:true }
 *   POST /api/jdin/login  (public) {email,password,code?}
 *        -> { token, record } | { mfaRequired:true }
 */
if ($os.getenv("JDIN_SELFHOST") === "1") {

  routerAdd("POST", "/api/jdin/2fa/status", (e) => {
    if (!e.auth) throw new UnauthorizedError("Sign in first.");
    return e.json(200, { enabled: !!e.auth.getBool("totpEnabled") });
  });

  routerAdd("POST", "/api/jdin/2fa/setup", (e) => {
    if (!e.auth) throw new UnauthorizedError("Sign in first.");
    if (e.auth.getBool("totpEnabled")) {
      throw new BadRequestError("Two-factor is already on. Turn it off (with a code) before re-enrolling.");
    }
    var totp = require(`${__hooks}/totp_core.js`);
    var secret = totp.randB32(32);
    e.auth.set("totpSecret", secret);
    e.auth.set("totpEnabled", false);
    e.app.save(e.auth);
    var account = "user";
    try { account = e.auth.email() || account; } catch (_) {}
    return e.json(200, { secret: secret, uri: totp.buildUri(secret, account, "Just Do It Now") });
  });

  routerAdd("POST", "/api/jdin/2fa/enable", (e) => {
    if (!e.auth) throw new UnauthorizedError("Sign in first.");
    var data = new DynamicModel({ code: "" });
    e.bindBody(data);
    var totp = require(`${__hooks}/totp_core.js`);
    var secret = e.auth.getString("totpSecret");
    if (!secret) throw new BadRequestError("Start setup first.");
    if (!totp.verifyTotp(secret, String(data.code || ""), 1)) {
      throw new BadRequestError("That code isn't right — use the current one from your app.");
    }
    var plain = [], hashed = [];
    for (var i = 0; i < 8; i++) {
      var c = totp.randCode();
      plain.push(c);
      hashed.push(totp.sha1hex(c));
    }
    e.auth.set("totpEnabled", true);
    e.auth.set("totpBackup", hashed);
    e.app.save(e.auth);
    return e.json(200, { backupCodes: plain });
  });

  routerAdd("POST", "/api/jdin/2fa/disable", (e) => {
    if (!e.auth) throw new UnauthorizedError("Sign in first.");
    var data = new DynamicModel({ code: "" });
    e.bindBody(data);
    var totp = require(`${__hooks}/totp_core.js`);
    if (e.auth.getBool("totpEnabled") && !totp.verifyTotp(e.auth.getString("totpSecret"), String(data.code || ""), 1)) {
      throw new BadRequestError("Enter a current code to turn off two-factor.");
    }
    e.auth.set("totpSecret", "");
    e.auth.set("totpEnabled", false);
    e.auth.set("totpBackup", []);
    e.app.save(e.auth);
    return e.json(200, { ok: true });
  });

  routerAdd("POST", "/api/jdin/login", (e) => {
    var data = new DynamicModel({ email: "", password: "", code: "" });
    e.bindBody(data);
    var email = String(data.email || "").trim().toLowerCase();
    var password = String(data.password || "");
    var code = String(data.code || "").trim();

    // ---- brute-force throttle (per account, in-memory) --------------------
    var WINDOW_MS = 15 * 60 * 1000, MAX_FAILS = 10;
    var rlKey = "jdin_rl:" + email;
    var st = { n: 0, t: Date.now() };
    try {
      var raw = $app.store().get(rlKey);
      if (raw) { var p = JSON.parse(raw); if (Date.now() - p.t <= WINDOW_MS) st = p; }
    } catch (_) {}
    if (st.n >= MAX_FAILS) {
      throw new ApiError(429, "Too many attempts. Try again in a few minutes.", {});
    }
    var fail = function (msg) {
      st.n++;
      try { $app.store().set(rlKey, JSON.stringify(st)); } catch (_) {}
      throw new BadRequestError(msg);
    };

    var user = null;
    try { user = $app.findAuthRecordByEmail("users", email); } catch (_) { user = null; }
    if (!user || !user.validatePassword(password)) {
      fail("Wrong email or password.");
    }

    if (user.getBool("totpEnabled")) {
      if (!code) {
        return e.json(200, { mfaRequired: true });
      }
      var totp = require(`${__hooks}/totp_core.js`);
      var ok = totp.verifyTotp(user.getString("totpSecret"), code, 1);
      if (!ok) {
        // fall back to a single-use backup code
        var backups = user.get("totpBackup") || [];
        var target = totp.sha1hex(code.toLowerCase());
        for (var i = 0; i < backups.length; i++) {
          if (backups[i] === target) { backups.splice(i, 1); user.set("totpBackup", backups); $app.save(user); ok = true; break; }
        }
      }
      if (!ok) fail("Invalid two-factor code.");
    }

    try { $app.store().set(rlKey, JSON.stringify({ n: 0, t: Date.now() })); } catch (_) {}
    return e.json(200, { token: user.newAuthToken(), record: { id: user.id, email: email } });
  });

}
