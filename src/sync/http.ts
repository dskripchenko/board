import type { Batch, BoardProvider, ConnectionStatus, Presence, SeqBatch, Snapshot } from './types'

export interface HttpProviderOptions {
  /** The board's base URL: `{base}/snapshot`, `{base}/batches`, `{base}/presence`. */
  base: string
  /** Long-poll wait, seconds (the server may answer earlier). */
  wait?: number
  /** Pause between polls when the server answers at once, ms. */
  interval?: number
  /** Extra request headers (CSRF tokens…). */
  headers?: Record<string, string>
  fetch?: typeof fetch
}

/**
 * The HTTP contract shared by embed and the Confluence app:
 *
 * | Request | |
 * |---|---|
 * | `GET {base}/snapshot` | `{ board, seq }` |
 * | `POST {base}/batches` | a batch → `{ seq }` |
 * | `GET {base}/batches?after=N&wait=S` | `{ batches: SeqBatch[] }` after N; `410` — too old, reload |
 * | `POST {base}/presence` | own presence → `{ presence: Presence[] }` |
 *
 * Sends are queued and retried in order; the server deduplicates resends.
 */
export function httpProvider(options: HttpProviderOptions): BoardProvider {
  const f = options.fetch ?? globalThis.fetch.bind(globalThis)
  const base = options.base.replace(/\/$/, '')
  const headers = { Accept: 'application/json', ...options.headers }
  const batchListeners = new Set<(b: SeqBatch) => void>()
  const presenceListeners = new Set<(all: Presence[]) => void>()
  const statusListeners = new Set<(s: ConnectionStatus) => void>()
  let after = 0
  let closed = false
  let polling = false
  let status: ConnectionStatus = 'connecting'
  let controller: AbortController | null = null
  const queue: Batch[] = []
  let sending = false

  const setStatus = (s: ConnectionStatus) => {
    if (s === status) return
    status = s
    statusListeners.forEach((l) => l(s))
  }
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  async function json<T>(url: string, init?: RequestInit): Promise<T> {
    const r = await f(url, { credentials: 'same-origin', ...init, headers: { ...headers, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } })
    if (!r.ok) throw Object.assign(new Error(`${init?.method ?? 'GET'} ${url}: HTTP ${r.status}`), { status: r.status })
    return (await r.json()) as T
  }

  async function poll(): Promise<void> {
    if (polling) return
    polling = true
    let backoff = 1000
    while (!closed) {
      controller = new AbortController()
      try {
        const res = await json<{ batches: SeqBatch[] }>(`${base}/batches?after=${after}&wait=${options.wait ?? 25}`, { signal: controller.signal })
        setStatus('online')
        backoff = 1000
        for (const b of res.batches) {
          if (b.seq > after) after = b.seq
          batchListeners.forEach((l) => l(b))
        }
        if (res.batches.length === 0 && options.interval) await sleep(options.interval)
      } catch (e) {
        if (closed) break
        if ((e as { status?: number }).status === 410) {
          // Too far behind: the host reloads the board.
          setStatus('offline')
          break
        }
        setStatus('offline')
        await sleep(backoff)
        backoff = Math.min(backoff * 2, 30_000)
      }
    }
    polling = false
  }

  async function drain(): Promise<void> {
    if (sending) return
    sending = true
    let backoff = 1000
    while (queue.length && !closed) {
      try {
        await json(`${base}/batches`, { method: 'POST', body: JSON.stringify(queue[0]) })
        queue.shift()
        backoff = 1000
      } catch (e) {
        const st = (e as { status?: number }).status
        // A rejected batch (4xx) is dropped; network and server errors are retried.
        if (st && st >= 400 && st < 500) queue.shift()
        else {
          setStatus('offline')
          await sleep(backoff)
          backoff = Math.min(backoff * 2, 30_000)
        }
      }
    }
    sending = false
  }

  return {
    async load(): Promise<Snapshot> {
      const snap = await json<Snapshot>(`${base}/snapshot`)
      after = snap.seq
      setStatus('online')
      void poll()
      return snap
    },
    send(batch) {
      queue.push(batch)
      void drain()
    },
    onBatch(cb) {
      batchListeners.add(cb)
      return () => batchListeners.delete(cb)
    },
    resume(seq) {
      after = seq
      void poll()
    },
    presence: {
      send(p) {
        json<{ presence: Presence[] }>(`${base}/presence`, { method: 'POST', body: JSON.stringify(p) })
          .then((r) => presenceListeners.forEach((l) => l(r.presence)))
          .catch(() => {})
      },
      on(cb) {
        presenceListeners.add(cb)
        return () => presenceListeners.delete(cb)
      },
    },
    status: {
      on(cb) {
        statusListeners.add(cb)
        cb(status)
        return () => statusListeners.delete(cb)
      },
    },
    close() {
      closed = true
      controller?.abort()
    },
  }
}
