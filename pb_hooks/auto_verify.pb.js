/// <reference path="../pb_data/types.d.ts" />
/**
 * auto_verify.pb.js — let people use the app without an email server.
 * ----------------------------------------------------------------------------
 * Fresh self-hosted installs have no SMTP, so verification emails never arrive
 * and new users would be stuck on "Check your inbox". This marks every new user
 * verified at creation so they can sign straight in.
 *
 * SELF-HOST ONLY: registers only when the service sets JDIN_SELFHOST=1 (both
 * installers do). On a production deployment with real SMTP and email
 * verification, this file is inert — it must never silently disable
 * verification there.
 */
if ($os.getenv("JDIN_SELFHOST") === "1") {
  onRecordCreate((e) => {
    try {
      e.record.set("verified", true);
    } catch (_) {
      // never block sign-up because of this convenience hook
    }
    e.next();
  }, "users");
}
