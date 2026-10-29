/**
 * One renderer for the screen and for export: objects become a small SVG
 * tree; Vue turns it into elements, `boardToSvg` into a string. Colours are
 * CSS variables with fallbacks, so the page theme applies on screen and the
 * fallbacks in an exported file.
 */
import type { Board, BoardObject, ConnectorObject, Point, Rect, StickyColor, TextVariant } from './model/types'
import { bounds, center, connectorPoints, FRAME_TITLE_BAND, shapePath, stacked, unionRects } from './geometry'
import { approximateMeasurer, fitFontSize, LINE_HEIGHT, wrapLines, type TextMeasurer } from './text'

export interface SvgNode {
  tag: string
  attrs?: Record<string, string | number | undefined>
  children?: (SvgNode | string)[]
}

export interface RenderOptions {
  measure?: TextMeasurer
  fontFamily?: string
}

export const STICKY_FILL: Record<StickyColor, string> = {
  yellow: '#fff3a3',
  orange: '#ffd8a8',
  pink: '#ffc9de',
  violet: '#e0d4ff',
  blue: '#c5ddff',
  cyan: '#b9eef0',
  green: '#c9f2c7',
  gray: '#e3e6eb',
}

/** Palette for shape fills and strokes, text and connectors (the swatches of the editor). */
export const PALETTE = ['#1f2937', '#64748b', '#ffffff', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#fde68a', '#bfdbfe', '#bbf7d0']

const V = {
  text: 'var(--bd-text, #1f2937)',
  stroke: 'var(--bd-stroke, #1f2937)',
  shapeFill: 'var(--bd-shape-fill, #ffffff)',
  frameFill: 'var(--bd-frame-fill, #f6f7f9)',
  frameStroke: 'var(--bd-frame-stroke, #d5d9e0)',
  frameTitle: 'var(--bd-frame-title, #5b6472)',
  connector: 'var(--bd-connector, #475569)',
  labelBg: 'var(--bd-surface, #ffffff)',
  stickyText: '#1f2937',
}

export const TEXT_STYLE: Record<TextVariant, { size: number; weight: number }> = {
  title: { size: 36, weight: 700 },
  h2: { size: 24, weight: 600 },
  body: { size: 16, weight: 400 },
}

const PAD = 12

/** Text on an explicit fill: dark on light colours, white on dark ones; the theme's colour otherwise. */
export function textOn(fill: string | undefined, themed: string): string {
  const m = fill ? /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(fill) : null
  if (!m) return themed
  const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1f2937' : '#ffffff'
}

function textBlock(lines: string[], box: Rect, size: number, weight: number, fill: string, align: 'left' | 'center' | 'right' = 'center', valign: 'top' | 'middle' = 'middle'): SvgNode {
  const lh = size * LINE_HEIGHT
  const total = lines.length * lh
  const top = valign === 'middle' ? box.y + (box.h - total) / 2 : box.y
  const x = align === 'left' ? box.x : align === 'right' ? box.x + box.w : box.x + box.w / 2
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'
  return {
    tag: 'text',
    attrs: { 'font-size': size, 'font-weight': weight, fill, 'text-anchor': anchor, class: 'bd-text' },
    children: lines.map((line, i) => ({ tag: 'tspan', attrs: { x, y: top + i * lh + size * 0.95 }, children: [line || ' '] })),
  }
}

function rotated(o: BoardObject, node: SvgNode): SvgNode {
  if (!o.rotation) return node
  const c = center(o)
  return { tag: 'g', attrs: { transform: `rotate(${o.rotation} ${c.x} ${c.y})` }, children: [node] }
}

/** An object as an SVG tree (a `g` with `data-id`). */
export function renderObject(o: BoardObject, board: Board, options: RenderOptions = {}): SvgNode {
  const measure = options.measure ?? approximateMeasurer
  const g = (children: (SvgNode | string)[], extra: Record<string, string | number | undefined> = {}): SvgNode => ({
    tag: 'g',
    attrs: { 'data-id': o.id, class: `bd-obj bd-${o.type}`, ...extra },
    children,
  })
  switch (o.type) {
    case 'sticky': {
      const inner = { x: o.x + PAD, y: o.y + PAD, w: o.w - 2 * PAD, h: o.h - 2 * PAD }
      const text = o.text ?? ''
      const size = typeof o.fontSize === 'number' ? o.fontSize : fitFontSize(text || 'M', inner.w, inner.h, measure)
      const lines = wrapLines(text, inner.w, { size }, measure, Math.max(1, Math.floor(inner.h / (size * LINE_HEIGHT))))
      return rotated(o, g([
        { tag: 'rect', attrs: { x: o.x, y: o.y + 3, width: o.w, height: o.h, rx: 3, fill: 'rgba(0,0,0,0.10)', class: 'bd-shadow' } },
        { tag: 'rect', attrs: { x: o.x, y: o.y, width: o.w, height: o.h, rx: 3, fill: STICKY_FILL[o.color] ?? STICKY_FILL.yellow } },
        textBlock(lines, inner, size, 400, V.stickyText),
      ]))
    }
    case 'shape': {
      const strokeWidth = o.strokeWidth ?? 2
      const inner = { x: o.x + PAD, y: o.y + PAD, w: o.w - 2 * PAD, h: o.h - 2 * PAD }
      const size = o.fontSize ?? 16
      const lines = o.text ? wrapLines(o.text, inner.w, { size }, measure, Math.max(1, Math.floor(inner.h / (size * LINE_HEIGHT)))) : []
      return rotated(o, g([
        {
          tag: 'path',
          attrs: {
            d: shapePath(o.kind, o.w, o.h),
            transform: `translate(${o.x} ${o.y})`,
            fill: o.fill ?? V.shapeFill,
            stroke: o.stroke ?? V.stroke,
            'stroke-width': strokeWidth,
            'stroke-dasharray': o.strokeStyle === 'dashed' ? `${strokeWidth * 4} ${strokeWidth * 3}` : undefined,
            'stroke-linejoin': 'round',
          },
        },
        ...(lines.length ? [textBlock(lines, inner, size, 400, textOn(o.fill, V.text), o.textAlign ?? 'center')] : []),
      ]))
    }
    case 'text': {
      const st = TEXT_STYLE[o.variant] ?? TEXT_STYLE.body
      const lines = wrapLines(o.text || ' ', o.w, { size: st.size, weight: st.weight }, measure)
      return rotated(o, g([
        { tag: 'rect', attrs: { x: o.x, y: o.y, width: o.w, height: o.h, fill: 'transparent' } },
        textBlock(lines, { x: o.x, y: o.y, w: o.w, h: o.h }, st.size, st.weight, o.color ?? V.text, o.align ?? 'left', 'top'),
      ]))
    }
    case 'frame':
      return g([
        { tag: 'rect', attrs: { x: o.x, y: o.y, width: o.w, height: o.h, rx: 8, fill: o.fill ?? V.frameFill, stroke: V.frameStroke, 'stroke-width': 1 } },
        { tag: 'text', attrs: { x: o.x + 12, y: o.y + FRAME_TITLE_BAND - 9, 'font-size': 14, 'font-weight': 600, fill: o.fill ? textOn(o.fill, V.frameTitle) : V.frameTitle, 'fill-opacity': o.fill ? 0.75 : undefined, class: 'bd-text' }, children: [o.title || ''] },
      ])
    case 'emoji': {
      const size = Math.min(o.w, o.h) * 0.82
      return rotated(o, g([
        { tag: 'rect', attrs: { x: o.x, y: o.y, width: o.w, height: o.h, fill: 'transparent' } },
        { tag: 'text', attrs: { x: o.x + o.w / 2, y: o.y + o.h / 2 + size * 0.35, 'font-size': size, 'text-anchor': 'middle', class: 'bd-emoji' }, children: [o.char] },
      ]))
    }
    case 'connector':
      return renderConnector(o, board, measure, g)
  }
}

function renderConnector(o: ConnectorObject, board: Board, measure: TextMeasurer, g: (c: (SvgNode | string)[], extra?: Record<string, string | number | undefined>) => SvgNode): SvgNode {
  const pts = connectorPoints(o, board)
  const stroke = o.stroke ?? V.connector
  const width = o.strokeWidth ?? 2
  const d = o.route === 'curve' && pts.length === 4 ? `M${f(pts[0]!)} C${f(pts[1]!)} ${f(pts[2]!)} ${f(pts[3]!)}` : roundedPolyline(pts, o.route === 'elbow' ? 8 : 0)
  const children: (SvgNode | string)[] = [
    { tag: 'path', attrs: { d, fill: 'none', stroke: 'transparent', 'stroke-width': 14, class: 'bd-hit' } },
    { tag: 'path', attrs: { d, fill: 'none', stroke, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': o.strokeStyle === 'dashed' ? `${width * 4} ${width * 3}` : undefined } },
  ]
  const n = pts.length
  if (n >= 2) {
    const head = arrowHead(o.endArrow ?? 'arrow', pts[n - 1]!, o.route === 'curve' && n === 4 ? pts[2]! : pts[n - 2]!, stroke, width)
    const tail = arrowHead(o.startArrow ?? 'none', pts[0]!, pts[1]!, stroke, width)
    if (head) children.push(head)
    if (tail) children.push(tail)
  }
  if (o.label) {
    const mid = midpoint(pts)
    const size = 13
    const w = measure(o.label, { size }) + 12
    children.push(
      { tag: 'rect', attrs: { x: mid.x - w / 2, y: mid.y - 11, width: w, height: 22, rx: 4, fill: V.labelBg } },
      { tag: 'text', attrs: { x: mid.x, y: mid.y + 4.5, 'font-size': size, 'text-anchor': 'middle', fill: V.text, class: 'bd-text' }, children: [o.label] },
    )
  }
  return g(children)
}

const f = (p: Point) => `${round(p.x)} ${round(p.y)}`
const round = (n: number) => Math.round(n * 10) / 10

function roundedPolyline(pts: Point[], radius: number): string {
  if (pts.length < 3 || radius === 0) return 'M' + pts.map(f).join(' L')
  let d = `M${f(pts[0]!)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!, b = pts[i]!, c = pts[i + 1]!
    const r = Math.min(radius, dist(a, b) / 2, dist(b, c) / 2)
    const p1 = towards(b, a, r), p2 = towards(b, c, r)
    d += ` L${f(p1)} Q${f(b)} ${f(p2)}`
  }
  return d + ` L${f(pts[pts.length - 1]!)}`
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function towards(from: Point, to: Point, len: number): Point {
  const d = dist(from, to) || 1
  return { x: from.x + ((to.x - from.x) / d) * len, y: from.y + ((to.y - from.y) / d) * len }
}

function midpoint(pts: Point[]): Point {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1]!, pts[i]!)
  let walk = total / 2
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1]!, pts[i]!)
    if (walk <= seg) return towards(pts[i - 1]!, pts[i]!, walk)
    walk -= seg
  }
  return pts[0] ?? { x: 0, y: 0 }
}

function arrowHead(kind: string, tip: Point, from: Point, color: string, width: number): SvgNode | null {
  if (kind === 'none') return null
  const size = 8 + width * 2
  const a = Math.atan2(tip.y - from.y, tip.x - from.x)
  const pt = (angle: number, len: number) => ({ x: tip.x - Math.cos(angle) * len, y: tip.y - Math.sin(angle) * len })
  if (kind === 'circle') {
    const c = pt(a, size / 2)
    return { tag: 'circle', attrs: { cx: round(c.x), cy: round(c.y), r: size / 2.4, fill: color } }
  }
  const l = pt(a - 0.45, size), r = pt(a + 0.45, size)
  if (kind === 'triangle') return { tag: 'path', attrs: { d: `M${f(tip)} L${f(l)} L${f(r)} Z`, fill: color } }
  return { tag: 'path', attrs: { d: `M${f(l)} L${f(tip)} L${f(r)}`, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } }
}

// ---------- export ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function nodeToString(node: SvgNode | string): string {
  if (typeof node === 'string') return esc(node)
  const attrs = Object.entries(node.attrs ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join('')
  const children = (node.children ?? []).map(nodeToString).join('')
  return `<${node.tag}${attrs}>${children}</${node.tag}>`
}

export interface ExportOptions extends RenderOptions {
  /** Only these objects (and the contents of frames among them). */
  ids?: Iterable<string>
  padding?: number
  background?: string
}

/** The board (or part of it) as a standalone SVG document. */
export function boardToSvg(board: Board, options: ExportOptions = {}): { svg: string; width: number; height: number } {
  const only = options.ids ? new Set(options.ids) : null
  if (only) for (const o of Object.values(board.objects)) if (o.parent && only.has(o.parent)) only.add(o.id)
  const objects = stacked(board).filter((o) => !only || only.has(o.id))
  const box = unionRects(objects.map((o) => bounds(o, board))) ?? { x: 0, y: 0, w: 1, h: 1 }
  const pad = options.padding ?? 32
  const vb = { x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad }
  const family = options.fontFamily ?? 'Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
  const body = objects.map((o) => nodeToString(renderObject(o, board, options))).join('')
  const bg = options.background ? `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="${esc(options.background)}"/>` : ''
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(vb.x)} ${round(vb.y)} ${round(vb.w)} ${round(vb.h)}" width="${Math.ceil(vb.w)}" height="${Math.ceil(vb.h)}" font-family="${esc(family)}">` +
    bg + body + '</svg>'
  return { svg, width: Math.ceil(vb.w), height: Math.ceil(vb.h) }
}
