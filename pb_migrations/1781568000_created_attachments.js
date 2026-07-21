/// <reference path="../pb_data/types.d.ts" />
/**
 * Creates the `attachments` collection that backs real file uploads.
 * ----------------------------------------------------------------------------
 * Before this, attachments were base64 `dataUrl` strings embedded inside the
 * users.appData JSON blob — re-serialized and re-uploaded on every save. This
 * collection stores the raw binary as a PocketBase `file` (multipart upload,
 * served from /api/files/...). The web app keeps only a light pointer
 * { recordId, filename, name, type, size } on the task.
 *
 * Each row is owned by a user; the rules below ensure a user can only see /
 * create / delete their own files. The `task` column is the client-side task id
 * (the same 15-char id used inside appData) so we don't couple to the separate
 * `tasks` collection.
 *
 * PocketBase v0.22+ JSVM migration API. Auto-applies on the next PB restart.
 * If your server predates the flattened-field syntax, create the collection by
 * hand in the admin UI with the same fields/rules (see attachments setup notes).
 * ============================================================================ */
migrate((app) => {
  // Resolve the auth (users) collection id dynamically — more robust than
  // hardcoding "_pb_users_auth_" across differently-provisioned instances.
  const usersCollectionId = app.findCollectionByNameOrId("users").id;

  const collection = new Collection({
    type: "base",
    name: "attachments",
    // Only the owner can read/write their rows. Files themselves are served via
    // the file token the SDK appends, so listing is still owner-scoped.
    listRule: "@request.auth.id != \"\" && owner = @request.auth.id",
    viewRule: "@request.auth.id != \"\" && owner = @request.auth.id",
    createRule: "@request.auth.id != \"\" && owner = @request.auth.id",
    updateRule: "@request.auth.id != \"\" && owner = @request.auth.id",
    deleteRule: "@request.auth.id != \"\" && owner = @request.auth.id",
    fields: [
      {
        name: "file",
        type: "file",
        required: true,
        maxSelect: 1,
        maxSize: 10485760, // 10 MB, matches the client-side cap
      },
      {
        name: "owner",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: usersCollectionId,
        cascadeDelete: true,
      },
      {
        name: "task",
        type: "text",
        required: false,
        max: 64,
      },
      {
        name: "name",
        type: "text",
        required: false,
        max: 512,
      },
      {
        name: "type",
        type: "text",
        required: false,
        max: 255,
      },
      {
        name: "size",
        type: "number",
        required: false,
      },
      {
        name: "created",
        type: "autodate",
        onCreate: true,
        onUpdate: false,
      },
    ],
  });

  app.save(collection);
}, (app) => {
  // down-migration: drop the collection
  const collection = app.findCollectionByNameOrId("attachments");
  app.delete(collection);
});
