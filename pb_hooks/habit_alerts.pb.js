/// <reference path="../pb_data/types.d.ts" />
/**
 * habit_alerts.pb.js — thin entrypoint for the "habit starts soon" emailer.
 * ----------------------------------------------------------------------------
 * PocketBase's JSVM runs cron/event handlers in an ISOLATED context that does
 * NOT have access to the other top-level functions declared in the same file.
 * So this file does almost nothing except register the schedule; all the real
 * logic lives in habit_alerts_core.js, which is require()d *inside* the handler.
 * Same pattern as weekly_report.pb.js — both files must sit together in pb_hooks/.
 *
 * The job runs every minute and matches habits whose (alertTime - leadMinutes)
 * equals the user's current wall-clock minute, so each habit reminds exactly
 * once per day with no stored state.
 * ============================================================================ */

var CONFIG = require(`${__hooks}/habit_alerts_core.js`).CONFIG;

cronAdd(
  "jdinHabitAlerts",
  "* * * * *",
  function () {
    require(`${__hooks}/habit_alerts_core.js`).runHabitAlerts();
  }
);

// Startup confirmation — look for "[habitAlerts] registered" in the PocketBase
// logs after a restart to verify the hook loaded.
$app.logger().info(
  "[habitAlerts] registered job 'jdinHabitAlerts' (every minute) lead=" +
  CONFIG.leadMinutes + "m" +
  (CONFIG.testMode ? " (TEST MODE → " + CONFIG.testEmail + ")" : "") +
  " serverTimeNow=" + new Date().toString()
);
