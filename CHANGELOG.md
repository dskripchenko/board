# @dskripchenko/board

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
  and `BoardServer` as the reference server logic. Local changes go out at
  most every 80 ms, merged per object, so a drag sends a few intermediate
  positions rather than every pointer move.
