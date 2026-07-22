/// <reference path="../pb_data/types.d.ts" />
/**
 * totp.pb.js — authenticator-app (TOTP) 2FA endpoints.
 * ----------------------------------------------------------------------------
 * The engine + helpers live in totp_core.js and are require()'d INSIDE each
 * handler, because PocketBase runs handlers in an isolated context with NO
 * access to this file's top-level declarations (same as weekly_report.pb.js).
 * Only globals ($app, $security, DynamicModel, *Error, e.*) are usable directly.
 *
 *   POST /api/jdin/2fa/status   (auth)            -> { enabled }
 *   POST /api/jdin/2fa/setup    (auth)            -> { secret, uri }   (not active yet)
 *   POST /api/jdin/2fa/enable   (auth) {code}     -> { backupCodes:[...] }  (once)
 *   POST /api/jdin/2fa/disable  (auth) {code}     -> { ok:true }
 *   POST /api/jdin/login  (public) {email,password,code?}
 *        -> { token, record } | { mfaRequired:true }
 */

routerAdd("POST", "/api/jdin/2fa/status", (e) => {
  if (!e.auth) throw new UnauthorizedError("Sign in first.");
  return e.json(200, { enabled: !!e.auth.getBool("totpEnabled") });
});

routerAdd("POST", "/api/jdin/2fa/setup", (e) => {
  if (!e.auth) throw new UnauthorizedError("Sign in first.");
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

  var user = null;
  try { user = $app.findAuthRecordByEmail("users", email); } catch (_) { user = null; }
  if (!user || !user.validatePassword(password)) {
    throw new BadRequestError("Wrong email or password.");
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
    if (!ok) throw new BadRequestError("Invalid two-factor code.");
  }

  return e.json(200, { token: user.newAuthToken(), record: { id: user.id, email: email } });
});
