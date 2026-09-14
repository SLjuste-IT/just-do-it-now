/// <reference path="../pb_data/types.d.ts" />
/**
 * Creates the `notes` collection — the per-row mirror of the user's notes.
 * ----------------------------------------------------------------------------
 * Notes live in the users.appData JSON blob (the source of truth the web app
 * reads). This collection gives them a visible, queryable per-row mirror the app
 * keeps in sync: create/edit/delete each write here. `deleted_at` matches the
 * tasks/habits pattern (empty = active); trashing a note sets it, restoring
 * clears it, "delete forever" hard-deletes the row.
 *
 * Existence-guarded: an install where `notes` was already created by hand (e.g.
 * the hosted production server) is left untouched. Fresh self-hosted installs
 * get it automatically on the next PocketBase restart.
 *
 * PocketBase v0.22+ JSVM migration API (flattened-field syntax).
 * ============================================================================ */
migrate((app) => {
  let exists = false;
  try { exists = !!app.findCollectionByNameOrId("notes"); } catch (_) {}
  if (exists) return;

  const usersCollectionId = app.findCollectionByNameOrId("users").id;

  const collection = new Collection({
    type: "base",
    name: "notes",
    // Owner-scoped, same shape as tasks/habits. `?=` matches the multi-relation.
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
        name: "body",
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
        name: "pinned",
        type: "bool",
        required: false,
      },
      {
        name: "tags",
        type: "json",
        required: false,
        maxSize: 200000,
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
    const collection = app.findCollectionByNameOrId("notes");
    if (collection) app.delete(collection);
  } catch (_) {}
});
