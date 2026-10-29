import type { Board } from '../model/types'
import { applyOps, type Op } from '../model/ops'
import type { BoardDoc } from '../doc'
import { newId } from '../model/ids'
import type { Batch, BoardProvider, Presence, SeqBatch } from './types'

export interface SyncOptions {
  client?: string
  user?: string
  /**
   * Local changes go out at most this often, ms (default 80). Changes of one
   * object in that window merge into one operation: a drag sends a few
   * intermediate positions, not every pointer move. 0 sends at once.
   */
  flushInterval?: number
}

/**
 * Merges operations per object, keeping what they add up to: sets merge
 * (later values win, null removes), a create absorbs later sets, a create
 * followed by a delete cancels out. Operations on different objects are
 * independent, so their relative order does not matter.
 */
export function compactOps(ops: Op[]): Op[] {
  const out: (Op | null)[] = []
  const last = new Map<string, number>()
  for (const op of ops) {
    const i = last.get(op.id)
    const prev = i === undefined ? null : out[i]!
    if (prev && op.k === 'meta' && prev.k === 'meta') {
      out[i!] = { k: 'meta', id: op.id, props: { ...prev.props, ...op.props } }
      continue
    }
    if (prev && op.k === 'set' && prev.k === 'set') {
      out[i!] = { k: 'set', id: op.id, props: { ...prev.props, ...op.props } }
      continue
    }
    if (prev && op.k === 'set' && prev.k === 'create') {
      const obj: Record<string, unknown> = { ...prev.obj }
      for (const [key, value] of Object.entries(op.props)) {
        if (value === null || value === undefined) delete obj[key]
        else obj[key] = value
      }
      out[i!] = { k: 'create', id: op.id, obj: obj as unknown as typeof prev.obj }
      continue
    }
    if (prev && op.k === 'delete' && prev.k === 'create') {
      out[i!] = null
      last.delete(op.id)
      continue
    }
    if (prev && op.k === 'delete' && prev.k === 'set') {
      out[i!] = op
      continue
    }
    last.set(op.id, out.length)
    out.push(op)
  }
  return out.filter((o): o is Op => o !== null)
}

/**
 * Keeps a BoardDoc in sync through a provider.
 *
 * - Local changes are shown at once and queued as pending batches.
 * - The server's batches are applied, in its order, to the confirmed board;
 *   the visible board is the confirmed one with our pending batches on top.
 * - Our own batch coming back is the acknowledgement: it leaves the queue.
 *
 * Every client applies the same batches in the same order to the confirmed
 * board, so all of them end up with the same board once queues drain.
 */
export class SyncClient {
  readonly client: string
  private confirmed: Board
  private seq = 0
  private cseq = 0
  private pending: Batch[] = []
  /** Local operations not sent yet (the flush window). */
  private outbox: Op[] = []
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private lastFlush = 0
  /** Batches that arrived ahead of a gap. */
  private early = new Map<number, SeqBatch>()
  private applying = false
  private offs: (() => void)[] = []
  private readyPromise: Promise<void>

  constructor(
    private readonly doc: BoardDoc,
    private readonly provider: BoardProvider,
    private readonly options: SyncOptions = {},
  ) {
    this.client = options.client ?? newId()
    this.confirmed = doc.board
    this.readyPromise = this.start()
  }

  /** Resolves once the server's board is loaded. */
  get ready(): Promise<void> {
    return this.readyPromise
  }

  get pendingCount(): number {
    return this.pending.length + (this.outbox.length ? 1 : 0)
  }

  get lastSeq(): number {
    return this.seq
  }

  private async start(): Promise<void> {
    this.offs.push(this.provider.onBatch((b) => this.receive(b)))
    const snap = await this.provider.load()
    this.confirmed = snap.board
    this.seq = snap.seq
    this.applying = true
    this.doc.load(snap.board)
    this.applying = false
    this.flushEarly()
    this.offs.push(
      this.doc.on((_board, ops, origin) => {
        if (this.applying || origin === 'remote' || ops.length === 0) return
        this.sendLocal(ops)
      }),
    )
  }

  private sendLocal(ops: Op[]): void {
    this.outbox.push(...ops)
    const interval = this.options.flushInterval ?? 80
    const wait = this.lastFlush + interval - Date.now()
    if (interval <= 0 || wait <= 0) this.flush()
    else this.flushTimer ??= setTimeout(() => this.flush(), wait)
  }

  /** Sends what is in the flush window now, as one batch. */
  flush(): void {
    clearTimeout(this.flushTimer)
    this.flushTimer = undefined
    if (this.outbox.length === 0) return
    const ops = compactOps(this.outbox)
    this.outbox = []
    this.lastFlush = Date.now()
    if (ops.length === 0) return
    const batch: Batch = { client: this.client, cseq: ++this.cseq, ops, ...(this.options.user ? { user: this.options.user } : {}) }
    this.pending.push(batch)
    this.provider.send(batch)
  }

  private receive(b: SeqBatch): void {
    if (b.seq <= this.seq) return
    if (b.seq > this.seq + 1) {
      this.early.set(b.seq, b)
      return
    }
    this.applyConfirmed(b)
    this.flushEarly()
  }

  private flushEarly(): void {
    let next = this.early.get(this.seq + 1)
    while (next) {
      this.early.delete(next.seq)
      this.applyConfirmed(next)
      next = this.early.get(this.seq + 1)
    }
    for (const s of this.early.keys()) if (s <= this.seq) this.early.delete(s)
  }

  private applyConfirmed(b: SeqBatch): void {
    this.seq = b.seq
    this.confirmed = applyOps(this.confirmed, b.ops).board
    if (b.client === this.client) {
      const i = this.pending.findIndex((p) => p.cseq === b.cseq)
      if (i >= 0) this.pending.splice(0, i + 1)
    }
    // The visible board: confirmed + what we have not had acknowledged yet.
    let visible = this.confirmed
    for (const p of this.pending) visible = applyOps(visible, p.ops).board
    if (this.outbox.length) visible = applyOps(visible, this.outbox).board
    this.applying = true
    this.doc.replace(visible, b.client === this.client ? [] : b.ops)
    this.applying = false
  }

  /** After a reconnect: resend what was not acknowledged (the server ignores duplicates). */
  resend(): void {
    this.provider.resume?.(this.seq)
    for (const b of this.pending) this.provider.send(b)
  }

  sendPresence(p: Omit<Presence, 'client'>): void {
    this.provider.presence?.send({ ...p, client: this.client })
  }

  close(): void {
    this.flush()
    for (const off of this.offs) off()
    this.provider.close?.()
  }
}
