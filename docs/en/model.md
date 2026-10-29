# Model

A board is plain, versioned JSON. Store it as is; the editor reads and
writes exactly this shape.

```ts
interface Board {
  version: 1
  objects: Record<string, BoardObject> // id → object
  meta?: { title?: string; background?: 'dots' | 'grid' | 'none' }
}
```

The map is flat: hierarchy is the `parent` of an object (a frame), stacking
is its `z`.

## Common fields

| Field | | |
|---|---|---|
| `id` | `string` | Unique; created by the client (a ULID). |
| `type` | `'shape' \| 'sticky' \| 'text' \| 'frame' \| 'connector' \| 'emoji' \| 'ink'` | |
| `x`, `y`, `w`, `h` | `number` | World coordinates of the top-left corner and the size, before rotation. |
| `rotation` | `number?` | Degrees, clockwise, around the centre. |
| `z` | `string` | A fractional index: objects stack in the order of their `z` (ties by `id`). Any number of objects can be put between two others without renumbering. |
| `parent` | `string?` | The frame the object belongs to; it moves, copies and deletes with it. |
| `locked` | `boolean?` | Cannot be moved, resized, edited or deleted. |

## Objects

| Type | Fields |
|---|---|
| `shape` | `kind`: `rect`, `rounded`, `ellipse`, `diamond`, `triangle`, `parallelogram`, `hexagon`, `star`; `fill`, `stroke`, `strokeWidth`, `strokeStyle` (`solid`, `dashed`); `text`, `textAlign`, `fontSize` |
| `sticky` | `color`: `yellow`, `orange`, `pink`, `violet`, `blue`, `cyan`, `green`, `gray`; `text`; `fontSize` — a number, or omitted to fit the text to the note |
| `text` | `text`; `variant`: `title`, `h2`, `body`; `color`; `align` |
| `frame` | `title`, `fill` |
| `connector` | `from`, `to` — `{ id, side? }` (attached to an object; `side`: `top`, `right`, `bottom`, `left`, else the side facing the other end) or `{ x, y }` (a free point); `route`: `straight`, `elbow`, `curve`; `startArrow`, `endArrow`: `none`, `arrow`, `triangle`, `circle`; `label`; `stroke`, `strokeWidth`, `strokeStyle` |
| `emoji` | `char` — one emoji, drawn with the system's emoji font |
| `ink` | A freehand stroke: `tool` (`pen`, `marker`), `color`, `width`, `points` (x,y pairs relative to the top-left corner, drawn in a `vw` × `vh` box stretched to `w` × `h`) |

Text is plain text with line breaks; nothing in the model is ever rendered
as HTML.

## Reading and writing

```ts
import { parseBoard, stringifyBoard, emptyBoard, BoardError } from '@dskripchenko/board'

const board = parseBoard(jsonTextOrObject) // throws BoardError with a JSON pointer
const text = stringifyBoard(board)
```

`parseBoard` fills defaults (stacking keys, sticky colour, text variant,
connector route…), drops objects of an unknown type, and refuses other
versions. Errors name the faulty value: `/objects/a1/x: x must be a number`.

## Operations

Every change is a list of operations on single objects:

```ts
type Op =
  | { k: 'create'; id: string; obj: BoardObject }
  | { k: 'set'; id: string; props: Record<string, unknown> } // null removes a property
  | { k: 'delete'; id: string }

const { board: next, inverse } = applyOps(board, ops)
```

`applyOps` never changes its input and returns the operations that undo the
change exactly. Operations on missing objects are skipped, so a replay is
harmless. They are the unit of undo and of the [sync protocol](collaboration.md).

## Editing commands

Functions that turn an intention into operations — the editor uses them,
and so can a script or a server:

| Function | |
|---|---|
| `createObject(board, type, at, props?)` | A new object centred at a point, inside the frame under it, on top. |
| `createConnector(board, from, to, props?)` | A connector between two ends. |
| `createInk(board, points, style)` | Strokes from drawn points: simplified, split past 2 000 points. |
| `moveObjects(board, ids, dx, dy)` | Moves objects and the contents of frames; objects join the frame they land in. |
| `resizeObject(board, id, rect)`, `scaleObjects(board, ids, from, to)` | One object, or a group from one box to another. |
| `deleteObjects(board, ids)` | Deletes, with frame contents; connectors keep the deleted end as a free point. |
| `bringToFront`, `sendToBack` | Restack, keeping the selection's own order. |
| `duplicate(board, ids)`, `pasteObjects(board, objects, offset)` | Copies with new ids; parents and connector ends inside the copy follow. |
| `wrapInFrame(board, ids, title?)` | A frame around the objects, below them. |
| `align(board, ids, edge)`, `distribute(board, ids, axis)` | Line up, or space evenly. |
| `setProps(board, ids, props)` | Any properties. |

`BoardDoc` holds a board with undo and redo of local changes (a drag or
typing merges into one step); the sync engine plugs into it.

## Geometry and rendering

`bounds`, `hitTest`, `objectsInRect`, `visibleObjects`, `connectorPoints`,
`shapePath` — the editor's geometry, usable on a server. `renderObject`
turns an object into a small SVG tree; `boardToSvg(board, options)` makes a
standalone SVG of the board or of some objects (`ids`). Colours are CSS
variables with fallbacks, so the page's theme applies on screen and the
fallbacks in an exported file.
