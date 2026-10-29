# Модель

Доска — это обычный версионированный JSON. Храните его как есть; редактор
читает и пишет ровно эту структуру.

```ts
interface Board {
  version: 1
  objects: Record<string, BoardObject> // id → object
  meta?: { title?: string; background?: 'dots' | 'grid' | 'none'; locked?: boolean; lockedBy?: string }
}
```

Словарь плоский: иерархия — это `parent` объекта (блок), порядок наложения —
его `z`.

## Общие поля

| Поле | | |
|---|---|---|
| `id` | `string` | Уникальный; создаётся клиентом (ULID). |
| `type` | `'shape' \| 'sticky' \| 'text' \| 'frame' \| 'connector' \| 'emoji' \| 'ink'` | |
| `x`, `y`, `w`, `h` | `number` | Мировые координаты левого верхнего угла и размер до поворота. |
| `rotation` | `number?` | Градусы, по часовой стрелке, вокруг центра. |
| `z` | `string` | Дробный индекс: объекты накладываются в порядке своих `z` (при равенстве — по `id`). Между двумя объектами можно вставить сколько угодно других без перенумерации. |
| `parent` | `string?` | Блок, которому принадлежит объект; объект перемещается, копируется и удаляется вместе с ним. |
| `locked` | `boolean?` | Нельзя перемещать, менять размер, редактировать и удалять. |

## Объекты

| Тип | Поля |
|---|---|
| `shape` | `kind`: `rect`, `rounded`, `ellipse`, `diamond`, `triangle`, `parallelogram`, `hexagon`, `star`; `fill`, `stroke`, `strokeWidth`, `strokeStyle` (`solid`, `dashed`); `text`, `textAlign`, `fontSize` |
| `sticky` | `color`: `yellow`, `orange`, `pink`, `violet`, `blue`, `cyan`, `green`, `gray`; `text`; `fontSize` — число, либо не задан, чтобы текст подгонялся под стикер |
| `text` | `text`; `variant`: `title`, `h2`, `body`; `color`; `align` |
| `frame` | `title`, `fill` |
| `connector` | `from`, `to` — `{ id, side? }` (прикреплён к объекту; `side`: `top`, `right`, `bottom`, `left`, иначе сторона, обращённая к другому концу) или `{ x, y }` (свободная точка); `route`: `straight`, `elbow`, `curve`; `startArrow`, `endArrow`: `none`, `arrow`, `triangle`, `circle`; `label`; `stroke`, `strokeWidth`, `strokeStyle` |
| `emoji` | `char` — одно эмодзи, рисуется системным шрифтом эмодзи |
| `ink` | Штрих от руки: `tool` (`pen`, `marker`), `color`, `width`, `points` (пары x,y относительно левого верхнего угла, нарисованные в рамке `vw` × `vh`, растянутой до `w` × `h`) |

Текст — простой текст с переносами строк; ничто в модели никогда не
рендерится как HTML.

## Чтение и запись

```ts
import { parseBoard, stringifyBoard, emptyBoard, BoardError } from '@dskripchenko/board'

const board = parseBoard(jsonTextOrObject) // throws BoardError with a JSON pointer
const text = stringifyBoard(board)
```

`parseBoard` заполняет значения по умолчанию (ключи наложения, цвет стикера,
вариант текста, маршрут связи…), отбрасывает объекты неизвестного типа и
отклоняет другие версии. Ошибки называют ошибочное значение:
`/objects/a1/x: x must be a number`.

## Операции

Любое изменение — это список операций над отдельными объектами:

```ts
type Op =
  | { k: 'create'; id: string; obj: BoardObject }
  | { k: 'set'; id: string; props: Record<string, unknown> } // null removes a property
  | { k: 'delete'; id: string }
  | { k: 'meta'; id: '$meta'; props: Record<string, unknown> } // board settings: lockOp(true | false, by?)

const { board: next, inverse } = applyOps(board, ops)
```

`applyOps` никогда не меняет свой вход и возвращает операции, которые точно
отменяют изменение. Операции над отсутствующими объектами пропускаются, так
что повторное применение безвредно. Операции — единица отмены и
[протокола синхронизации](collaboration.md).

## Команды редактирования

Функции, превращающие намерение в операции, — их использует редактор, а
также может использовать скрипт или сервер:

| Функция | |
|---|---|
| `createObject(board, type, at, props?)` | Новый объект с центром в точке, внутри блока под ней, поверх остальных. |
| `createConnector(board, from, to, props?)` | Связь между двумя концами. |
| `createInk(board, points, style)` | Штрихи из нарисованных точек: упрощаются, делятся после 2 000 точек. |
| `moveObjects(board, ids, dx, dy)` | Перемещает объекты и содержимое блоков; объекты входят в блок, в который попали. |
| `resizeObject(board, id, rect)`, `scaleObjects(board, ids, from, to)` | Один объект или группа из одной рамки в другую. |
| `deleteObjects(board, ids)` | Удаляет вместе с содержимым блоков; связи сохраняют удалённый конец как свободную точку. |
| `bringToFront`, `sendToBack` | Меняют порядок наложения, сохраняя собственный порядок выделения. |
| `duplicate(board, ids)`, `pasteObjects(board, objects, offset)` | Копии с новыми id; родители и концы связей внутри копии следуют за ней. |
| `wrapInFrame(board, ids, title?)` | Блок вокруг объектов, под ними. |
| `align(board, ids, edge)`, `distribute(board, ids, axis)` | Выровнять или распределить равномерно. |
| `setProps(board, ids, props)` | Любые свойства. |

`BoardDoc` хранит доску с отменой и повтором локальных изменений
(перетаскивание или набор текста сливаются в один шаг); к нему подключается
движок синхронизации.

## Геометрия и рендеринг

`bounds`, `hitTest`, `objectsInRect`, `visibleObjects`, `connectorPoints`,
`shapePath` — геометрия редактора, пригодная и на сервере. `renderObject`
превращает объект в небольшое SVG-дерево; `boardToSvg(board, options)`
создаёт самостоятельный SVG всей доски или части объектов (`ids`). Цвета —
CSS-переменные с запасными значениями, поэтому на экране применяется тема
страницы, а в экспортированном файле — запасные значения.
