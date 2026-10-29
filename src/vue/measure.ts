/**
 * Text measuring in the browser: a canvas with the page's font, cached. In
 * jsdom (tests) and without a canvas, the core's glyph table.
 */
import { approximateMeasurer, type TextMeasurer } from '../index'

interface Ctx {
  font: string
  measureText(text: string): { width: number }
}

let ctx: Ctx | null | undefined

function context(): Ctx | null {
  if (ctx !== undefined) return ctx
  ctx = null
  try {
    if (typeof document === 'undefined' || navigator.userAgent.includes('jsdom')) return ctx
    ctx = document.createElement('canvas').getContext('2d') as Ctx | null
  } catch {
    ctx = null
  }
  return ctx
}

const caches = new Map<string, TextMeasurer>()

/** A measurer for a font family (the computed `font-family` of the canvas element). */
export function canvasMeasurer(family: string): TextMeasurer {
  const c = context()
  if (!c || !family) return approximateMeasurer
  let m = caches.get(family)
  if (m) return m
  const cache = new Map<string, number>()
  m = (text, font) => {
    const key = `${font.size}|${font.weight ?? 400}|${text}`
    let w = cache.get(key)
    if (w === undefined) {
      c.font = `${font.weight ?? 400} ${font.size}px ${family}`
      // A pixel of slack per side: canvas and SVG round differently.
      w = c.measureText(text).width + 1
      if (cache.size > 5000) cache.clear()
      cache.set(key, w)
    }
    return w
  }
  caches.set(family, m)
  return m
}
