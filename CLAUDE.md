# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Light the Way is a one-goal daily habit app: the user pastes a day-by-day plan from Claude, does one task a day, and each finished task lights a lantern on a winding path. Plain HTML/CSS/JS, no framework, no build step, no dependencies, no tests.

- Live site: https://yadavruturaj.github.io/light-the-way/ (GitHub Pages serves `main` from the repo root, so a push to `main` deploys in about a minute)
- All data stays in the browser's `localStorage`. There is no server.

## Running locally

Serve the folder over HTTP and open `http://localhost:<port>/`. From the parent `practice` folder, the `light-the-way` preview configuration in `.claude/launch.json` does this on port 5517. Opening `index.html` directly also works in a normal browser, but not in the preview pane, which blocks storage for `file://` pages.

To test a scenario, write a state object to `localStorage['light-the-way:v1']` and reload. Dates are local `YYYY-MM-DD` strings, so you can backdate `doneOn`, `tinyDays`, `goal.startedOn` and `pause` to simulate past days. Clear the key when done.

## Architecture

Three classic scripts load in order and share data through globals (no modules, so it works without a server):

1. `quotes.js` sets `window.LTW_QUOTES`.
2. `path.js` sets `window.LTW_drawPath(container, tasks, { justLit })`. It is pure rendering: it builds the SVG from the task list and holds no state.
3. `app.js` is one IIFE that owns everything else: the state object, persistence, the screens and all event handlers.

`index.html` contains every screen up front: `#setup`, `#plan`, `#today` and `#finished`, plus cards inside `#today` (`#task-card`, `#done-card`, `#paused-card`). `render()` picks which one to show from the state and toggles them with the `hidden` attribute. Don't build screens dynamically; add markup to `index.html` and toggle it.

### State (`localStorage` key `light-the-way:v1`)

```
{ goal: { goal, why, minutes, when, where, startedOn } | null,
  tasks: [{ day, text, tiny, doneOn, tinyDays: [], feeling }],
  draft: { step, goal, ..., paste } | null,   // setup in progress
  pause: { from, until | null, checkedAt } | null,
  pauses: [{ from, to }],                     // past rests
  lastQuote }
```

When the shape changes, update `migrate()` in `app.js`. It runs on load and on restoring a backup, so older saved data and backup files keep working. Backups are this same object exported as JSON.

### Rules that span files

- **Tasks are always finished in order.** "Today's task" is the first task without `doneOn`, so finished tasks form a prefix. `path.js` relies on this to draw the lit part of the route.
- **One action per day.** Finishing a task (`doneOn = today`) or doing its tiny version (adding today to `tinyDays`) both count as showing up.
- **The tiny version never finishes a task.** It counts for the streak, and the lantern gets the `glimmer` state until the full task is done.
- **`feeling`** (`easy` / `ok` / `hard`) only applies to finished tasks. It sets the lantern colour classes `feel-*`, and hard days also get a larger ember glow and a spark shape.
- **Streak with grace** (`streak()`): one missed day keeps the streak, two in a row end it, and paused days are skipped. The "don't miss twice" nudge uses the same rules.
- **Pause**: a pause with an end date ends itself in `checkPauseExpiry()` (called from `render()`). Rest days are recorded in `pauses` so the streak ignores them. A check-in appears every 14 days of rest, tracked by `pause.checkedAt`.
- **The plan parser** (`parsePlan`) expects the lines that `buildPrompt` asks Claude for (`Day N: task | Tiny: tiny task`) but tolerates markdown, bullets and numbered lists. Change both together.

### Platform limits

The app uses `<dialog>` for confirmations, never `confirm()`. Starting over or restoring a backup must always ask first. The page uses a single dark "night" theme on purpose; colours are CSS variables at the top of `styles.css`.

## Conventions

- Commit each feature separately with a clear message, push to `main`, and tag releases (`v1.0`, `v1.1`, ...).
- Add each release to "Version history" in `README.md`.
- Keep the code readable for a beginner: plain JavaScript, short comments that explain why.
- The owner asked that the app show no personal or religious greeting.
