# @dskripchenko/board

An infinite whiteboard for Vue 3: shapes, sticky notes, frames, titles and
text, connectors and emoji — with a zero-dependency TypeScript core you can
use without Vue (model, geometry, undoable operations, SVG export).

- **Objects:** eight shapes (rectangle, rounded, ellipse, diamond, triangle,
  parallelogram, hexagon, star), sticky notes in eight colours with
  auto-fitting text, titles and text, frames that carry their contents,
  connectors (straight, elbow, curve; arrows, labels, dashed) attached to
  objects, emoji.
- **Editing:** pan and zoom, marquee and shift selection, move with snapping
  guides, resize and rotate (one object or a group), in-place text editing,
  align and distribute, frame a selection, stacking order, duplicate,
  copy and paste, lock, undo and redo, keyboard shortcuts.
- **Views:** minimap, fit to screen, light and dark themes (the page's
  `data-theme` / `data-color-mode`), read-only viewer.
- **Export:** PNG, SVG and JSON — the export uses the same renderer as the
  screen.
- **Fast:** only what is on screen is drawn; 5 000 objects pan at 60 fps.
- **Built for real-time collaboration:** every change is a batch of
  per-object operations with an exact inverse — the unit the sync protocol
  sends (see the roadmap).

## Install

```bash
npm install @dskripchenko/board @dskripchenko/ui vue
```

## Vue

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { BoardEditor } from '@dskripchenko/board/vue'
import '@dskripchenko/ui/styles/all.css'
import '@dskripchenko/board/style.css'
import type { Board } from '@dskripchenko/board'

const board = ref<Board>({ version: 1, objects: {} })
</script>

<template>
  <BoardEditor v-model="board" style="height: 720px" @change="({ ops }) => console.log(ops)" />
</template>
```

| Prop | | |
|---|---|---|
| `modelValue` | `Board \| string \| null` | The board, an object or JSON text. |
| `readonly` | `boolean` | Viewer: pan, zoom, minimap, export. |
| `locale` | `string` | `ru` or `en` (default: the page's `lang`). |
| `labels` | `Partial<BoardLabels>` | Override any interface text. |
| `minimap` | `boolean` | Show the minimap initially (default `true`). |

Events: `update:modelValue`, `change` (`{ board, ops, origin }`),
`selection` (ids). Exposed: `applyRemote(ops)`, `fit()`, `select(ids)`,
`toPng()`, `toSvg()`, `zoomTo(k)`. `BoardView` is the read-only editor.

## Core

```ts
import { parseBoard, createObject, moveObjects, applyOps, boardToSvg } from '@dskripchenko/board'

let board = parseBoard(json)
const { id, ops } = createObject(board, 'sticky', { x: 0, y: 0 }, { text: 'Hello', color: 'pink' })
board = applyOps(board, ops).board
board = applyOps(board, moveObjects(board, [id], 40, 0)).board
const { svg } = boardToSvg(board)
```

## Keyboard

| Keys | |
|---|---|
| V, H, N, S, T, F, L, E | Select, hand, sticky, shape, text, frame, connector, emoji |
| Double click | New sticky; on an object — edit its text |
| Space + drag, wheel | Pan; Ctrl/⌘ + wheel or pinch — zoom |
| Shift + 1 | Fit to screen |
| Ctrl/⌘ + Z, Shift + Ctrl/⌘ + Z | Undo, redo |
| Ctrl/⌘ + A, D, C, X, V | Select all, duplicate, copy, cut, paste |
| Ctrl/⌘ + ], [ | Bring to front, send to back |
| Arrows (Shift) | Nudge by 1 (10) |
| Delete | Delete |

## Roadmap

1. Editor (this release).
2. Real-time collaboration: server-ordered operation batches, per-property
   last-writer-wins, presence (cursors, selections).
3. `<dsk-board>` in [@dskripchenko/embed](https://github.com/dskripchenko/embed).

## License

MIT
