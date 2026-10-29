# Collaboration

Several people edit one board at once: changes, cursors and selections
travel in real time.

```vue
<script setup lang="ts">
import { BoardEditor } from '@dskripchenko/board/vue'
import { httpProvider } from '@dskripchenko/board'

const provider = httpProvider({ base: '/api/boards/42', headers: { 'X-CSRF-Token': token } })
</script>

<template>
  <BoardEditor :provider="provider" :user="{ id: 'u7', name: 'Anna', color: '#ec4899' }" style="height: 720px" />
</template>
```

With a provider the board comes from the server (`modelValue` is not
needed); the editor is read-only until it has loaded. The bar at the top
right shows the connection and who is here — you first.

## The protocol

The server orders changes; conflicts are settled per property — the later
write in the server's order wins.

- A user action is a **batch** of [operations](model.md#operations):
  `{ client, cseq, ops }` — the client's id and its own counter.
- The client applies its batch at once and queues it; the server gives it a
  number (`seq`) and sends it to everyone, the author included — that is
  the acknowledgement.
- The client applies the server's batches, in order, to the **confirmed**
  board and shows the confirmed board with its own unacknowledged batches on
  top. A batch that arrives early waits for the missing one.
- Every client applies the same batches in the same order, so every board
  ends up the same. The package's tests check this on 1 000 random
  four-client scenarios with arbitrary delivery order.

Rules:

- `set` — per property, the later write wins.
- `delete` wins: later changes to a deleted object are ignored.
- Undo is local: it sends the inverse of your own last action; others'
  changes are never undone by you.
- Two people typing in the same sticky note at once: the later text wins
  (there is no character-level merge).

**Presence** — cursor, selection, name, colour — goes separately, is not
stored, at most 10 times a second, and fades after 30 seconds of silence.

## Providers

A provider is the transport; the board does not know how batches travel.

```ts
interface BoardProvider {
  load(): Promise<{ board: Board; seq: number }>
  send(batch: Batch): void
  onBatch(cb: (batch: SeqBatch) => void): () => void
  resume?(seq: number): void
  presence?: { send(p: Presence): void; on(cb: (all: Presence[]) => void): () => void }
  status?: { on(cb: (s: 'connecting' | 'online' | 'offline') => void): () => void }
  close?(): void
}
```

| Provider | |
|---|---|
| `httpProvider({ base, wait?, interval?, headers? })` | The HTTP contract below: long polling, ordered sends retried with back-off. |
| `new MemoryHub(snapshot?, latency?).provider()` | In one page or process: several editors side by side, tests, demos. |

A WebSocket provider is a few lines on top of any socket: send batches, call
the `onBatch` listeners with what the server broadcasts.

## The HTTP contract

| Request | |
|---|---|
| `GET {base}/snapshot` | `{ board, seq }` |
| `POST {base}/batches` | A batch → `{ seq }`. A resend of a batch already received gets the same `seq`. |
| `GET {base}/batches?after=N&wait=S` | `{ batches }` with `seq` > N. The server may hold the request up to S seconds until there is something; `410` means N is too old — the client reloads. |
| `POST {base}/presence` | Own presence → `{ presence: [...] }` (everyone seen in the last 30 s). |

Requests carry the page's cookies (`credentials: same-origin`); pass other
headers (CSRF tokens) with `headers`.

## The server

`BoardServer` is the reference server logic — any host wraps it with a
transport and storage, or ports it:

```ts
import { BoardServer } from '@dskripchenko/board'

const server = new BoardServer(await storage.load()) // { board, seq }
const { batch, fresh } = server.receive(incoming) // throws over the limits
if (fresh) broadcast(batch)
server.snapshot() // { board, seq } — persist it now and then
server.since(seq) // the batches after seq, or null (too old)
server.touch(presence) // presence of everyone active
```

It numbers batches, ignores resends (by `client` + `cseq`), keeps a log for
resuming clients and enforces limits (500 operations per batch, 10 000
objects per board). Check permissions before `receive`: viewers must not
send batches.
