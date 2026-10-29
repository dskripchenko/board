# 快速开始

## 安装

```bash
npm install @dskripchenko/board
```

该包有两个入口：

- `@dskripchenko/board` — 核心：白板模型、解析、几何、编辑命令、撤销历史、
  SVG 渲染器与导出，以及实时同步引擎。纯 TypeScript，无依赖、无 DOM；
  可运行于浏览器、Node 20+ 和 worker 中。
- `@dskripchenko/board/vue` — `BoardEditor` 和 `BoardView`。它们需要 Vue
  3.4+ 和 [`@dskripchenko/ui`](https://github.com/dskripchenko/ui) 1.17+，
  声明为可选的 peer 依赖：

```bash
npm install @dskripchenko/ui vue
```

## 页面中的编辑器

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

编辑器会填满其容器：请为容器设置高度。`v-model` 以 JSON 形式保存白板——
原样存储，之后再传回即可。界面跟随页面语言（`<html lang>`：俄语或英语）和
主题（`data-theme` 或 `data-color-mode` 设为 `dark`）。

## 只读白板

```vue
<BoardView :board="savedJson" style="height: 480px" />
```

读者可以平移、缩放、使用小地图和导出，但不能编辑。

## 不使用 Vue

核心可在任何地方编辑和渲染白板——Node 服务、worker、测试中：

```ts
import { parseBoard, createObject, applyOps, boardToSvg } from '@dskripchenko/board'

let board = parseBoard(json) // checks the structure, fills defaults
const { id, ops } = createObject(board, 'sticky', { x: 0, y: 0 }, { text: 'Release on Friday', color: 'pink' })
board = applyOps(board, ops).board

const { svg, width, height } = boardToSvg(board, { background: '#ffffff' })
```

## 协作

传入一个 provider，编辑器即变为协作模式——参见[协作](collaboration.md)：

```vue
<BoardEditor :provider="httpProvider({ base: '/api/boards/42' })" :user="{ name: 'Anna' }" />
```

## 下一步

- [模型](model.md) — 白板 JSON 与对象。
- [编辑器](editor.md) — 工具、键盘、props、事件、导出。
- [协作](collaboration.md) — 协议、provider、HTTP 契约与参考服务器。
