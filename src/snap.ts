import type { Rect } from './model/types'

export interface Guide {
  axis: 'x' | 'y'
  /** World coordinate of the line. */
  at: number
  from: number
  to: number
}

/**
 * Snaps a moving rect to the edges and centres of other rects: returns the
 * correction (dx, dy) within `threshold` (world units) and the guide lines to draw.
 */
export function snapRect(moving: Rect, others: Rect[], threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const xs = [moving.x, moving.x + moving.w / 2, moving.x + moving.w]
  const ys = [moving.y, moving.y + moving.h / 2, moving.y + moving.h]
  let bestX: { d: number; at: number } | null = null
  let bestY: { d: number; at: number } | null = null
  for (const r of others) {
    for (const t of [r.x, r.x + r.w / 2, r.x + r.w]) for (const s of xs) {
      const d = t - s
      if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: t }
    }
    for (const t of [r.y, r.y + r.h / 2, r.y + r.h]) for (const s of ys) {
      const d = t - s
      if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: t }
    }
  }
  const dx = bestX?.d ?? 0
  const dy = bestY?.d ?? 0
  const moved = { x: moving.x + dx, y: moving.y + dy, w: moving.w, h: moving.h }
  const guides: Guide[] = []
  if (bestX) {
    const touching = others.filter((r) => [r.x, r.x + r.w / 2, r.x + r.w].some((v) => Math.abs(v - bestX!.at) < 0.5))
    const ys2 = [moved.y, moved.y + moved.h, ...touching.flatMap((r) => [r.y, r.y + r.h])]
    guides.push({ axis: 'x', at: bestX.at, from: Math.min(...ys2), to: Math.max(...ys2) })
  }
  if (bestY) {
    const touching = others.filter((r) => [r.y, r.y + r.h / 2, r.y + r.h].some((v) => Math.abs(v - bestY!.at) < 0.5))
    const xs2 = [moved.x, moved.x + moved.w, ...touching.flatMap((r) => [r.x, r.x + r.w])]
    guides.push({ axis: 'y', at: bestY.at, from: Math.min(...xs2), to: Math.max(...xs2) })
  }
  return { dx, dy, guides }
}
