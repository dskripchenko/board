# @dskripchenko/board

[![CI](https://github.com/dskripchenko/board/actions/workflows/ci.yml/badge.svg)](https://github.com/dskripchenko/board/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dskripchenko/board)](https://www.npmjs.com/package/@dskripchenko/board)

An infinite whiteboard for Vue 3: shapes, sticky notes, frames, titles and
text, connectors and emoji — with a zero-dependency TypeScript core you can
use without Vue (model, geometry, undoable operations, SVG export).

- **Objects:** eight shapes (rectangle, rounded, ellipse, diamond, triangle,
  parallelogram, hexagon, star), sticky notes in eight colours with
  auto-fitting text, titles and text, frames that carry their contents,
  connectors (straight, elbow, curve; arrows, labels, dashed) attached to
  objects, emoji, pen and marker strokes.
- **Editing:** pan and zoom, marquee and shift selection, move with snapping
  guides, resize and rotate (one object or a group), in-place text editing,
  align and distribute, frame a selection, stacking order, duplicate,
  copy and paste, lock, undo and redo, keyboard shortcuts.
- **Views:** minimap, fit to screen, light and dark themes (the page's
  `data-theme` / `data-color-mode`), read-only viewer.
- **Export:** PNG, SVG and JSON — the export uses the same renderer as the
  screen.
- **Fast:** only what is on screen is drawn; 5 000 objects pan at 60 fps.
- **Real-time collaboration:** several people edit at once — changes,
  cursors and selections travel live; a server orders the changes and every
  client converges to the same board. Any transport: HTTP long polling out of
  the box, WebSockets in a few lines.

## Documentation

| | English | Русский | Deutsch | 中文 |
|---|---|---|---|---|
| Getting started | [en](docs/en/getting-started.md) | [ru](docs/ru/getting-started.md) | [de](docs/de/getting-started.md) | [zh](docs/zh/getting-started.md) |
| Model | [en](docs/en/model.md) | [ru](docs/ru/model.md) | [de](docs/de/model.md) | [zh](docs/zh/model.md) |
| Editor | [en](docs/en/editor.md) | [ru](docs/ru/editor.md) | [de](docs/de/editor.md) | [zh](docs/zh/editor.md) |
| Workshop templates | [en](docs/en/templates.md) | [ru](docs/ru/templates.md) | [de](docs/de/templates.md) | [zh](docs/zh/templates.md) |
| Collaboration | [en](docs/en/collaboration.md) | [ru](docs/ru/collaboration.md) | [de](docs/de/collaboration.md) | [zh](docs/zh/collaboration.md) |

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
Props `provider` and `user` make it collaborative — see
[Collaboration](docs/en/collaboration.md).

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
| V, H, N, S, T, F, L, E, P, M, X | Select, hand, sticky, shape, text, frame, connector, emoji, pen, marker, eraser |
| Double click | New sticky; on an object — edit its text |
| Space + drag, wheel | Pan; Ctrl/⌘ + wheel or pinch — zoom |
| Shift + 1 | Fit to screen |
| Ctrl/⌘ + Z, Shift + Ctrl/⌘ + Z | Undo, redo |
| Ctrl/⌘ + A, D, C, X, V | Select all, duplicate, copy, cut, paste |
| Ctrl/⌘ + ], [ | Bring to front, send to back |
| Arrows (Shift) | Nudge by 1 (10) |
| Delete | Delete |

## Roadmap

- `<dsk-board>` in [@dskripchenko/embed](https://github.com/dskripchenko/embed).
- A board macro for Confluence Data Center.
- Erasing part of a stroke; live strokes of others while they draw.

## License

MIT
