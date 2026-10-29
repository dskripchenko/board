# @dskripchenko/board

## 0.1.2

### Patch Changes

- 14a3792: The Vue entry bundles its icons (with the Lucide license): it imports only `vue` and `@dskripchenko/ui` at run time, so it works from a CDN import map (as `@dskripchenko/embed` loads it).

## 0.1.1

### Patch Changes

- 00008d2: Real-time sync sends a drag as a few intermediate positions instead of every pointer move: local changes go out at most every 80 ms (`flushInterval`), and the changes of one object in that window merge into one operation (`compactOps`). The others no longer fall behind or lose frames while someone moves objects.

## 0.1.0

The first release.

- A zero-dependency TypeScript core: the board model (shapes, sticky notes,
  text and titles, frames, connectors, emoji, freehand strokes), strict
  parsing, fractional stacking order, operations with exact inverses,
  geometry and hit testing, editing commands, undo history, one SVG renderer
  for the screen and for export.
- `BoardEditor` and `BoardView` for Vue 3 on `@dskripchenko/ui`: tools,
  snapping guides, resize and rotate (one object or a group), in-place text,
  pen, marker and eraser, clipboard, keyboard shortcuts, a context bar,
  minimap, PNG / SVG / JSON export, light and dark themes, Russian and
  English.
- Real-time collaboration: server-ordered batches, a rebasing client,
  presence (cursors, selections, avatars), `MemoryHub` and `httpProvider`,
  and `BoardServer` as the reference server logic.
