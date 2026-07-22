/// <reference path="../pb_data/types.d.ts" />
/**
 * totp.pb.js — authenticator-app (TOTP) endpoints. Stage 1: prove the engine.
 * ----------------------------------------------------------------------------
 * The real engine lives in totp_core.js and is require()'d INSIDE each handler,
 * because PocketBase runs handlers in an isolated context without access to
 * top-level functions (same pattern as weekly_report.pb.js).
 *
 *   POST /api/jdin/2fa/generate           -> { secret, uri }   (signed-in user)
 *   POST /api/jdin/2fa/check  {secret,code} -> { valid: bool }
 *
 * Stage 1 is a throwaway proof: it does NOT store anything or change login yet.
 */

routerAdd("POST", "/api/jdin/2fa/generate", (e) => {
  if (!e.auth) throw new UnauthorizedError("Sign in first.");

  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  var secret;
  try {
    secret = $security.randomStringWithAlphabet(32, alphabet);
  } catch (_) {
    secret = "";
    for (var i = 0; i < 32; i++) secret += alphabet.charAt(Math.floor(Math.random() * 32));
  }

  var account = "user";
  try { account = e.auth.email() || account; } catch (_) {}

  var totp = require(`${__hooks}/totp_core.js`);
  return e.json(200, { secret: secret, uri: totp.buildUri(secret, account, "Just Do It Now") });
});

routerAdd("POST", "/api/jdin/2fa/check", (e) => {
  if (!e.auth) throw new UnauthorizedError("Sign in first.");

  var data = new DynamicModel({ secret: "", code: "" });
  e.bindBody(data);

  var totp = require(`${__hooks}/totp_core.js`);
  return e.json(200, { valid: totp.verifyTotp(String(data.secret || ""), String(data.code || ""), 1) });
});
