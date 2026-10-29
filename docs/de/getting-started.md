# Erste Schritte

## Installation

```bash
npm install @dskripchenko/board
```

Das Paket hat zwei Einstiegspunkte:

- `@dskripchenko/board` — der Kern: das Board-Modell, Parsing, Geometrie,
  Bearbeitungsbefehle, Undo-Verlauf, der SVG-Renderer und Export sowie die
  Echtzeit-Synchronisations-Engine. Reines TypeScript ohne Abhängigkeiten und
  ohne DOM; läuft im Browser, in Node 20+ und in einem Worker.
- `@dskripchenko/board/vue` — `BoardEditor` und `BoardView`. Sie benötigen
  Vue 3.4+ und [`@dskripchenko/ui`](https://github.com/dskripchenko/ui) 1.17+,
  deklariert als optionale Peer-Abhängigkeiten:

```bash
npm install @dskripchenko/ui vue
```

## Ein Editor auf einer Seite

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

Der Editor füllt seinen Container aus: Geben Sie dem Container eine Höhe.
`v-model` enthält das Board als JSON — speichern Sie es unverändert und
übergeben Sie es später wieder. Die Oberfläche folgt der Sprache der Seite
(`<html lang>`: Russisch oder Englisch) und dem Theme (`data-theme` oder
`data-color-mode` auf `dark` gesetzt).

## Ein schreibgeschütztes Board

```vue
<BoardView :board="savedJson" style="height: 480px" />
```

Leser können verschieben, zoomen, die Minikarte nutzen und exportieren, aber
nicht bearbeiten.

## Ohne Vue

Der Kern bearbeitet und rendert Boards überall — in einem Node-Dienst, einem
Worker, einem Test:

```ts
import { parseBoard, createObject, applyOps, boardToSvg } from '@dskripchenko/board'

let board = parseBoard(json) // checks the structure, fills defaults
const { id, ops } = createObject(board, 'sticky', { x: 0, y: 0 }, { text: 'Release on Friday', color: 'pink' })
board = applyOps(board, ops).board

const { svg, width, height } = boardToSvg(board, { background: '#ffffff' })
```

## Zusammenarbeit

Übergeben Sie einen Provider, und der Editor wird kollaborativ — siehe
[Zusammenarbeit](collaboration.md):

```vue
<BoardEditor :provider="httpProvider({ base: '/api/boards/42' })" :user="{ name: 'Anna' }" />
```

## Weiter

- [Modell](model.md) — das Board-JSON und die Objekte.
- [Editor](editor.md) — Werkzeuge, Tastatur, Props, Events, Export.
- [Zusammenarbeit](collaboration.md) — das Protokoll, Provider, der
  HTTP-Vertrag und der Referenzserver.
