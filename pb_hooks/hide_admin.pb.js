/// <reference path="../pb_data/types.d.ts" />
/**
 * hide_admin.pb.js — keep end-users inside the app, out of PocketBase.
 * ----------------------------------------------------------------------------
 * A distributed self-hosted app should expose ONLY the to-do app (/) and its
 * API (/api/*, which is locked down per-user by collection rules). PocketBase
 * always serves its superuser dashboard at /_/, so this hook returns 404 for
 * those requests — to a visitor the dashboard simply isn't there.
 *
 * The operator still manages the backend:
 *   • superuser accounts via the CLI:   ./pocketbase superuser upsert EMAIL PASS
 *   • to use the dashboard itself (e.g. to configure SMTP), start the service
 *     once with the env var SHOW_ADMIN=1, do the work, then remove it + restart:
 *         systemctl set-environment SHOW_ADMIN=1   # (or Environment= in the unit)
 *         systemctl restart just-do-it-now
 *
 * Fail-open by design: if the request path can't be read for any reason the
 * request is passed straight through, so this hook can never break the app.
 */
routerUse((e) => {
  let path = "";
  try {
    path = String(e.request.url.path || "");
  } catch (_) {
    path = "";
  }

  const isDashboard = path === "/_" || path === "/_/" || path.indexOf("/_/") === 0;

  if (isDashboard && $os.getenv("SHOW_ADMIN") !== "1") {
    throw new NotFoundError();
  }

  return e.next();
});
