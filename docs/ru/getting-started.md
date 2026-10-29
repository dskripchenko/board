# Начало работы

## Установка

```bash
npm install @dskripchenko/board
```

У пакета две точки входа:

- `@dskripchenko/board` — ядро: модель доски, разбор, геометрия, команды
  редактирования, история отмены, SVG-рендерер и экспорт, движок
  синхронизации в реальном времени. Чистый TypeScript без зависимостей и без
  DOM; работает в браузере, в Node 20+ и в воркере.
- `@dskripchenko/board/vue` — `BoardEditor` и `BoardView`. Им нужны Vue
  3.4+ и [`@dskripchenko/ui`](https://github.com/dskripchenko/ui) 1.17+,
  объявленные как необязательные peer-зависимости:

```bash
npm install @dskripchenko/ui vue
```

## Редактор на странице

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

Редактор заполняет свой контейнер: задайте контейнеру высоту. `v-model`
хранит доску в виде JSON — сохраняйте его как есть и передавайте обратно
позже. Интерфейс следует языку страницы (`<html lang>`: русский или
английский) и теме (`data-theme` или `data-color-mode` со значением `dark`).

## Доска только для чтения

```vue
<BoardView :board="savedJson" style="height: 480px" />
```

Читатели могут перемещаться по доске, масштабировать её, пользоваться
мини-картой и экспортом, но не редактировать.

## Без Vue

Ядро редактирует и рендерит доски где угодно — в Node-сервисе, в воркере, в
тесте:

```ts
import { parseBoard, createObject, applyOps, boardToSvg } from '@dskripchenko/board'

let board = parseBoard(json) // checks the structure, fills defaults
const { id, ops } = createObject(board, 'sticky', { x: 0, y: 0 }, { text: 'Release on Friday', color: 'pink' })
board = applyOps(board, ops).board

const { svg, width, height } = boardToSvg(board, { background: '#ffffff' })
```

## Совместная работа

Передайте поставщика, и редактор станет совместным — см.
[Совместная работа](collaboration.md):

```vue
<BoardEditor :provider="httpProvider({ base: '/api/boards/42' })" :user="{ name: 'Anna' }" />
```

## Дальше

- [Модель](model.md) — JSON доски и объекты.
- [Редактор](editor.md) — инструменты, клавиатура, свойства, события, экспорт.
- [Совместная работа](collaboration.md) — протокол, поставщики, HTTP-контракт
  и эталонный сервер.
