/// <reference path="../pb_data/types.d.ts" />
/**
 * auto_verify.pb.js — let people use the app without an email server.
 * ----------------------------------------------------------------------------
 * A fresh self-hosted install has no SMTP, so verification emails never arrive
 * and new users get stuck on the app's "Check your inbox" screen. This marks
 * every new user as verified the instant they sign up, so they can sign straight
 * in with their OWN email + password — no email server required.
 *
 * If you later configure real SMTP and WANT to require email verification,
 * delete this hook (or gate it behind an env var) and restart the service.
 *
 * Fail-safe: if setting the field ever throws, creation still proceeds.
 */
onRecordCreate((e) => {
  try {
    e.record.set("verified", true);
  } catch (_) {
    // never block sign-up because of this convenience hook
  }
  e.next();
}, "users");
