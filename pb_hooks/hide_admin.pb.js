/// <reference path="../pb_data/types.d.ts" />
/**
 * hide_admin.pb.js — keep end-users inside the app, out of PocketBase.
 * ----------------------------------------------------------------------------
 * Returns 404 for the /_/ dashboard so a distributed install exposes only the
 * app (/) and its per-user-locked API (/api/*).
 *
 * SELF-HOST ONLY: registers only when the service sets JDIN_SELFHOST=1 (both
 * installers do). On any other deployment — e.g. the author's production
 * server, which USES the dashboard — this file is inert, so copying pb_hooks/
 * there can never lock the operator out.
 *
 * Operator escape hatch on self-host installs:
 *   systemctl set-environment SHOW_ADMIN=1 && systemctl restart just-do-it-now
 */
if ($os.getenv("JDIN_SELFHOST") === "1") {
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
}
