/// <reference path="../pb_data/types.d.ts" />
/**
 * Adds a HIDDEN `calendarToken` field to users — the secret that authorizes the
 * read-only ICS calendar feed (GET /api/jdin/calendar/{token}.ics). Hidden so it
 * is never exposed through the record API; only the server-side calendar
 * endpoints read/rotate it. Empty string = feed disabled (the feature is opt-in).
 *
 * Incremental add (not a full-snapshot import) so it can't clobber any other
 * users-collection changes that landed after this file was written.
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  let exists = false;
  try { exists = !!users.fields.getByName("calendarToken"); } catch (_) {}
  if (!exists) {
    users.fields.add(new TextField({
      name: "calendarToken",
      max: 64,
      hidden: true,        // never returned by the record API
      presentable: false,
      required: false,
    }));
    app.save(users);
  }
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  try {
    const f = users.fields.getByName("calendarToken");
    if (f) { users.fields.removeById(f.id); app.save(users); }
  } catch (_) {}
});
