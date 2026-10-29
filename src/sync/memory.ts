import { BoardServer } from './server'
import type { Batch, BoardProvider, Presence, SeqBatch, Snapshot } from './types'

/**
 * An in-process hub: one BoardServer and any number of providers — two
 * editors on one page, tests. `latency` delays every message (ms, or a
 * function for random delays); order per direction is kept, as on a socket.
 */
export class MemoryHub {
  readonly server: BoardServer
  private clients = new Set<{ deliver: (b: SeqBatch) => void; presence: (all: Presence[]) => void }>()

  constructor(
    snapshot?: Snapshot,
    private readonly latency: number | (() => number) = 0,
  ) {
    this.server = new BoardServer(snapshot)
  }

  private delay(): number {
    return typeof this.latency === 'function' ? this.latency() : this.latency
  }

  provider(): BoardProvider {
    const server = this.server
    const clients = this.clients
    const delay = () => this.delay()
    const batchListeners = new Set<(b: SeqBatch) => void>()
    const presenceListeners = new Set<(all: Presence[]) => void>()
    // FIFO per direction even with random delays.
    let upChain = Promise.resolve()
    let downChain = Promise.resolve()
    const later = (chain: Promise<void>, fn: () => void) => chain.then(() => new Promise<void>((r) => setTimeout(() => (fn(), r()), delay())))
    const entry = {
      deliver: (b: SeqBatch) => {
        downChain = later(downChain, () => batchListeners.forEach((l) => l(b)))
      },
      presence: (all: Presence[]) => presenceListeners.forEach((l) => l(all)),
    }
    clients.add(entry)
    return {
      load: async () => structuredClone(server.snapshot()),
      send(batch: Batch) {
        upChain = later(upChain, () => {
          const { batch: ordered, fresh } = server.receive(structuredClone(batch))
          if (fresh) clients.forEach((c) => c.deliver(ordered))
          else entry.deliver(ordered)
        })
      },
      onBatch(cb) {
        batchListeners.add(cb)
        return () => batchListeners.delete(cb)
      },
      presence: {
        send(p: Presence) {
          const all = server.touch(p)
          clients.forEach((c) => c.presence(all))
        },
        on(cb) {
          presenceListeners.add(cb)
          return () => presenceListeners.delete(cb)
        },
      },
      close() {
        clients.delete(entry)
      },
    }
  }
}
