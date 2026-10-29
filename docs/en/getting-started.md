# Getting started

## Install

```bash
npm install @dskripchenko/board
```

The package has two entry points:

- `@dskripchenko/board` — the core: the board model, parsing, geometry,
  editing commands, undo history, the SVG renderer and export, and the
  real-time sync engine. Plain TypeScript with no dependencies and no DOM;
  it runs in a browser, in Node 20+ and in a worker.
- `@dskripchenko/board/vue` — `BoardEditor` and `BoardView`. They need Vue
  3.4+ and [`@dskripchenko/ui`](https://github.com/dskripchenko/ui) 1.17+,
  declared as optional peer dependencies:

```bash
npm install @dskripchenko/ui vue
```

## An editor in a page

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { BoardEditor } from '@dskripchenko/board/vue'
import type { Board } from '@dskripchenko/board'
import '@dskripchenko/ui/styles/all.css'
import '@dskripchenko/board/style.css'

const board = ref<Board>({ version: 1, objects: {} })
</script>

<template>
  <BoardEditor v-model="board" style="height: 720px" />
</template>
```

The editor fills its container: give the container a height. `v-model`
holds the board as JSON — store it as is and pass it back later. The
interface follows the page's language (`<html lang>`: Russian or English)
and theme (`data-theme` or `data-color-mode` set to `dark`).

## A read-only board

```vue
<BoardView :board="savedJson" style="height: 480px" />
```

Readers can pan, zoom, use the minimap and export, but not edit.

## Without Vue

The core edits and renders boards anywhere — in a Node service, a worker, a
test:

```ts
import { parseBoard, createObject, applyOps, boardToSvg } from '@dskripchenko/board'

let board = parseBoard(json) // checks the structure, fills defaults
const { id, ops } = createObject(board, 'sticky', { x: 0, y: 0 }, { text: 'Release on Friday', color: 'pink' })
board = applyOps(board, ops).board

const { svg, width, height } = boardToSvg(board, { background: '#ffffff' })
```

## Collaboration

Pass a provider and the editor becomes collaborative — see
[Collaboration](collaboration.md):

```vue
<BoardEditor :provider="httpProvider({ base: '/api/boards/42' })" :user="{ name: 'Anna' }" />
```

## Next

- [Model](model.md) — the board JSON and the objects.
- [Editor](editor.md) — tools, keyboard, props, events, export.
- [Collaboration](collaboration.md) — the protocol, providers, the HTTP
  contract and the reference server.
