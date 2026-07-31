/// <reference path="../pb_data/types.d.ts" />
/**
 * Creates the `habits` collection — the per-row mirror of the user's habits.
 * ----------------------------------------------------------------------------
 * Habits have always lived in the users.appData JSON blob (still the source of
 * truth, read by the weekly-report and habit-alert hooks). This collection gives
 * them a visible, queryable per-row mirror the web app now keeps in sync:
 * create/check-off/delete each write here, and a one-time boot back-fill seeds
 * any habits that predate the mirror. `deleted_at` matches the tasks pattern
 * (empty = active); the app hard-deletes rows rather than soft-deleting habits.
 *
 * Existence-guarded: instances where `habits` was already created by hand (e.g.
 * the hosted production server) are left completely untouched. Fresh self-hosted
 * installs get it automatically on the next PocketBase restart.
 *
 * PocketBase v0.22+ JSVM migration API (flattened-field syntax).
 * ============================================================================ */
migrate((app) => {
  let exists = false;
  try { exists = !!app.findCollectionByNameOrId("habits"); } catch (_) {}
  if (exists) return;

  const usersCollectionId = app.findCollectionByNameOrId("users").id;

  const collection = new Collection({
    type: "base",
    name: "habits",
    // Owner-scoped, same shape as tasks/alerts. `?=` matches the multi-relation.
    listRule: "user.id ?= @request.auth.id",
    viewRule: "user.id ?= @request.auth.id",
    createRule: "@request.auth.id != \"\"",
    updateRule: "user.id ?= @request.auth.id",
    deleteRule: "user.id ?= @request.auth.id",
    fields: [
      {
        name: "user",
        type: "relation",
        required: false,
        minSelect: 0,
        maxSelect: 10,
        collectionId: usersCollectionId,
        cascadeDelete: false,
      },
      {
        name: "title",
        type: "text",
        required: false,
        max: 0,
      },
      {
        name: "color",
        type: "text",
        required: false,
        max: 0,
      },
      {
        name: "history",
        type: "json",
        required: false,
        maxSize: 2000000,
      },
      {
        name: "deleted_at",
        type: "date",
        required: false,
      },
      {
        name: "created",
        type: "autodate",
        onCreate: true,
        onUpdate: false,
      },
      {
        name: "updated",
        type: "autodate",
        onCreate: true,
        onUpdate: true,
      },
    ],
  });

  app.save(collection);
}, (app) => {
  // down-migration: drop the collection (only if this migration created it)
  try {
    const collection = app.findCollectionByNameOrId("habits");
    if (collection) app.delete(collection);
  } catch (_) {}
});
