/// <reference path="../pb_data/types.d.ts" />
/**
 * first_setup.pb.js — offline "set your own credentials" endpoint.
 * ----------------------------------------------------------------------------
 * The install creates a default account (admin@localhost.com). On first login
 * the app forces that account to set its OWN email + password; changing an
 * email normally needs an SMTP confirmation flow, so this applies it
 * server-side with app privileges instead.
 *
 * Hardened:
 *  - SELF-HOST ONLY: registers only when the service sets JDIN_SELFHOST=1.
 *  - Only the DEFAULT account may call it. A normal account's (possibly stolen)
 *    session token must not be able to silently swap its email/password —
 *    regular accounts go through the app's password-verified flows instead.
 */
if ($os.getenv("JDIN_SELFHOST") === "1") {
  routerAdd("POST", "/api/jdin/first-setup", (e) => {
    const user = e.auth;
    if (!user) {
      throw new UnauthorizedError("You must be signed in.");
    }

    let current = "";
    try { current = String(user.email() || "").toLowerCase(); } catch (_) {}
    if (current !== "admin@localhost.com") {
      throw new ForbiddenError("Only the first-run account can use this.");
    }

    const data = new DynamicModel({ email: "", password: "" });
    e.bindBody(data);

    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");

    if (email.indexOf("@") < 1 || email.lastIndexOf(".") < email.indexOf("@")) {
      throw new BadRequestError("Please enter a valid email address.");
    }
    if (password.length < 8) {
      throw new BadRequestError("Password must be at least 8 characters.");
    }

    user.setEmail(email);
    user.set("verified", true);
    user.setPassword(password);
    e.app.save(user);

    return e.json(200, { success: true });
  });
}
