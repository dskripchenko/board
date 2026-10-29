# Modell

Ein Board ist einfaches, versioniertes JSON. Speichern Sie es unverändert; der
Editor liest und schreibt genau diese Struktur.

```ts
interface Board {
  version: 1
  objects: Record<string, BoardObject> // id → object
  meta?: { title?: string; background?: 'dots' | 'grid' | 'none' }
}
```

Die Map ist flach: Die Hierarchie ist das `parent` eines Objekts (ein Frame),
die Stapelreihenfolge sein `z`.

## Gemeinsame Felder

| Feld | | |
|---|---|---|
| `id` | `string` | Eindeutig; vom Client erzeugt (eine ULID). |
| `type` | `'shape' \| 'sticky' \| 'text' \| 'frame' \| 'connector' \| 'emoji' \| 'ink'` | |
| `x`, `y`, `w`, `h` | `number` | Weltkoordinaten der linken oberen Ecke und die Größe, vor der Drehung. |
| `rotation` | `number?` | Grad, im Uhrzeigersinn, um den Mittelpunkt. |
| `z` | `string` | Ein fraktionaler Index: Objekte stapeln sich in der Reihenfolge ihres `z` (Gleichstand nach `id`). Zwischen zwei Objekte lassen sich beliebig viele weitere einfügen, ohne neu zu nummerieren. |
| `parent` | `string?` | Der Frame, zu dem das Objekt gehört; es wird mit ihm verschoben, kopiert und gelöscht. |
| `locked` | `boolean?` | Kann nicht verschoben, in der Größe geändert, bearbeitet oder gelöscht werden. |

## Objekte

| Typ | Felder |
|---|---|
| `shape` | `kind`: `rect`, `rounded`, `ellipse`, `diamond`, `triangle`, `parallelogram`, `hexagon`, `star`; `fill`, `stroke`, `strokeWidth`, `strokeStyle` (`solid`, `dashed`); `text`, `textAlign`, `fontSize` |
| `sticky` | `color`: `yellow`, `orange`, `pink`, `violet`, `blue`, `cyan`, `green`, `gray`; `text`; `fontSize` — eine Zahl, oder weggelassen, damit der Text in die Notiz eingepasst wird |
| `text` | `text`; `variant`: `title`, `h2`, `body`; `color`; `align` |
| `frame` | `title`, `fill` |
| `connector` | `from`, `to` — `{ id, side? }` (an ein Objekt angeheftet; `side`: `top`, `right`, `bottom`, `left`, sonst die dem anderen Ende zugewandte Seite) oder `{ x, y }` (ein freier Punkt); `route`: `straight`, `elbow`, `curve`; `startArrow`, `endArrow`: `none`, `arrow`, `triangle`, `circle`; `label`; `stroke`, `strokeWidth`, `strokeStyle` |
| `emoji` | `char` — ein Emoji, gezeichnet mit der Emoji-Schrift des Systems |
| `ink` | Ein Freihandstrich: `tool` (`pen`, `marker`), `color`, `width`, `points` (x,y-Paare relativ zur linken oberen Ecke, gezeichnet in einem `vw` × `vh`-Rahmen, gestreckt auf `w` × `h`) |

Text ist reiner Text mit Zeilenumbrüchen; nichts im Modell wird jemals als
HTML gerendert.

## Lesen und Schreiben

```ts
import { parseBoard, stringifyBoard, emptyBoard, BoardError } from '@dskripchenko/board'

const board = parseBoard(jsonTextOrObject) // throws BoardError with a JSON pointer
const text = stringifyBoard(board)
```

`parseBoard` füllt Standardwerte (Stapelschlüssel, Notizfarbe, Textvariante,
Connector-Route…), verwirft Objekte unbekannten Typs und lehnt andere
Versionen ab. Fehler benennen den fehlerhaften Wert:
`/objects/a1/x: x must be a number`.

## Operationen

Jede Änderung ist eine Liste von Operationen auf einzelnen Objekten:

```ts
type Op =
  | { k: 'create'; id: string; obj: BoardObject }
  | { k: 'set'; id: string; props: Record<string, unknown> } // null removes a property
  | { k: 'delete'; id: string }

const { board: next, inverse } = applyOps(board, ops)
```

`applyOps` verändert seine Eingabe nie und gibt die Operationen zurück, die
die Änderung exakt rückgängig machen. Operationen auf fehlende Objekte werden
übersprungen, sodass eine Wiederholung harmlos ist. Sie sind die Einheit des
Rückgängigmachens und des [Synchronisationsprotokolls](collaboration.md).

## Bearbeitungsbefehle

Funktionen, die eine Absicht in Operationen umsetzen — der Editor nutzt sie,
ebenso kann es ein Skript oder ein Server:

| Funktion | |
|---|---|
| `createObject(board, type, at, props?)` | Ein neues Objekt, zentriert an einem Punkt, im darunterliegenden Frame, ganz oben. |
| `createConnector(board, from, to, props?)` | Ein Connector zwischen zwei Enden. |
| `createInk(board, points, style)` | Striche aus gezeichneten Punkten: vereinfacht, ab 2 000 Punkten aufgeteilt. |
| `moveObjects(board, ids, dx, dy)` | Verschiebt Objekte und den Inhalt von Frames; Objekte treten dem Frame bei, in dem sie landen. |
| `resizeObject(board, id, rect)`, `scaleObjects(board, ids, from, to)` | Ein Objekt, oder eine Gruppe von einem Rahmen in einen anderen. |
| `deleteObjects(board, ids)` | Löscht, samt Frame-Inhalt; Connectors behalten das gelöschte Ende als freien Punkt. |
| `bringToFront`, `sendToBack` | Neu stapeln, unter Beibehaltung der eigenen Reihenfolge der Auswahl. |
| `duplicate(board, ids)`, `pasteObjects(board, objects, offset)` | Kopien mit neuen ids; Eltern und Connector-Enden innerhalb der Kopie folgen. |
| `wrapInFrame(board, ids, title?)` | Ein Frame um die Objekte, unter ihnen. |
| `align(board, ids, edge)`, `distribute(board, ids, axis)` | Ausrichten oder gleichmäßig verteilen. |
| `setProps(board, ids, props)` | Beliebige Eigenschaften. |

`BoardDoc` hält ein Board mit Rückgängig und Wiederholen lokaler Änderungen
(ein Ziehen oder Tippen wird zu einem Schritt zusammengefasst); die
Synchronisations-Engine wird daran angeschlossen.

## Geometrie und Rendering

`bounds`, `hitTest`, `objectsInRect`, `visibleObjects`, `connectorPoints`,
`shapePath` — die Geometrie des Editors, auch auf einem Server nutzbar.
`renderObject` macht aus einem Objekt einen kleinen SVG-Baum;
`boardToSvg(board, options)` erzeugt ein eigenständiges SVG des Boards oder
einiger Objekte (`ids`). Farben sind CSS-Variablen mit Fallbacks, sodass auf
dem Bildschirm das Theme der Seite gilt und in einer exportierten Datei die
Fallbacks.
