/// <reference path="../pb_data/types.d.ts" />
/**
 * first_setup.pb.js — offline "set your own credentials" endpoint.
 * ----------------------------------------------------------------------------
 * The install creates a default account (admin@localhost.com). On first login
 * the app forces the person to set their OWN email + password. Changing an email
 * normally needs an SMTP confirmation flow, so this endpoint applies the change
 * server-side with app privileges — no mail server required.
 *
 * POST /api/jdin/first-setup   body: { "email": "...", "password": "..." }
 * Requires a valid auth token; only ever changes the caller's own record.
 */
routerAdd("POST", "/api/jdin/first-setup", (e) => {
  const user = e.auth;
  if (!user) {
    throw new UnauthorizedError("You must be signed in.");
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
