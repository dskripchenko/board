import { describe, expect, it } from 'vitest'
import {
  applyOps, align, boardBounds, BoardDoc, BoardError, bringToFront, compareZ, connectorPoints, createConnector, createObject,
  deleteObjects, distribute, duplicate, emptyBoard, hitTest, keyBetween, keysBetween, moveObjects, newId, objectsInRect,
  parseBoard, sendToBack, shapePath, stacked, visibleObjects, wrapInFrame, type Board, type Op,
} from '../src'

const run = (board: Board, ops: Op[]) => applyOps(board, ops).board

describe('fractional index', () => {
  it('orders keys between any two', () => {
    const a = keyBetween(null, null)
    const b = keyBetween(a, null)
    const m = keyBetween(a, b)
    expect(a < m && m < b).toBe(true)
    expect(keyBetween(null, a) < a).toBe(true)
  })

  it('never runs out of room (1000 inserts at the same spot)', () => {
    let lo: string | null = keyBetween(null, null)
    const hi = keyBetween(lo, null)
    for (let i = 0; i < 1000; i++) {
      const k = keyBetween(lo, hi)
      expect(lo! < k && k < hi).toBe(true)
      lo = k
    }
    let up = hi
    for (let i = 0; i < 1000; i++) {
      const k = keyBetween(null, up)
      expect(k < up).toBe(true)
      up = k
    }
  })

  it('keysBetween gives ordered keys; ties sort by id', () => {
    const keys = keysBetween('a', 'b', 20)
    expect([...keys].sort()).toEqual(keys)
    expect(compareZ({ z: 'a', id: '2' }, { z: 'a', id: '1' })).toBe(1)
  })
})

describe('ids', () => {
  it('are 26 chars and sort by time', () => {
    const a = newId(1000)
    const b = newId(2000)
    expect(a).toHaveLength(26)
    expect(a < b).toBe(true)
  })
})

describe('operations', () => {
  it('apply and undo exactly', () => {
    let board = emptyBoard()
    const { id, ops } = createObject(board, 'sticky', { x: 0, y: 0 }, { text: 'hi' })
    board = run(board, ops)
    const before = board
    const { board: after, inverse } = applyOps(board, [
      { k: 'set', id, props: { text: 'hello', color: 'pink', rotation: 15 } },
      { k: 'set', id, props: { rotation: null } },
    ])
    expect(after.objects[id]).toMatchObject({ text: 'hello', color: 'pink' })
    expect('rotation' in after.objects[id]!).toBe(false)
    expect(run(after, inverse)).toEqual(before)
  })

  it('skip missing objects and no-op sets; never change id or type', () => {
    const board = emptyBoard()
    expect(applyOps(board, [{ k: 'set', id: 'x', props: { x: 1 } }, { k: 'delete', id: 'x' }]).inverse).toEqual([])
    const { id, ops } = createObject(board, 'shape', { x: 0, y: 0 })
    const b = run(board, ops)
    expect(applyOps(b, [{ k: 'set', id, props: { x: b.objects[id]!.x, type: 'sticky', id: 'other' } }]).inverse).toEqual([])
  })

  it('delete is undone by create with the same object', () => {
    let board = emptyBoard()
    const c = createObject(board, 'shape', { x: 10, y: 10 }, { kind: 'star' })
    board = run(board, c.ops)
    const { board: gone, inverse } = applyOps(board, [{ k: 'delete', id: c.id }])
    expect(gone.objects[c.id]).toBeUndefined()
    expect(run(gone, inverse)).toEqual(board)
  })
})

describe('parse', () => {
  it('fills defaults and drops unknown types', () => {
    const b = parseBoard({ objects: { a: { type: 'sticky', x: 1, y: 2, w: 3, h: 4 }, b: { type: 'image', x: 0, y: 0 }, c: { type: 'text', x: 0, y: 0, w: 1, h: 1 } } })
    expect(b.objects.a).toMatchObject({ id: 'a', color: 'yellow' })
    expect(b.objects.b).toBeUndefined()
    expect(b.objects.c).toMatchObject({ text: '', variant: 'body' })
    expect(b.objects.a!.z < b.objects.c!.z).toBe(true)
  })

  it('reports errors with a pointer', () => {
    expect(() => parseBoard('{')).toThrow(BoardError)
    expect(() => parseBoard({ objects: { a: { type: 'shape', x: 'no' } } })).toThrow(/\/objects\/a\/x/)
    expect(() => parseBoard({ objects: { c: { type: 'connector', x: 0, y: 0, from: {}, to: { x: 1, y: 1 } } } })).toThrow(/from/)
    expect(() => parseBoard({ version: 2 })).toThrow(/version/)
  })
})

function sample() {
  let board = emptyBoard()
  const frame = createObject(board, 'frame', { x: 0, y: 0 }, { w: 400, h: 300, title: 'F' })
  board = run(board, frame.ops)
  const s1 = createObject(board, 'sticky', { x: 100, y: 100 })
  board = run(board, s1.ops)
  const s2 = createObject(board, 'shape', { x: 800, y: 100 })
  board = run(board, s2.ops)
  const c = createConnector(board, { id: s1.id }, { id: s2.id })
  board = run(board, c.ops)
  return { board, frame: frame.id, s1: s1.id, s2: s2.id, c: c.id }
}

describe('editing', () => {
  it('a new object joins the frame under it, on top of the stack', () => {
    const { board, frame, s1, s2, c } = sample()
    expect(board.objects[s1]!.parent).toBe(frame)
    expect(board.objects[s2]!.parent).toBeUndefined()
    expect(stacked(board).map((o) => o.id)).toEqual([frame, s1, s2, c])
  })

  it('moving a frame moves its contents; moving out of a frame leaves it', () => {
    const { board, frame, s1 } = sample()
    const moved = run(board, moveObjects(board, [frame], 50, 0))
    expect(moved.objects[s1]!.x).toBe(board.objects[s1]!.x + 50)
    const out = run(board, moveObjects(board, [s1], 1000, 0))
    expect(out.objects[s1]!.parent).toBeUndefined()
    const back = run(out, moveObjects(out, [s1], -1000, 0))
    expect(back.objects[s1]!.parent).toBe(frame)
  })

  it('deleting a frame deletes its contents and frees connector ends', () => {
    const { board, frame, s1, c } = sample()
    const after = run(board, deleteObjects(board, [frame]))
    expect(after.objects[frame]).toBeUndefined()
    expect(after.objects[s1]).toBeUndefined()
    expect(after.objects[c]!.type === 'connector' && 'x' in (after.objects[c] as { from: object }).from).toBe(true)
  })

  it('restacks to front and back', () => {
    const { board, frame, s2 } = sample()
    const front = run(board, bringToFront(board, [frame]))
    expect(stacked(front).at(-1)!.id).toBe(frame)
    const back = run(board, sendToBack(board, [s2]))
    expect(stacked(back)[0]!.id).toBe(s2)
  })

  it('duplicates frames with contents and remaps connectors inside the copy', () => {
    const { board, frame, s1, c } = sample()
    const d = duplicate(board, [frame, s1, c])
    const after = run(board, d.ops)
    expect(Object.keys(after.objects)).toHaveLength(7)
    const copies = d.ops.map((op) => (op.k === 'create' ? op.obj : null)).filter(Boolean)
    const frameCopy = copies.find((o) => o!.type === 'frame')!
    const stickyCopy = copies.find((o) => o!.type === 'sticky')!
    expect(stickyCopy.parent).toBe(frameCopy.id)
    const connCopy = copies.find((o) => o!.type === 'connector') as { from: { id: string } }
    expect(connCopy.from.id).toBe(stickyCopy.id)
  })

  it('wraps objects in a frame below them', () => {
    const { board, s2 } = sample()
    const w = wrapInFrame(board, [s2], 'G')
    const after = run(board, w.ops)
    expect(after.objects[s2]!.parent).toBe(w.id)
    expect(after.objects[w.id]!.z < after.objects[s2]!.z).toBe(true)
  })

  it('aligns and distributes', () => {
    let board = emptyBoard()
    const ids: string[] = []
    for (const [x, y] of [[0, 0], [130, 40], [600, 80]] as [number, number][]) {
      const o = createObject(board, 'shape', { x, y })
      board = run(board, o.ops)
      ids.push(o.id)
    }
    const top = run(board, align(board, ids, 'top'))
    expect(new Set(ids.map((id) => top.objects[id]!.y)).size).toBe(1)
    const spread = run(board, distribute(board, ids, 'x'))
    const xs = ids.map((id) => spread.objects[id]!.x).sort((a, b) => a - b)
    expect(Math.round(xs[1]! - xs[0]!)).toBe(Math.round(xs[2]! - xs[1]!))
  })
})

describe('geometry', () => {
  it('hit tests the topmost object, frames by their title band', () => {
    const { board, frame, s1 } = sample()
    expect(hitTest(board, { x: 100, y: 100 })!.id).toBe(s1)
    expect(hitTest(board, { x: 300, y: 10 })!.id).toBe(frame)
    expect(hitTest(board, { x: 5000, y: 5000 })).toBeNull()
  })

  it('routes elbow connectors orthogonally between facing sides', () => {
    const { board, c } = sample()
    const pts = connectorPoints(board.objects[c] as never, board)
    expect(pts.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.x === pts[i - 1]!.x || pts[i]!.y === pts[i - 1]!.y).toBe(true)
  })

  it('selects by rect and culls by viewport', () => {
    const { board, s2 } = sample()
    expect(objectsInRect(board, { x: 600, y: 0, w: 400, h: 300 }).map((o) => o.id)).toEqual([s2])
    expect(visibleObjects(board, { x: 700, y: 0, w: 200, h: 200 }).some((o) => o.id === s2)).toBe(true)
    expect(boardBounds(board)).not.toBeNull()
  })

  it('draws every shape kind as a closed path', () => {
    for (const k of ['rect', 'rounded', 'ellipse', 'diamond', 'triangle', 'parallelogram', 'hexagon', 'star'] as const) {
      expect(shapePath(k, 100, 60)).toMatch(/^M.*Z$/)
    }
  })
})

describe('BoardDoc', () => {
  it('undoes and redoes; merges a drag into one step', () => {
    const doc = new BoardDoc()
    const o = createObject(doc.board, 'sticky', { x: 0, y: 0 })
    doc.apply(o.ops)
    for (let i = 0; i < 5; i++) doc.apply(moveObjects(doc.board, [o.id], 10, 0), { mergeKey: 'drag' })
    const x = doc.board.objects[o.id]!.x
    doc.undo()
    expect(doc.board.objects[o.id]!.x).toBe(x - 50)
    doc.redo()
    expect(doc.board.objects[o.id]!.x).toBe(x)
    doc.undo()
    doc.undo()
    expect(doc.board.objects[o.id]).toBeUndefined()
    expect(doc.canUndo).toBe(false)
    doc.redo()
    expect(doc.board.objects[o.id]).toBeDefined()
  })

  it('remote changes are not undoable', () => {
    const doc = new BoardDoc()
    const o = createObject(doc.board, 'emoji', { x: 0, y: 0 })
    doc.applyRemote(o.ops)
    expect(doc.canUndo).toBe(false)
  })
})
