# Roadmap — design

**Date:** 2026-07-18
**Status:** approved
**Scope:** roadmaps only. Notes and journal are deliberately excluded — see "Not in scope".

## Problem

The app can already express a plan, but only awkwardly. To lay out "learn Linux this week"
you create a project, add tasks one at a time, then open each task's modal and hand-pick its
prerequisite. The machinery works; the authoring flow doesn't match how someone thinks about
a plan, and there is no view that shows a plan *as a path* — where you are, what's next, how
far to the end.

## What already exists

Roughly two thirds of the hard parts are built:

- `dependencies[]` on every task — real prerequisite links
- `dependsOnTransitively()` — cycle rejection when adding a dependency
- `recomputeSchedule()` — topological forward date propagation with cycle-breaking
- `renderTimelineHTML()` — SVG chart already drawing bezier arrows between linked tasks
- `logTaskActivity()` — per-task audit trail
- `applyTaskStatus()` — single coherent status/completed mutation point
- Task lifecycle: `New / In Progress / Review / Completed`, `dueDate` + `dueTime`, subtasks,
  notes (markdown), focus timer, attachments
- Projects with `startDate` / `endDate` / `color` / `status` / `priority`

Persistence rides in the `appData` JSON blob, so new fields need no PocketBase migration.

## Decisions

Four decisions were made explicitly during design:

1. **A roadmap step IS a task.** A roadmap is a project; its steps are ordinary tasks wired in
   sequence. Everything downstream — Calendar, Upcoming, Alerts, focus timer, analytics, the
   weekly email report — keeps working with no new integration.
2. **Paths are strictly linear.** One step at a time, start to finish. `dependencies[]` already
   supports a DAG, so branching can be added later with no data migration.
3. **Dates come from a start date plus a per-step duration.** Change the start or any duration
   and everything after recomputes. Hand-editing a step's date in the task modal still works.
4. **Only the current step appears in do-it-now lists.** My Tasks, Upcoming and Alerts show the
   step you can act on; the next appears when you tick it off. Calendar, Timeline and the
   Roadmap view always show the whole plan, so nothing is hidden — only de-cluttered.

## Data model

Three new fields. No PocketBase schema change; all of it lives in `appData`.

| Field | On | Type | Purpose |
|---|---|---|---|
| `isRoadmap` | project | boolean | Marks this project as a roadmap |
| `roadmapStart` | project | `YYYY-MM-DD` | Anchors step 1's due date |
| `roadmapStartTime` | project | `HH:MM` | Anchors step 1's due time |
| `durationDays` | task | number | How long this step takes; drives the gap to the next step |

**Step order is derived, never stored.** It is recovered by walking the dependency chain from
the step that has no roadmap-internal prerequisite. Storing an explicit index would let order
drift out of sync with the actual links; deriving it cannot.

`normalizeTask()` gains a `durationDays` sanitizer (non-negative integer, default 1), matching
how it already repairs `focusSeconds`.

## Scheduling

`recomputeSchedule()` currently spaces dependents by a fixed constant:

```js
const SCHEDULE_LAG_DAYS = 0;
// ...
if (pd) { const cand = _addDays(pd, SCHEDULE_LAG_DAYS); if (!due || cand > due) due = cand; }
```

The gap becomes the *prerequisite's* duration, because a step starts once its prerequisite
finishes:

```js
const lag = byId.get(depId)?.durationDays ?? SCHEDULE_LAG_DAYS;
if (pd) { const cand = _addDays(pd, lag); if (!due || cand > due) due = cand; }
```

Non-roadmap tasks have no `durationDays` and fall back to the existing constant, so current
behaviour is unchanged. Setting `roadmapStart` writes step 1's `dueDate`; the cascade does the
rest. Slipping a step already shifts everything after it and already records why via
`logTaskActivity()`.

## Components

### `roadmapChain(projectId)`
Walks the dependency chain and returns `{ chain: [task], orphans: [task] }`. The single source
of truth for order, progress and "which step is current". Tolerates a broken chain by returning
the walkable part plus whatever is left over, rather than throwing or silently dropping tasks.

### `isLockedRoadmapStep(task)`
True when a task is on a roadmap, incomplete, and has an incomplete prerequisite. This is the
one predicate the list filtering depends on.

### `renderRoadmapView()`
Left: roadmaps with `done/total` progress. Right: the vertical stepper — done / current /
locked, each showing date, time and duration. Clicking a step opens the existing
`openTaskModal()`; there is no parallel editing UI.

### `addRoadmapStep(projectId, title, durationDays)`
Creates a task with `projectId` set and `dependencies: [lastStepId]`, then reruns the schedule.

### `createRoadmap(name, start, startTime, color)`
Creates a project with `isRoadmap: true`.

## Integration points

| Change | Location |
|---|---|
| Duration-aware lag | `recomputeSchedule()`, index.html ~5995 |
| Hide locked steps | `visibleTasksForMyList()`, ~4800 |
| Hide locked steps | `renderUpcoming()`, ~2979 |
| Hide locked steps | Alerts/reminders view |
| `durationDays` sanitizer | `normalizeTask()`, ~4386 |
| New view + nav entry | alongside the existing `view-*` sections |
| Render dispatch | `renderEverything()` / `switchView()` |

Calendar, Timeline and the Roadmap view are deliberately left unfiltered.

## Constraints

Three properties of this codebase that will silently break the feature if ignored:

- **Tailwind is precompiled.** Utility classes not already present in the build produce no CSS
  at all. Stepper connectors and the progress ring use plain CSS in a `<style>` block.
- **Themes are CSS variables.** Dark-mode rules must use `var(--surface*)` / `var(--accent)`.
  Hardcoding slate/indigo collapses every dark theme into one.
- **IIFE scope.** Anything reachable from injected markup must be exposed on `window.`
  explicitly, or it throws `ReferenceError` at call time.

## Addendum — linking and deleting (added 2026-07-18)

Two follow-up decisions, both implemented:

**A roadmap can be nested under a parent project.** `parentProjectId` on the roadmap points at a
plain project. Nested roadmaps stop rendering at the top level of the Projects view and instead
appear as child rows on their parent's card, showing `done/total`. Only non-roadmap projects are
offered as parents, which keeps the hierarchy one level deep and makes a parent cycle impossible
by construction rather than by validation.

The "is it nested?" test requires the parent to still exist. That makes the relationship
self-healing: delete the parent and the roadmap returns to the top level rather than vanishing.
`deleteProject()` also clears the dead `parentProjectId` so the stored blob doesn't keep a
dangling id.

**Deleting a roadmap moves its steps to Trash.** Steps keep their `dependencies[]` intact on the
way in, so restoring the whole set restores the chain; restoring one step on its own still renders
correctly because the dependency panel resolves missing prerequisites away. Deleting a roadmap
from the Projects view routes to the same path — otherwise the same roadmap would delete two
different ways depending on where you clicked, leaving steps loose but still chained.

## Not in scope

- **Notes and journal** — a separate feature sharing no logic with this one. Own spec.
- Branching or parallel paths (the data model already permits them; only rendering is deferred)
- Roadmap templates or generated roadmaps
- Drag-to-reorder steps
- Any PocketBase schema change

## Testing

Exercised in a browser against the running app, driving real user-facing functions:

- Chain derivation: linear chain, single step, empty roadmap, broken chain with orphans
- Scheduling: durations produce correct gaps; changing the start shifts the whole chain;
  a slipped step pushes only what follows it
- Non-roadmap tasks keep their current scheduling behaviour (regression)
- Locked steps absent from My Tasks / Upcoming, present in Calendar and the Roadmap view
- Completing a step unlocks exactly the next one
- Cycles remain impossible via the existing guard
