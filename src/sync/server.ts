import type { Board } from '../model/types'
import { applyOps } from '../model/ops'
import { emptyBoard } from '../model/parse'
import type { Batch, Presence, SeqBatch, Snapshot } from './types'

export interface ServerLimits {
  maxOps: number
  maxObjects: number
}

const DEFAULT_LIMITS: ServerLimits = { maxOps: 500, maxObjects: 10_000 }

/**
 * The reference server logic: orders batches, deduplicates resends, keeps the
 * board and a log for clients that resume. A host (a Node server, a PHP
 * port, the playground) wraps it with a transport and storage.
 */
export class BoardServer {
  private board: Board
  private seq: number
  private log: SeqBatch[] = []
  /** The last cseq per client, and the seq it got: a resend gets the same answer. */
  private seen = new Map<string, { cseq: number; seq: number }>()
  private presence = new Map<string, Presence>()

  constructor(
    snapshot: Snapshot = { board: emptyBoard(), seq: 0 },
    private readonly limits: ServerLimits = DEFAULT_LIMITS,
    /** Keep this many batches for resuming clients; older ones are only in the snapshot. */
    private readonly keep = 10_000,
  ) {
    this.board = snapshot.board
    this.seq = snapshot.seq
  }

  snapshot(): Snapshot {
    return { board: this.board, seq: this.seq }
  }

  /**
   * Accepts a batch: returns it with its number, or `null` for a resend of
   * an older batch (already applied). Throws on a batch over the limits.
   */
  receive(batch: Batch): { batch: SeqBatch; fresh: boolean } {
    const last = this.seen.get(batch.client)
    if (last && batch.cseq <= last.cseq) {
      const old = this.log.find((b) => b.client === batch.client && b.cseq === batch.cseq)
      return { batch: old ?? { ...batch, seq: last.seq }, fresh: false }
    }
    if (batch.ops.length > this.limits.maxOps) throw new Error(`A batch has more than ${this.limits.maxOps} operations`)
    const creates = batch.ops.filter((o) => o.k === 'create').length
    if (creates && Object.keys(this.board.objects).length + creates > this.limits.maxObjects) throw new Error(`A board holds at most ${this.limits.maxObjects} objects`)
    // A locked board takes only changes of its settings (unlocking among them):
    // object changes are dropped here, so every client rolls them back alike.
    const ops = this.board.meta?.locked === true ? batch.ops.filter((o) => o.k === 'meta') : batch.ops
    const seq = ++this.seq
    const ordered: SeqBatch = { ...batch, ops, seq }
    this.board = applyOps(this.board, ops).board
    this.log.push(ordered)
    if (this.log.length > this.keep) this.log.splice(0, this.log.length - this.keep)
    this.seen.set(batch.client, { cseq: batch.cseq, seq })
    return { batch: ordered, fresh: true }
  }

  /** Batches after `seq`, or null when they are no longer in the log (the client must reload). */
  since(seq: number): SeqBatch[] | null {
    if (seq >= this.seq) return []
    const first = this.log[0]
    if (!first || first.seq > seq + 1) return null
    return this.log.filter((b) => b.seq > seq)
  }

  /** Updates a client's presence; returns everyone seen within `ttl` ms. */
  touch(p: Presence, now = Date.now(), ttl = 30_000): Presence[] {
    this.presence.set(p.client, { ...p, at: now })
    for (const [k, v] of this.presence) if ((v.at ?? 0) < now - ttl) this.presence.delete(k)
    return [...this.presence.values()]
  }
}
