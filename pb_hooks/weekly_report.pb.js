/// <reference path="../pb_data/types.d.ts" />
/**
 * weekly_report.pb.js — thin entrypoint for the "week in review" emailer.
 * ----------------------------------------------------------------------------
 * PocketBase's JSVM runs cron/event handlers in an ISOLATED context that does
 * NOT have access to the other top-level functions declared in the same file.
 * So this file does almost nothing except register the schedule; all the real
 * logic lives in weekly_report_core.js, which is require()d *inside* the handler
 * (where require + the $app globals are available). This is the documented
 * PocketBase pattern and avoids "ReferenceError: <fn> is not defined" at runtime.
 *
 * Both files must sit together in pb_hooks/. See WEEKLY_REPORT_SETUP.md.
 * ============================================================================ */

// Read CONFIG once at startup just to choose the schedule (every-minute in test
// mode, otherwise the real weekly cron). require() works at file top-level too.
var CONFIG = require(`${__hooks}/weekly_report_core.js`).CONFIG;

var SCHEDULE = CONFIG.testMode ? "* * * * *" : CONFIG.cron;

cronAdd(
  "jdinWeeklyReport",
  SCHEDULE,
  function () {
    // require INSIDE the handler so the whole module (and all its helpers) is
    // loaded into the cron's runtime with everything in scope.
    require(`${__hooks}/weekly_report_core.js`).runWeeklyReport();
  }
);

// Startup confirmation — on every PocketBase boot this prints one line so you
// can verify the hook actually loaded and on which schedule. The server's clock
// is shown so you can sanity-check its timezone (cron uses SERVER local time).
// Look for "[weeklyReport] registered" in the PocketBase logs after a restart.
$app.logger().info(
  "[weeklyReport] registered job 'jdinWeeklyReport' schedule='" + SCHEDULE + "'" +
  (CONFIG.testMode ? " (TEST MODE: every minute → " + CONFIG.testEmail + ")" : "") +
  " serverTimeNow=" + new Date().toString()
);
