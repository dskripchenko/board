import type { Board } from '../model/types'
import { applyOps, type Op } from '../model/ops'
import type { BoardDoc } from '../doc'
import { newId } from '../model/ids'
import type { Batch, BoardProvider, Presence, SeqBatch } from './types'

export interface SyncOptions {
  client?: string
  user?: string
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
    return this.pending.length
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
    for (const off of this.offs) off()
    this.provider.close?.()
  }
}
