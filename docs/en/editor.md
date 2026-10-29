# Editor

```vue
<BoardEditor v-model="board" :locale="'en'" style="height: 720px" @change="onChange" />
```

## Props

| Prop | Type | Default | |
|---|---|---|---|
| `modelValue` | `Board \| string \| null` | `null` | The board, as an object or JSON text. |
| `readonly` | `boolean` | `false` | A viewer: pan, zoom, minimap, export. |
| `locale` | `string` | the page's `lang` | `ru` or `en`. |
| `labels` | `Partial<BoardLabels>` | — | Replace any interface text. |
| `minimap` | `boolean` | `true` | Show the minimap at start. |
| `provider` | `BoardProvider \| null` | `null` | Real-time collaboration ([Collaboration](collaboration.md)). |
| `user` | `{ id?, name?, color? }` | — | Who edits: shown to the others. |

## Events

| Event | Payload | |
|---|---|---|
| `update:modelValue` | `Board` | After every change. |
| `change` | `{ board, ops, origin }` | The applied operations; `origin` is `local`, `undo`, `redo` or `remote`. |
| `selection` | `string[]` | The selected ids. |

## Exposed

Through a template ref: `fit()`, `select(ids)`, `zoomTo(k)`, `toPng(scale?)`
(a `Blob`), `toSvg()` (`{ svg, width, height }`), `applyRemote(ops)`, `doc`
(the `BoardDoc`), `sync()` (the `SyncClient`, when a provider is set).

## Tools

| Tool | Key | |
|---|---|---|
| Select | V | Click, Shift-click, drag a marquee. |
| Hand | H, or hold Space | Pan. |
| Sticky note | N | Click to place; type at once. A double click on empty space also makes one. |
| Shape | S | Click for the default size or drag; click the tool again for the eight kinds. |
| Text | T | Click and type: title, heading or text. |
| Frame | F | Click or drag. Objects dropped into a frame move with it. |
| Connector | L | Drag from an object (or anywhere) to another; ends attach to objects. |
| Emoji | E | Pick one, then click to place. |
| Pen | P | Draw; click the tool again for colours and widths. |
| Marker | M | A wide translucent stroke. |
| Eraser | X | Removes the strokes it touches (whole strokes). |

## Editing

- **Move** by dragging; edges and centres snap to nearby objects (hold Alt
  to move freely). Arrows nudge by 1, with Shift by 10.
- **Resize** with the handles (Shift keeps proportions), **rotate** with the
  round handle above (Shift snaps to 15°). A group resizes as a whole.
- **Text:** double click or Enter. Escape or Ctrl/⌘ + Enter finishes.
- **Connectors:** drag an end handle to re-attach it.
- **The bar above the selection:** colours, shape kind, fill and line, text
  style, connector route and arrows, stroke colour and width, align and
  distribute (several objects), frame the selection, bring to front, send to
  back, duplicate, lock, delete.

## Keyboard

| Keys | |
|---|---|
| Ctrl/⌘ + Z, Ctrl/⌘ + Shift + Z (or Y) | Undo, redo |
| Ctrl/⌘ + A, D | Select all, duplicate |
| Ctrl/⌘ + C, X, V | Copy, cut, paste (plain text becomes a sticky note) |
| Ctrl/⌘ + ], [ | Bring to front, send to back |
| Delete, Backspace | Delete |
| Ctrl/⌘ + =, − ; Ctrl/⌘ + wheel or pinch | Zoom |
| Wheel or two-finger scroll | Pan |
| Shift + 1 | Fit to screen |
| Escape | Clear the selection, back to Select |

## Export

The download button (bottom right) saves a PNG (2×), an SVG or the board's
JSON — the selection, or the whole board when nothing is selected. The export
uses the same renderer as the screen.

## Theming

The editor uses the kit's tokens and these variables, all overridable on
`.bd-root`: `--bd-text`, `--bd-stroke`, `--bd-shape-fill`, `--bd-surface`,
`--bd-frame-fill`, `--bd-frame-stroke`, `--bd-frame-title`, `--bd-connector`,
`--bd-accent`, `--bd-canvas`, `--bd-dot`. Explicit colours on objects (a
sticky's colour, a shape's fill) stay as they are in the dark theme; text on
them switches between dark and white for contrast.

## Performance

Only objects in view are drawn, and an object's rendering is cached until it
changes. A board of 5 000 objects opens in about 0.3 s and pans at 60 fps.
Limits: 10 000 objects per board; a stroke is split past 2 000 points.
