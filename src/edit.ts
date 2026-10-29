import type { Board, BoardObject, ConnectorEnd, ObjectType, Point, Rect } from './model/types'
import type { Op } from './model/ops'
import { newId } from './model/ids'
import { keyBetween, keysBetween, compareZ } from './model/zindex'
import { bounds, center, contains, resolveEnd, stacked, unionRects } from './geometry'

/** Default sizes of new objects. */
export const DEFAULT_SIZE: Record<Exclude<ObjectType, 'connector'>, { w: number; h: number }> = {
  shape: { w: 160, h: 100 },
  sticky: { w: 200, h: 200 },
  text: { w: 240, h: 40 },
  frame: { w: 640, h: 420 },
  emoji: { w: 64, h: 64 },
}

function topZ(board: Board): string | null {
  let max: string | null = null
  for (const o of Object.values(board.objects)) if (max === null || o.z > max) max = o.z
  return max
}

/** The topmost frame whose rect holds the point, other than `exclude` and its descendants. */
export function frameAt(board: Board, p: Point, exclude: Set<string> = new Set()): string | undefined {
  const frames = stacked(board).filter((o) => o.type === 'frame' && !exclude.has(o.id))
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i]!
    if (p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) return f.id
  }
  return undefined
}

type NewProps = Partial<BoardObject> & Record<string, unknown>

/** A new object centred at `at` (a frame — its top-left at `at`), placed in the frame under it, on top of the stack. */
export function createObject(board: Board, type: Exclude<ObjectType, 'connector'>, at: Point, props: NewProps = {}): { id: string; ops: Op[] } {
  const id = newId()
  const size = { ...DEFAULT_SIZE[type], ...pick(props, ['w', 'h']) }
  const x = type === 'frame' ? at.x : at.x - size.w / 2
  const y = type === 'frame' ? at.y : at.y - size.h / 2
  const base = { id, type, x, y, w: size.w, h: size.h, z: keyBetween(topZ(board), null) }
  const parent = type === 'frame' ? undefined : frameAt(board, at)
  const defaults: Record<string, unknown> =
    type === 'shape' ? { kind: 'rect' } : type === 'sticky' ? { color: 'yellow' } : type === 'text' ? { text: '', variant: 'body' } : type === 'emoji' ? { char: '👍' } : { title: '' }
  const obj = { ...base, ...defaults, ...(parent ? { parent } : {}), ...props, id, type } as BoardObject
  return { id, ops: [{ k: 'create', id, obj }] }
}

/** A connector between two ends. */
export function createConnector(board: Board, from: ConnectorEnd, to: ConnectorEnd, props: NewProps = {}): { id: string; ops: Op[] } {
  const id = newId()
  const obj = { id, type: 'connector', x: 0, y: 0, w: 0, h: 0, z: keyBetween(topZ(board), null), from, to, route: 'elbow', endArrow: 'arrow', ...props } as BoardObject
  return { id, ops: [{ k: 'create', id, obj }] }
}

/** The ids with every frame's contents, recursively. */
export function withChildren(board: Board, ids: Iterable<string>): Set<string> {
  const out = new Set(ids)
  let grew = true
  while (grew) {
    grew = false
    for (const o of Object.values(board.objects)) {
      if (o.parent && out.has(o.parent) && !out.has(o.id)) {
        out.add(o.id)
        grew = true
      }
    }
  }
  return out
}

/**
 * Moves objects (and the contents of moved frames) by dx/dy. Free ends of
 * moved connectors move too. Moved objects join the frame they land in.
 */
export function moveObjects(board: Board, ids: Iterable<string>, dx: number, dy: number): Op[] {
  const moved = withChildren(board, ids)
  const ops: Op[] = []
  for (const id of moved) {
    const o = board.objects[id]
    if (!o || o.locked) continue
    if (o.type === 'connector') {
      const props: Record<string, unknown> = {}
      if (!('id' in o.from)) props.from = { x: o.from.x + dx, y: o.from.y + dy }
      if (!('id' in o.to)) props.to = { x: o.to.x + dx, y: o.to.y + dy }
      if (Object.keys(props).length) ops.push({ k: 'set', id, props })
      continue
    }
    ops.push({ k: 'set', id, props: { x: o.x + dx, y: o.y + dy } })
  }
  return [...ops, ...reparent(board, ops, moved)]
}

/** After a move: the top-level moved objects belong to the frame their centre is in. */
function reparent(board: Board, moveOps: Op[], moved: Set<string>): Op[] {
  const ops: Op[] = []
  const frames = new Map<string, BoardObject>()
  for (const op of moveOps) if (op.k === 'set') frames.set(op.id, { ...board.objects[op.id]!, ...op.props } as BoardObject)
  const after = { ...board, objects: { ...board.objects, ...Object.fromEntries(frames) } }
  for (const id of moved) {
    const o = after.objects[id]
    if (!o || o.type === 'connector' || o.locked) continue
    // Only objects whose parent did not move with them (otherwise they stay inside it).
    if (o.parent && moved.has(o.parent)) continue
    const exclude = withChildren(board, [id])
    const parent = frameAt(after, center(o), exclude)
    if (parent !== o.parent) ops.push({ k: 'set', id, props: { parent: parent ?? null } })
  }
  return ops
}

/** New geometry for one object. */
export function resizeObject(board: Board, id: string, rect: Rect): Op[] {
  const o = board.objects[id]
  if (!o || o.locked) return []
  return [{ k: 'set', id, props: { x: rect.x, y: rect.y, w: Math.max(8, rect.w), h: Math.max(8, rect.h) } }]
}

export function setProps(board: Board, ids: Iterable<string>, props: Record<string, unknown>): Op[] {
  const ops: Op[] = []
  for (const id of ids) if (board.objects[id]) ops.push({ k: 'set', id, props: { ...props } })
  return ops
}

/**
 * Deletes objects and the contents of deleted frames. A connector attached to
 * a deleted object keeps that end where it was, as a free point.
 */
export function deleteObjects(board: Board, ids: Iterable<string>): Op[] {
  const gone = withChildren(board, ids)
  const ops: Op[] = []
  for (const o of Object.values(board.objects)) {
    if (o.type !== 'connector' || gone.has(o.id)) continue
    const props: Record<string, unknown> = {}
    for (const end of ['from', 'to'] as const) {
      const e = o[end]
      if ('id' in e && gone.has(e.id)) props[end] = resolveEnd(e, end === 'from' ? o.to : o.from, board).point
    }
    if (Object.keys(props).length) ops.push({ k: 'set', id: o.id, props })
  }
  for (const id of gone) if (board.objects[id]) ops.push({ k: 'delete', id })
  return ops
}

/** Brings objects to the top (keeping their order among themselves). */
export function bringToFront(board: Board, ids: Iterable<string>): Op[] {
  const sel = [...ids].map((id) => board.objects[id]).filter((o): o is BoardObject => !!o).sort(compareZ)
  const keys = keysBetween(topZ(board), null, sel.length)
  return sel.map((o, i) => ({ k: 'set', id: o.id, props: { z: keys[i] } }))
}

/** Sends objects to the bottom (keeping their order among themselves). */
export function sendToBack(board: Board, ids: Iterable<string>): Op[] {
  const sel = [...ids].map((id) => board.objects[id]).filter((o): o is BoardObject => !!o).sort(compareZ)
  let bottom: string | null = null
  for (const o of Object.values(board.objects)) if (bottom === null || o.z < bottom) bottom = o.z
  const keys = keysBetween(null, bottom, sel.length)
  return sel.map((o, i) => ({ k: 'set', id: o.id, props: { z: keys[i] } }))
}

/**
 * Copies of objects (with frame contents), shifted by `offset`. Parents and
 * connector ends inside the copied set point to the copies.
 */
export function duplicate(board: Board, ids: Iterable<string>, offset: Point = { x: 24, y: 24 }): { ids: string[]; ops: Op[] } {
  return pasteObjects(board, [...withChildren(board, ids)].map((id) => board.objects[id]!).filter(Boolean), offset)
}

/** Pastes objects (e.g. from the clipboard) with new ids, shifted by `offset`, on top of the stack. */
export function pasteObjects(board: Board, objects: BoardObject[], offset: Point): { ids: string[]; ops: Op[] } {
  const sorted = [...objects].sort(compareZ)
  const map = new Map(sorted.map((o) => [o.id, newId()]))
  const keys = keysBetween(topZ(board), null, sorted.length)
  const ops: Op[] = []
  sorted.forEach((o, i) => {
    const id = map.get(o.id)!
    const copy: Record<string, unknown> = { ...o, id, z: keys[i], x: o.x + offset.x, y: o.y + offset.y }
    if (o.parent) copy.parent = map.get(o.parent) ?? (board.objects[o.parent] ? o.parent : undefined)
    if (copy.parent === undefined) delete copy.parent
    if (o.type === 'connector') {
      for (const end of ['from', 'to'] as const) {
        const e = o[end]
        copy[end] = 'id' in e ? (map.has(e.id) ? { ...e, id: map.get(e.id)! } : board.objects[e.id] ? e : resolveEnd(e, o[end === 'from' ? 'to' : 'from'], board).point) : { x: e.x + offset.x, y: e.y + offset.y }
      }
    }
    ops.push({ k: 'create', id, obj: copy as unknown as BoardObject })
  })
  return { ids: sorted.filter((o) => !o.parent || !map.has(o.parent)).map((o) => map.get(o.id)!), ops }
}

/** A frame around the objects (with padding), below them; the objects join it. */
export function wrapInFrame(board: Board, ids: Iterable<string>, title = ''): { id: string; ops: Op[] } {
  const list = [...ids].map((id) => board.objects[id]).filter((o): o is BoardObject => !!o && o.type !== 'connector')
  const box = unionRects(list.map((o) => bounds(o)))
  if (!box) return { id: '', ops: [] }
  const pad = 32
  const lowest = list.reduce((min, o) => (o.z < min ? o.z : min), list[0]!.z)
  let below: string | null = null
  for (const o of Object.values(board.objects)) if (o.z < lowest && (below === null || o.z > below)) below = o.z
  const id = newId()
  const frame = { id, type: 'frame', title, x: box.x - pad, y: box.y - pad - 24, w: box.w + 2 * pad, h: box.h + 2 * pad + 24, z: keyBetween(below, lowest) } as BoardObject
  const ops: Op[] = [{ k: 'create', id, obj: frame }]
  for (const o of list) if (!o.parent || !list.some((p) => p.id === o.parent)) ops.push({ k: 'set', id: o.id, props: { parent: id } })
  return { id, ops }
}

/**
 * Scales a group from one box to another: positions and sizes of the objects
 * (and of the contents of frames among them), free connector ends too.
 */
export function scaleObjects(board: Board, ids: Iterable<string>, from: Rect, to: Rect): Op[] {
  const sx = to.w / Math.max(from.w, 1e-6)
  const sy = to.h / Math.max(from.h, 1e-6)
  const px = (x: number) => to.x + (x - from.x) * sx
  const py = (y: number) => to.y + (y - from.y) * sy
  const ops: Op[] = []
  for (const id of withChildren(board, ids)) {
    const o = board.objects[id]
    if (!o || o.locked) continue
    if (o.type === 'connector') {
      const props: Record<string, unknown> = {}
      if (!('id' in o.from)) props.from = { x: px(o.from.x), y: py(o.from.y) }
      if (!('id' in o.to)) props.to = { x: px(o.to.x), y: py(o.to.y) }
      if (Object.keys(props).length) ops.push({ k: 'set', id, props })
      continue
    }
    const w = Math.max(8, o.w * sx)
    const h = Math.max(8, o.type === 'emoji' ? w : o.h * sy)
    ops.push({ k: 'set', id, props: { x: px(o.x), y: py(o.y), w, h } })
  }
  return ops
}

export type AlignEdge = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'

/** Aligns objects to the edge of their joint bounds. */
export function align(board: Board, ids: Iterable<string>, edge: AlignEdge): Op[] {
  const list = [...ids].map((id) => board.objects[id]).filter((o): o is BoardObject => !!o && o.type !== 'connector' && !o.locked)
  const box = unionRects(list.map((o) => bounds(o)))
  if (!box || list.length < 2) return []
  return list.flatMap((o) => {
    const b = bounds(o)
    const dx = edge === 'left' ? box.x - b.x : edge === 'right' ? box.x + box.w - (b.x + b.w) : edge === 'centerX' ? box.x + box.w / 2 - (b.x + b.w / 2) : 0
    const dy = edge === 'top' ? box.y - b.y : edge === 'bottom' ? box.y + box.h - (b.y + b.h) : edge === 'centerY' ? box.y + box.h / 2 - (b.y + b.h / 2) : 0
    return dx || dy ? moveObjects(board, [o.id], dx, dy) : []
  })
}

/** Spreads 3+ objects evenly along an axis. */
export function distribute(board: Board, ids: Iterable<string>, axis: 'x' | 'y'): Op[] {
  const list = [...ids].map((id) => board.objects[id]).filter((o): o is BoardObject => !!o && o.type !== 'connector' && !o.locked)
  if (list.length < 3) return []
  const items = list.map((o) => ({ o, b: bounds(o) })).sort((a, b) => (axis === 'x' ? a.b.x - b.b.x : a.b.y - b.b.y))
  const first = items[0]!.b, last = items[items.length - 1]!.b
  const total = items.reduce((s, i) => s + (axis === 'x' ? i.b.w : i.b.h), 0)
  const span = axis === 'x' ? last.x + last.w - first.x : last.y + last.h - first.y
  const gap = (span - total) / (items.length - 1)
  let pos = axis === 'x' ? first.x : first.y
  const ops: Op[] = []
  for (const { o, b } of items) {
    const delta = pos - (axis === 'x' ? b.x : b.y)
    if (Math.abs(delta) > 0.01) ops.push(...moveObjects(board, [o.id], axis === 'x' ? delta : 0, axis === 'y' ? delta : 0))
    pos += (axis === 'x' ? b.w : b.h) + gap
  }
  return ops
}

/** True when every object of the rect is inside a frame (helper for drop targets). */
export function isInside(frame: Rect, obj: Rect): boolean {
  return contains(frame, obj)
}

function pick(o: Record<string, unknown>, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of keys) if (typeof o[k] === 'number') out[k] = o[k] as number
  return out
}
