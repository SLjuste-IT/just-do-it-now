/// <reference path="../pb_data/types.d.ts" />
/**
 * Heals the `projects` collection API rules.
 * ----------------------------------------------------------------------------
 * The imported schema shipped `projects` with:
 *   createRule: null                                  (superusers only!)
 *   list/view/update/delete: "@request.auth.id = tasks_via_project.user.id"
 *
 * Two problems on a fresh install:
 *   1. createRule = null means a normal signed-in user CANNOT create a project
 *      or a roadmap (roadmaps are projects) — the API rejects it.
 *   2. The back-relation rule uses single "=" (should be "?=") and, worse, gates
 *      access on the project already having a linked task — so a brand-new empty
 *      project is invisible to its own owner.
 *
 * The app writes the owner id into the plain-text `projects.user` field on every
 * create (projectToPBPayload sets user = auth id), so owner-scoping by simple
 * text equality is correct and needs no field-type change or data migration.
 *
 * GUARDED: only rewrites the rules when createRule is still the broken default
 * (null). Instances that were already hand-fixed (e.g. hosted production) are
 * left untouched, so this can't clobber a working custom configuration.
 */
migrate((app) => {
  const projects = app.findCollectionByNameOrId("projects");
  if (projects.createRule === null) {
    projects.listRule   = "user = @request.auth.id";
    projects.viewRule   = "user = @request.auth.id";
    projects.createRule = "@request.auth.id != \"\"";
    projects.updateRule = "user = @request.auth.id";
    projects.deleteRule = "user = @request.auth.id";
    app.save(projects);
  }
}, (app) => {
  // Revert to the previous committed rules (best-effort).
  try {
    const projects = app.findCollectionByNameOrId("projects");
    projects.listRule   = "@request.auth.id = tasks_via_project.user.id";
    projects.viewRule   = "@request.auth.id = tasks_via_project.user.id";
    projects.createRule = null;
    projects.updateRule = "@request.auth.id = tasks_via_project.user.id";
    projects.deleteRule = "@request.auth.id = tasks_via_project.user.id";
    app.save(projects);
  } catch (_) {}
});
