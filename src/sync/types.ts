import type { Board } from '../model/types'
import type { Op } from '../model/ops'

/** One user action's operations, as a client sends them. */
export interface Batch {
  /** The sending client (a browser tab). */
  client: string
  /** The client's own counter: with `client`, identifies the batch (resends are deduplicated). */
  cseq: number
  ops: Op[]
  /** Who made the change (shown in presence; optional). */
  user?: string
}

/** A batch in the server's order. */
export interface SeqBatch extends Batch {
  seq: number
}

export interface Snapshot {
  board: Board
  /** The last batch the board includes. */
  seq: number
}

export interface Presence {
  client: string
  user?: string
  name?: string
  color?: string
  cursor?: { x: number; y: number } | null
  selection?: string[]
  /** Set by the server or the receiver: ms since epoch. */
  at?: number
}

export type ConnectionStatus = 'connecting' | 'online' | 'offline'

/** The transport. The board does not know how batches travel. */
export interface BoardProvider {
  /** The current board and the number of the last batch in it. */
  load(): Promise<Snapshot>
  /** Sends a batch; the server echoes it back through `onBatch` in its order (the acknowledgement). */
  send(batch: Batch): void
  /** Batches in the server's order, starting after the loaded snapshot. Returns an unsubscribe. */
  onBatch(cb: (batch: SeqBatch) => void): () => void
  /** Called after a reconnect: batches after `seq` should follow (the provider resumes from there). */
  resume?(seq: number): void
  presence?: {
    send(p: Presence): void
    on(cb: (all: Presence[]) => void): () => void
  }
  status?: { on(cb: (s: ConnectionStatus) => void): () => void }
  close?(): void
}
