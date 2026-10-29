import type { Board, BoardObject, ConnectorEnd, ConnectorObject, Point, Rect, ShapeKind, Side } from './model/types'
import { compareZ } from './model/zindex'
import { inkWorldPoints } from './ink'

export function center(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

export function rotatePoint(p: Point, c: Point, degrees: number): Point {
  if (!degrees) return p
  const a = (degrees * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

/** The axis-aligned bounds of an object, its rotation included. Connectors: the bounds of their path. */
export function bounds(obj: BoardObject, board?: Board): Rect {
  if (obj.type === 'connector' && board) return pointsBounds(connectorPoints(obj, board))
  if (!obj.rotation) return { x: obj.x, y: obj.y, w: obj.w, h: obj.h }
  const c = center(obj)
  const corners = [
    { x: obj.x, y: obj.y },
    { x: obj.x + obj.w, y: obj.y },
    { x: obj.x + obj.w, y: obj.y + obj.h },
    { x: obj.x, y: obj.y + obj.h },
  ].map((p) => rotatePoint(p, c, obj.rotation!))
  return pointsBounds(corners)
}

export function pointsBounds(points: Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  return pointsBounds(rects.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }]))
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

export function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
}

/** The board's objects bottom to top. */
export function stacked(board: Board): BoardObject[] {
  return Object.values(board.objects).sort(compareZ)
}

/** The bounds of the whole board, or null when it is empty. */
export function boardBounds(board: Board): Rect | null {
  return unionRects(Object.values(board.objects).map((o) => bounds(o, board)))
}

/** Objects whose bounds touch the rect (what to draw in a viewport), bottom to top. */
export function visibleObjects(board: Board, view: Rect, margin = 0): BoardObject[] {
  const r = { x: view.x - margin, y: view.y - margin, w: view.w + 2 * margin, h: view.h + 2 * margin }
  return stacked(board).filter((o) => intersects(r, bounds(o, board)))
}

/** The topmost object under a point (rotation respected; frames only by their title band or edge). */
export function hitTest(board: Board, p: Point, tolerance = 4): BoardObject | null {
  const all = stacked(board)
  for (let i = all.length - 1; i >= 0; i--) {
    const o = all[i]!
    if (o.type === 'connector') {
      if (distanceToPolyline(p, connectorPoints(o, board)) <= tolerance + (o.strokeWidth ?? 2)) return o
      continue
    }
    if (o.type === 'ink') {
      if (hitsInk(o, p, tolerance)) return o
      continue
    }
    const local = rotatePoint(p, center(o), -(o.rotation ?? 0))
    const inside = local.x >= o.x - tolerance && local.x <= o.x + o.w + tolerance && local.y >= o.y - tolerance && local.y <= o.y + o.h + tolerance
    if (!inside) continue
    if (o.type === 'frame') {
      const edge = Math.min(local.x - o.x, o.x + o.w - local.x, local.y - o.y, o.y + o.h - local.y)
      if (local.y < o.y + FRAME_TITLE_BAND || edge <= tolerance * 2 || !hasObjectAt(all.slice(0, i), p)) return o
      continue
    }
    return o
  }
  return null
}

export const FRAME_TITLE_BAND = 28

/** Whether a point touches a stroke (its line, not its bounding box). */
export function hitsInk(o: Extract<BoardObject, { type: 'ink' }>, p: Point, tolerance = 4): boolean {
  const b = bounds(o)
  const pad = tolerance + o.width
  if (p.x < b.x - pad || p.x > b.x + b.w + pad || p.y < b.y - pad || p.y > b.y + b.h + pad) return false
  const pts = inkWorldPoints(o)
  if (pts.length === 1) return Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y) <= tolerance + o.width / 2
  return distanceToPolyline(p, pts) <= tolerance + o.width / 2
}

function hasObjectAt(below: BoardObject[], p: Point): boolean {
  return below.some((o) => o.type !== 'frame' && o.type !== 'connector' && p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h)
}

/** Objects entirely inside a selection rectangle (connectors: both ends inside). */
export function objectsInRect(board: Board, r: Rect): BoardObject[] {
  return stacked(board).filter((o) => contains(r, bounds(o, board)))
}

// ---------- connectors ----------

export function sidePoint(r: Rect, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: r.x + r.w / 2, y: r.y }
    case 'right':
      return { x: r.x + r.w, y: r.y + r.h / 2 }
    case 'bottom':
      return { x: r.x + r.w / 2, y: r.y + r.h }
    case 'left':
      return { x: r.x, y: r.y + r.h / 2 }
  }
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

/** The side of `r` that faces `toward`. */
export function facingSide(r: Rect, toward: Point): Side {
  const c = center(r)
  const dx = (toward.x - c.x) / Math.max(r.w, 1)
  const dy = (toward.y - c.y) / Math.max(r.h, 1)
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top'
}

interface ResolvedEnd {
  point: Point
  side?: Side
  rect?: Rect
}

/** Where a connector end is: on its object's side (the given one or the one facing the other end), or the free point. */
export function resolveEnd(end: ConnectorEnd, other: ConnectorEnd, board: Board): ResolvedEnd {
  if ('id' in end) {
    const target = board.objects[end.id]
    // A connector to a deleted object stays where the object was last seen: the editor keeps x/y on the connector for that.
    if (target && target.type !== 'connector') {
      const rect = bounds(target)
      const side = end.side ?? facingSide(rect, endHint(other, board))
      return { point: sidePoint(rect, side), side, rect }
    }
    return { point: { x: 0, y: 0 } }
  }
  return { point: { x: end.x, y: end.y } }
}

function endHint(end: ConnectorEnd, board: Board): Point {
  if ('id' in end) {
    const t = board.objects[end.id]
    return t ? center(bounds(t)) : { x: 0, y: 0 }
  }
  return end
}

const STUB = 24

/** The connector's polyline: straight, orthogonal (`elbow`) or the control polygon of a curve. */
export function connectorPoints(c: ConnectorObject, board: Board): Point[] {
  const a = resolveEnd(c.from, c.to, board)
  const b = resolveEnd(c.to, c.from, board)
  if (c.route === 'straight') return [a.point, b.point]
  if (c.route === 'curve') {
    const s1 = stub(a.point, a.side, Math.max(STUB, dist(a.point, b.point) / 3))
    const s2 = stub(b.point, b.side, Math.max(STUB, dist(a.point, b.point) / 3))
    return [a.point, s1, s2, b.point]
  }
  return elbow(a, b)
}

function stub(p: Point, side: Side | undefined, len: number): Point {
  switch (side) {
    case 'top':
      return { x: p.x, y: p.y - len }
    case 'bottom':
      return { x: p.x, y: p.y + len }
    case 'left':
      return { x: p.x - len, y: p.y }
    case 'right':
      return { x: p.x + len, y: p.y }
    default:
      return p
  }
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** An orthogonal route: out of each side by a stub, then one or two bends. */
function elbow(a: ResolvedEnd, b: ResolvedEnd): Point[] {
  const p1 = stub(a.point, a.side, STUB)
  const p2 = stub(b.point, b.side, STUB)
  const horizontalA = a.side === 'left' || a.side === 'right'
  const horizontalB = b.side === 'left' || b.side === 'right'
  const mid: Point[] = []
  if (horizontalA && horizontalB) {
    const mx = (p1.x + p2.x) / 2
    mid.push({ x: mx, y: p1.y }, { x: mx, y: p2.y })
  } else if (!horizontalA && !horizontalB && a.side && b.side) {
    const my = (p1.y + p2.y) / 2
    mid.push({ x: p1.x, y: my }, { x: p2.x, y: my })
  } else if (horizontalA || (!a.side && horizontalB)) {
    mid.push({ x: p2.x, y: p1.y })
  } else {
    mid.push({ x: p1.x, y: p2.y })
  }
  return dedupe([a.point, p1, ...mid, p2, b.point])
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) out.push(p)
  }
  // Drop middle points of straight runs.
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true
    const a = out[i - 1]!, b = out[i + 1]!
    return !((Math.abs(a.x - p.x) < 0.01 && Math.abs(b.x - p.x) < 0.01) || (Math.abs(a.y - p.y) < 0.01 && Math.abs(b.y - p.y) < 0.01))
  })
}

export function distanceToPolyline(p: Point, points: Point[]): number {
  let best = Infinity
  for (let i = 1; i < points.length; i++) best = Math.min(best, distanceToSegment(p, points[i - 1]!, points[i]!))
  return best
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// ---------- shapes ----------

/** An SVG path for a shape kind in its own box (0,0 – w,h). */
export function shapePath(kind: ShapeKind, w: number, h: number): string {
  const f = (n: number) => Math.round(n * 100) / 100
  const poly = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L') + ' Z'
  switch (kind) {
    case 'rect':
      return poly([[0, 0], [w, 0], [w, h], [0, h]])
    case 'rounded': {
      const r = Math.min(16, w / 4, h / 4)
      return `M${f(r)} 0 H${f(w - r)} Q${f(w)} 0 ${f(w)} ${f(r)} V${f(h - r)} Q${f(w)} ${f(h)} ${f(w - r)} ${f(h)} H${f(r)} Q0 ${f(h)} 0 ${f(h - r)} V${f(r)} Q0 0 ${f(r)} 0 Z`
    }
    case 'ellipse':
      return `M0 ${f(h / 2)} A${f(w / 2)} ${f(h / 2)} 0 1 0 ${f(w)} ${f(h / 2)} A${f(w / 2)} ${f(h / 2)} 0 1 0 0 ${f(h / 2)} Z`
    case 'diamond':
      return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])
    case 'triangle':
      return poly([[w / 2, 0], [w, h], [0, h]])
    case 'parallelogram': {
      const s = w * 0.2
      return poly([[s, 0], [w, 0], [w - s, h], [0, h]])
    }
    case 'hexagon': {
      const s = w * 0.22
      return poly([[s, 0], [w - s, 0], [w, h / 2], [w - s, h], [s, h], [0, h / 2]])
    }
    case 'star': {
      const pts: [number, number][] = []
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 0.5 : 0.2
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        pts.push([w / 2 + Math.cos(a) * w * r, h / 2 + Math.sin(a) * h * r + h * 0.04])
      }
      return poly(pts)
    }
  }
}

export { OPPOSITE }
