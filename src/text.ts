/**
 * Text layout without a DOM: rendering must also run in Node (SVG export), so
 * the default measurer is a glyph-class table; the browser passes a canvas
 * measurer for an exact fit.
 */

export interface FontSpec {
  size: number
  weight?: number
}

export type TextMeasurer = (text: string, font: FontSpec) => number

const NARROW = new Set([...`il.,:;'|!()[]{}ftjrI1 `])
const WIDE = new Set([...'mwMW@%ЖШЩЮжшщю—'])

function glyph(ch: string): number {
  if (NARROW.has(ch)) return ch === ' ' ? 0.28 : 0.3
  if (WIDE.has(ch)) return 0.88
  const code = ch.codePointAt(0)!
  if (code >= 0x1f000) return 1.2 // emoji
  if (code >= 0x2e80) return 1
  if (ch >= '0' && ch <= '9') return 0.57
  if (ch !== ch.toLowerCase()) return 0.68
  if (code >= 0x0400 && code <= 0x04ff) return 0.58
  return 0.54
}

export const approximateMeasurer: TextMeasurer = (text, font) => {
  let em = 0
  for (const ch of text) em += glyph(ch)
  return em * font.size * ((font.weight ?? 400) >= 600 ? 1.06 : 1)
}

export const LINE_HEIGHT = 1.3

/**
 * Lines of text no wider than `max`: paragraphs split at newlines, then at
 * spaces; a word wider than a line is split by characters. Up to `maxLines`
 * (the last one ends with "…" when text is left over).
 */
export function wrapLines(text: string, max: number, font: FontSpec, measure: TextMeasurer, maxLines = Infinity): string[] {
  const lines: string[] = []
  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n')
  outer: for (const paragraph of paragraphs) {
    const words = paragraph.split(/ +/)
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (measure(next, font) <= max || next === '') {
        line = next
        continue
      }
      if (line) lines.push(line)
      if (lines.length >= maxLines) break outer
      line = word
      // A long word: cut it into pieces that fit.
      while (measure(line, font) > max && line.length > 1) {
        let cut = line.length - 1
        while (cut > 1 && measure(line.slice(0, cut), font) > max) cut--
        lines.push(line.slice(0, cut))
        if (lines.length >= maxLines) break outer
        line = line.slice(cut)
      }
    }
    lines.push(line)
    if (lines.length >= maxLines) break
  }
  const total = text.replace(/\s+/g, '').length
  const shown = lines.join('').replace(/\s+/g, '').length
  if (lines.length > maxLines || (lines.length === maxLines && shown < total)) {
    lines.length = maxLines
    let last = lines[maxLines - 1] ?? ''
    while (last.length > 0 && measure(`${last}…`, font) > max) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last}…`
  }
  return lines
}

/** The largest font size from `sizes` (descending) at which the text fits the box. */
export function fitFontSize(text: string, w: number, h: number, measure: TextMeasurer, sizes: number[] = [32, 28, 24, 20, 18, 16, 14, 12, 10], weight = 400): number {
  const words = text.split(/\s+/).filter(Boolean)
  for (const size of sizes) {
    // Never split a word to fit: pick a size at which every word fits a line.
    if (words.some((word) => measure(word, { size, weight }) > w)) continue
    const lines = wrapLines(text, w, { size, weight }, measure)
    const tooWide = lines.some((l) => measure(l, { size, weight }) > w)
    if (!tooWide && lines.length * size * LINE_HEIGHT <= h) return size
  }
  return sizes[sizes.length - 1] ?? 10
}
