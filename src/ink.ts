import type { Board, InkObject, InkTool, Point } from './model/types'
import type { Op } from './model/ops'
import { newId } from './model/ids'
import { keyBetween } from './model/zindex'
import { pointsBounds, rotatePoint, center } from './geometry'

/** At most this many points in one stroke; a longer one is split. */
export const MAX_INK_POINTS = 2000

/** Ramer–Douglas–Peucker: drops points closer than `epsilon` to the simplified line. */
export function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points.slice()
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let max = 0
    let index = -1
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(points[i]!, points[a]!, points[b]!)
      if (d > max) {
        max = d
        index = i
      }
    }
    if (max > epsilon && index > 0) {
      keep[index] = 1
      stack.push([a, index], [index, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

const r = (n: number) => Math.round(n * 10) / 10

/** A smooth SVG path through the points: quadratic curves between midpoints. */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    const p = points[0]!
    return `M${r(p.x)} ${r(p.y)} L${r(p.x + 0.01)} ${r(p.y)}`
  }
  if (points.length === 2) return `M${r(points[0]!.x)} ${r(points[0]!.y)} L${r(points[1]!.x)} ${r(points[1]!.y)}`
  let d = `M${r(points[0]!.x)} ${r(points[0]!.y)}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!
    const n = points[i + 1]!
    d += ` Q${r(p.x)} ${r(p.y)} ${r((p.x + n.x) / 2)} ${r((p.y + n.y) / 2)}`
  }
  const last = points[points.length - 1]!
  return d + ` L${r(last.x)} ${r(last.y)}`
}

/** The stroke's points as `{x, y}` in its own box (vw × vh). */
export function inkLocalPoints(o: InkObject): Point[] {
  const out: Point[] = []
  for (let i = 0; i + 1 < o.points.length; i += 2) out.push({ x: o.points[i]!, y: o.points[i + 1]! })
  return out
}

/** The stroke's points in world coordinates (size and rotation applied). */
export function inkWorldPoints(o: InkObject): Point[] {
  const sx = o.w / o.vw
  const sy = o.h / o.vh
  const c = center(o)
  return inkLocalPoints(o).map((p) => rotatePoint({ x: o.x + p.x * sx, y: o.y + p.y * sy }, c, o.rotation ?? 0))
}

export interface InkStyle {
  tool: InkTool
  color: string
  width: number
}

/**
 * Strokes from points drawn in world coordinates: simplified, split into
 * pieces of at most MAX_INK_POINTS, each its own object on top of the stack.
 */
export function createInk(board: Board, drawn: Point[], style: InkStyle, epsilon = 0.6): { ids: string[]; ops: Op[] } {
  const pts = simplify(drawn, epsilon)
  if (pts.length === 0) return { ids: [], ops: [] }
  let top: string | null = null
  for (const o of Object.values(board.objects)) if (top === null || o.z > top) top = o.z
  const ids: string[] = []
  const ops: Op[] = []
  for (let start = 0; start < pts.length; start += MAX_INK_POINTS - 1) {
    const piece = pts.slice(start, start + MAX_INK_POINTS)
    if (piece.length === 1 && start > 0) break
    const box = pointsBounds(piece)
    const pad = style.width / 2
    const x = box.x - pad
    const y = box.y - pad
    const w = Math.max(1, box.w + style.width)
    const h = Math.max(1, box.h + style.width)
    const points: number[] = []
    for (const p of piece) points.push(r(p.x - x), r(p.y - y))
    const id = newId()
    top = keyBetween(top, null)
    const obj: InkObject = { id, type: 'ink', tool: style.tool, color: style.color, width: style.width, points, vw: w, vh: h, x, y, w, h, z: top }
    ops.push({ k: 'create', id, obj })
    ids.push(id)
  }
  return { ids, ops }
}
