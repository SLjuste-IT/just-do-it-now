/// <reference path="../pb_data/types.d.ts" />
/**
 * Adds a `deleted_at` date field to the `tasks` collection so the per-row mirror
 * can carry a soft-delete stamp that matches the app's Trash.
 *
 * The app's real source of truth is the users.appData JSON blob; this field just
 * keeps the tasks mirror truthful: empty = active, set = in Trash. Trashing a
 * task stamps it, restoring clears it, and "Delete forever" hard-deletes the row.
 *
 * Incremental + existence-checked so it is idempotent — servers where the field
 * was already added by hand (e.g. the hosted production instance) are untouched.
 */
migrate((app) => {
  const tasks = app.findCollectionByNameOrId("tasks");
  let exists = false;
  try { exists = !!tasks.fields.getByName("deleted_at"); } catch (_) {}
  if (!exists) {
    tasks.fields.add(new DateField({
      name: "deleted_at",
      presentable: false,
      required: false,
    }));
    app.save(tasks);
  }
}, (app) => {
  const tasks = app.findCollectionByNameOrId("tasks");
  try {
    const f = tasks.fields.getByName("deleted_at");
    if (f) { tasks.fields.removeById(f.id); app.save(tasks); }
  } catch (_) {}
});
