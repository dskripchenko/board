import { describe, expect, it } from 'vitest'
import { applyOps, emptyBoard, insertTemplate, listTemplates, parseBoard, stringifyBoard, type Board, type BoardObject } from '../src'

const ids = listTemplates().map((t) => t.id)

function place(id: (typeof ids)[number], board: Board = emptyBoard(), locale?: string) {
  const result = insertTemplate(board, id, { x: 1000, y: 500 }, locale)
  return { ...result, board: applyOps(board, result.ops).board }
}

describe('workshop templates', () => {
  it('are listed in English and Russian', () => {
    expect(ids).toEqual(['event-storming', 'customer-journey', 'story-map', 'retrospective'])
    expect(listTemplates('ru-RU').map((t) => t.title)).toEqual(['Event storming', 'Карта пути клиента', 'Карта пользовательских историй', 'Ретроспектива'])
  })

  it.each(ids)('%s makes a valid board, centred where asked', (id) => {
    const { board, ids: created, bounds } = place(id)
    expect(Object.keys(board.objects)).toHaveLength(created.length)
    // Survives a round trip through the board format.
    expect(parseBoard(stringifyBoard(board))).toEqual(board)
    expect(bounds.x + bounds.w / 2).toBeCloseTo(1000, -1)
    expect(bounds.y + bounds.h / 2).toBeCloseTo(500, -1)
    for (const o of Object.values(board.objects) as BoardObject[]) {
      if (o.parent) {
        const p = board.objects[o.parent]!
        expect(p.type).toBe('frame')
        // Children sit inside their frame (connectors by their ends).
        if (o.type !== 'connector') {
          expect(o.x).toBeGreaterThanOrEqual(p.x)
          expect(o.y).toBeGreaterThanOrEqual(p.y)
          expect(o.x + o.w).toBeLessThanOrEqual(p.x + p.w + 1)
          expect(o.y + o.h).toBeLessThanOrEqual(p.y + p.h + 1)
        }
        // A frame is below what it holds.
        expect(p.z < o.z).toBe(true)
      }
    }
  })

  it('goes on top of what the board has', () => {
    const first = place('retrospective')
    const second = place('story-map', first.board)
    const top = Math.max(...first.ids.map((i) => first.board.objects[i]!.z.length))
    expect(top).toBeGreaterThan(0)
    const oldMax = first.ids.map((i) => first.board.objects[i]!.z).sort().pop()!
    for (const i of second.ids) expect(second.board.objects[i]!.z > oldMax).toBe(true)
    // Fresh ids every time.
    expect(second.ids.some((i) => first.ids.includes(i))).toBe(false)
  })

  it('event storming has the legend of sticky kinds and an example on the timeline', () => {
    const { board } = place('event-storming', emptyBoard(), 'ru')
    const stickies = Object.values(board.objects).filter((o) => o.type === 'sticky')
    const colors = new Set(stickies.map((o) => (o as { color: string }).color))
    expect(colors).toEqual(new Set(['orange', 'blue', 'yellow', 'violet', 'green', 'pink']))
    expect(stickies.some((o) => (o as { text?: string }).text === 'Заказ оформлен')).toBe(true)
    expect(stickies.filter((o) => o.rotation === 45)).toHaveLength(2)
  })

  it('the journey map has a cell for every stage and row', () => {
    const { board } = place('customer-journey')
    const cells = Object.values(board.objects).filter((o) => o.type === 'shape' && (o as { strokeStyle?: string }).strokeStyle === 'dashed')
    expect(cells).toHaveLength(5 * 6)
    expect(Object.values(board.objects).filter((o) => o.type === 'emoji')).toHaveLength(5)
  })
})
