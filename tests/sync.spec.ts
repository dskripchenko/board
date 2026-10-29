import { describe, expect, it } from 'vitest'
import {
  BoardDoc, BoardServer, SyncClient, bringToFront, createObject, deleteObjects, moveObjects, setProps,
  type Batch, type BoardProvider, type SeqBatch, type Snapshot,
} from '../src'

/** A seeded PRNG (mulberry32), so a failing scenario can be replayed. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A network we drive by hand: per client an up queue (to the server) and a
 * down queue (from it), each FIFO like a socket. `step()` delivers one
 * message from a random non-empty queue — every interleaving is possible.
 */
class SteppedNet {
  server = new BoardServer()
  up = new Map<number, Batch[]>()
  down = new Map<number, SeqBatch[]>()
  listeners = new Map<number, (b: SeqBatch) => void>()
  /** Drop rate for the first send of a batch (it is resent later). */
  constructor(private random: () => number) {}

  provider(i: number): BoardProvider {
    this.up.set(i, [])
    this.down.set(i, [])
    return {
      load: async (): Promise<Snapshot> => structuredClone(this.server.snapshot()),
      send: (b) => this.up.get(i)!.push(structuredClone(b)),
      onBatch: (cb) => {
        this.listeners.set(i, cb)
        return () => this.listeners.delete(i)
      },
    }
  }

  busy(): boolean {
    return [...this.up.values(), ...this.down.values()].some((q) => q.length > 0)
  }

  step(): void {
    const queues: [string, number][] = []
    for (const [i, q] of this.up) if (q.length) queues.push(['up', i])
    for (const [i, q] of this.down) if (q.length) queues.push(['down', i])
    if (!queues.length) return
    const [dir, i] = queues[Math.floor(this.random() * queues.length)]!
    if (dir === 'up') {
      const b = this.up.get(i)!.shift()!
      const { batch, fresh } = this.server.receive(b)
      if (fresh) for (const q of this.down.values()) q.push(batch)
      else this.down.get(i)!.push(batch)
    } else {
      const b = this.down.get(i)!.shift()!
      this.listeners.get(i)?.(structuredClone(b))
    }
  }
}

async function scenario(seed: number, clients = 4, actions = 60) {
  const random = rng(seed)
  const net = new SteppedNet(random)
  const docs: BoardDoc[] = []
  const syncs: SyncClient[] = []
  for (let i = 0; i < clients; i++) {
    const doc = new BoardDoc()
    const sync = new SyncClient(doc, net.provider(i), { client: `c${i}` })
    await sync.ready
    docs.push(doc)
    syncs.push(sync)
  }
  const pick = <T>(xs: T[]): T | undefined => xs[Math.floor(random() * xs.length)]
  for (let a = 0; a < actions; a++) {
    const doc = docs[Math.floor(random() * clients)]!
    const ids = Object.keys(doc.board.objects)
    const id = pick(ids)
    const r = random()
    if (r < 0.25 || !id) doc.apply(createObject(doc.board, random() < 0.5 ? 'sticky' : 'shape', { x: random() * 1000, y: random() * 1000 }).ops)
    else if (r < 0.45) doc.apply(moveObjects(doc.board, [id], random() * 50 - 25, random() * 50 - 25))
    else if (r < 0.6) doc.apply(setProps(doc.board, [id], { text: `t${a}`, color: pick(['pink', 'blue', 'green']) }))
    else if (r < 0.7) doc.apply(deleteObjects(doc.board, [id]))
    else if (r < 0.8) doc.apply(bringToFront(doc.board, [id]))
    else if (r < 0.9) doc.undo()
    else doc.redo()
    // Let some messages through between actions.
    const steps = Math.floor(random() * 4)
    for (let s = 0; s < steps; s++) net.step()
  }
  while (net.busy()) net.step()
  return { net, docs, syncs }
}

describe('sync: convergence', () => {
  it('every client ends with the server board (1 000 random scenarios)', async () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const { net, docs, syncs } = await scenario(seed)
      const expected = net.server.snapshot().board
      for (let i = 0; i < docs.length; i++) {
        expect(syncs[i]!.pendingCount, `seed ${seed}, client ${i}: pending`).toBe(0)
        expect(docs[i]!.board, `seed ${seed}, client ${i}`).toEqual(expected)
      }
    }
  }, 120_000)
})

describe('sync: client', () => {
  it('shows local changes at once and keeps them over remote ones until acknowledged', async () => {
    const net = new SteppedNet(rng(7))
    const a = new BoardDoc(), b = new BoardDoc()
    const sa = new SyncClient(a, net.provider(0), { client: 'a' })
    const sb = new SyncClient(b, net.provider(1), { client: 'b' })
    await Promise.all([sa.ready, sb.ready])
    const { id, ops } = createObject(a.board, 'sticky', { x: 0, y: 0 })
    a.apply(ops)
    expect(a.board.objects[id]).toBeDefined()
    expect(sa.pendingCount).toBe(1)
    while (net.busy()) net.step()
    expect(b.board.objects[id]).toBeDefined()
    // Concurrent edits of the same property: the later one in server order wins everywhere.
    a.apply(setProps(a.board, [id], { color: 'pink' }))
    b.apply(setProps(b.board, [id], { color: 'blue' }))
    expect(a.board.objects[id]).toMatchObject({ color: 'pink' })
    while (net.busy()) net.step()
    expect(a.board.objects[id]).toEqual(b.board.objects[id])
  })

  it('remote changes are not in the local undo history', async () => {
    const net = new SteppedNet(rng(3))
    const a = new BoardDoc(), b = new BoardDoc()
    const sa = new SyncClient(a, net.provider(0), { client: 'a' })
    const sb = new SyncClient(b, net.provider(1), { client: 'b' })
    await Promise.all([sa.ready, sb.ready])
    b.apply(createObject(b.board, 'emoji', { x: 0, y: 0 }).ops)
    while (net.busy()) net.step()
    expect(Object.keys(a.board.objects)).toHaveLength(1)
    expect(a.canUndo).toBe(false)
  })

  it('applies batches in server order even when they arrive out of order', async () => {
    const doc = new BoardDoc()
    let deliver: (b: SeqBatch) => void = () => {}
    const sync = new SyncClient(doc, {
      load: async () => ({ board: { version: 1, objects: {} }, seq: 0 }),
      send: () => {},
      onBatch: (cb) => ((deliver = cb), () => {}),
    }, { client: 'x' })
    await sync.ready
    const make = (seq: number, id: string): SeqBatch => ({ seq, client: 'other', cseq: seq, ops: [{ k: 'create', id, obj: { id, type: 'emoji', char: '🙂', x: seq, y: 0, w: 10, h: 10, z: `a${seq}` } }] })
    deliver(make(2, 'second'))
    expect(doc.board.objects.second).toBeUndefined()
    deliver(make(1, 'first'))
    expect(Object.keys(doc.board.objects).sort()).toEqual(['first', 'second'])
    deliver(make(1, 'first'))
    expect(sync.lastSeq).toBe(2)
  })
})

describe('sync: server', () => {
  it('numbers batches, deduplicates resends and serves the log', () => {
    const s = new BoardServer()
    const b = { client: 'a', cseq: 1, ops: [] }
    expect(s.receive(b)).toMatchObject({ fresh: true, batch: { seq: 1 } })
    expect(s.receive(b)).toMatchObject({ fresh: false, batch: { seq: 1 } })
    s.receive({ client: 'b', cseq: 1, ops: [] })
    expect(s.since(0)!.map((x) => x.seq)).toEqual([1, 2])
    expect(s.since(2)).toEqual([])
  })

  it('refuses batches over the limits', () => {
    const s = new BoardServer(undefined, { maxOps: 2, maxObjects: 1 })
    expect(() => s.receive({ client: 'a', cseq: 1, ops: [{ k: 'delete', id: '1' }, { k: 'delete', id: '2' }, { k: 'delete', id: '3' }] })).toThrow(/operations/)
  })

  it('keeps presence for a while', () => {
    const s = new BoardServer()
    s.touch({ client: 'a', name: 'A' }, 1000)
    expect(s.touch({ client: 'b' }, 2000).map((p) => p.client)).toEqual(['a', 'b'])
    expect(s.touch({ client: 'b' }, 60_000).map((p) => p.client)).toEqual(['b'])
  })
})
