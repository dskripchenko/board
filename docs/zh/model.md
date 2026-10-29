# 模型

白板是普通的、带版本号的 JSON。原样存储即可；编辑器读写的正是这种结构。

```ts
interface Board {
  version: 1
  objects: Record<string, BoardObject> // id → object
  meta?: { title?: string; background?: 'dots' | 'grid' | 'none'; locked?: boolean; lockedBy?: string }
}
```

映射是扁平的：层级关系是对象的 `parent`（一个框架），叠放顺序是它的 `z`。

## 通用字段

| 字段 | | |
|---|---|---|
| `id` | `string` | 唯一；由客户端生成（ULID）。 |
| `type` | `'shape' \| 'sticky' \| 'text' \| 'frame' \| 'connector' \| 'emoji' \| 'ink'` | |
| `x`, `y`, `w`, `h` | `number` | 旋转前左上角的世界坐标及尺寸。 |
| `rotation` | `number?` | 角度，顺时针，绕中心旋转。 |
| `z` | `string` | 分数索引：对象按 `z` 的顺序叠放（相同时按 `id`）。可以在两个对象之间插入任意数量的对象而无需重新编号。 |
| `parent` | `string?` | 对象所属的框架；对象随框架一起移动、复制和删除。 |
| `locked` | `boolean?` | 不能移动、调整大小、编辑或删除。 |

## 对象

| 类型 | 字段 |
|---|---|
| `shape` | `kind`：`rect`、`rounded`、`ellipse`、`diamond`、`triangle`、`parallelogram`、`hexagon`、`star`；`fill`、`stroke`、`strokeWidth`、`strokeStyle`（`solid`、`dashed`）；`text`、`textAlign`、`fontSize` |
| `sticky` | `color`：`yellow`、`orange`、`pink`、`violet`、`blue`、`cyan`、`green`、`gray`；`text`；`fontSize` — 一个数字，或省略以使文本适应便签 |
| `text` | `text`；`variant`：`title`、`h2`、`body`；`color`；`align` |
| `frame` | `title`、`fill` |
| `connector` | `from`、`to` — `{ id, side? }`（附着于对象；`side`：`top`、`right`、`bottom`、`left`，否则为朝向另一端的那一侧）或 `{ x, y }`（自由点）；`route`：`straight`、`elbow`、`curve`；`startArrow`、`endArrow`：`none`、`arrow`、`triangle`、`circle`；`label`；`stroke`、`strokeWidth`、`strokeStyle` |
| `emoji` | `char` — 一个 emoji，使用系统的 emoji 字体绘制 |
| `ink` | 手绘笔迹：`tool`（`pen`、`marker`）、`color`、`width`、`points`（相对于左上角的 x,y 坐标对，在 `vw` × `vh` 的框中绘制，并拉伸到 `w` × `h`） |

文本是带换行的纯文本；模型中的任何内容都不会被渲染为 HTML。

## 读取与写入

```ts
import { parseBoard, stringifyBoard, emptyBoard, BoardError } from '@dskripchenko/board'

const board = parseBoard(jsonTextOrObject) // throws BoardError with a JSON pointer
const text = stringifyBoard(board)
```

`parseBoard` 会填充默认值（叠放键、便签颜色、文本变体、连接线路由……），
丢弃未知类型的对象，并拒绝其他版本。错误信息会指出出错的值：
`/objects/a1/x: x must be a number`。

## 操作

每次变更都是针对单个对象的一组操作：

```ts
type Op =
  | { k: 'create'; id: string; obj: BoardObject }
  | { k: 'set'; id: string; props: Record<string, unknown> } // null removes a property
  | { k: 'delete'; id: string }
  | { k: 'meta'; id: '$meta'; props: Record<string, unknown> } // board settings: lockOp(true | false, by?)

const { board: next, inverse } = applyOps(board, ops)
```

`applyOps` 从不修改其输入，并返回能精确撤销该变更的操作。针对不存在对象的
操作会被跳过，因此重放是无害的。操作是撤销以及[同步协议](collaboration.md)
的基本单位。

## 编辑命令

将意图转换为操作的函数——编辑器使用它们，脚本或服务器也可以使用：

| 函数 | |
|---|---|
| `createObject(board, type, at, props?)` | 以某点为中心的新对象，位于其下方的框架内，置于最上层。 |
| `createConnector(board, from, to, props?)` | 两端之间的连接线。 |
| `createInk(board, points, style)` | 由绘制的点生成笔迹：经过简化，超过 2 000 个点时拆分。 |
| `moveObjects(board, ids, dx, dy)` | 移动对象及框架内容；对象会加入其落入的框架。 |
| `resizeObject(board, id, rect)`、`scaleObjects(board, ids, from, to)` | 单个对象，或将一组对象从一个框缩放到另一个框。 |
| `deleteObjects(board, ids)` | 删除对象及框架内容；连接线将被删除的一端保留为自由点。 |
| `bringToFront`、`sendToBack` | 重新叠放，保持选区自身的顺序。 |
| `duplicate(board, ids)`、`pasteObjects(board, objects, offset)` | 使用新 id 的副本；副本内的父级和连接线端点随之对应。 |
| `wrapInFrame(board, ids, title?)` | 围绕这些对象、位于其下方的框架。 |
| `align(board, ids, edge)`、`distribute(board, ids, axis)` | 对齐，或均匀分布。 |
| `setProps(board, ids, props)` | 任意属性。 |

`BoardDoc` 持有一个白板，并支持本地变更的撤销与重做（一次拖动或输入合并为
一步）；同步引擎接入其中。

## 几何与渲染

`bounds`、`hitTest`、`objectsInRect`、`visibleObjects`、`connectorPoints`、
`shapePath` — 编辑器的几何函数，也可在服务器上使用。`renderObject` 将对象
转换为一棵小型 SVG 树；`boardToSvg(board, options)` 生成整个白板或部分对象
（`ids`）的独立 SVG。颜色是带回退值的 CSS 变量，因此屏幕上应用页面主题，
导出文件中则使用回退值。
