# 协作

多人同时编辑同一个白板：变更、光标和选区实时传输。

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

使用 provider 时，白板来自服务器（不需要 `modelValue`）；加载完成前编辑器
处于只读状态。右上角的栏显示连接状态和在场的人——你排在第一位。

## 协议

服务器为变更排序；冲突按属性解决——按服务器顺序，后写入者胜出。

- 一次用户操作是一个由[操作](model.md#操作)组成的**批次**：
  `{ client, cseq, ops }` — 客户端的 id 及其自身的计数器。
- 客户端立即应用自己的批次并将其排队；服务器为其分配编号（`seq`）并发送给
  所有人，包括作者本人——这就是确认。
- 客户端按顺序将服务器的批次应用到**已确认**的白板上，并在已确认白板之上
  显示自己尚未确认的批次。提前到达的批次会等待缺失的批次。
- 每个客户端以相同顺序应用相同的批次，因此所有白板最终一致。包的测试在
  1 000 个随机的四客户端、任意投递顺序的场景中验证了这一点。

规则：

- `set` — 按属性，后写入者胜出。
- `delete` 优先：对已删除对象的后续变更会被忽略。
- 撤销是本地的：它发送你自己最近一次操作的逆操作；你永远不会撤销他人的变更。
- 两人同时在同一便签中输入：后写入的文本胜出（没有字符级合并）。

**在场状态**——光标、选区、名称、颜色——单独传输，不存储，每秒最多 10 次，
静默 30 秒后淡出。

## Provider

provider 是传输层；白板并不知道批次如何传输。

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
| `httpProvider({ base, wait?, interval?, headers? })` | 下文的 HTTP 契约：长轮询，有序发送并以退避策略重试。 |
| `new MemoryHub(snapshot?, latency?).provider()` | 在同一页面或进程内：多个编辑器并排、测试、演示。 |

WebSocket provider 只需在任意 socket 之上写几行代码：发送批次，并用服务器
广播的内容调用 `onBatch` 监听器。

## HTTP 契约

| 请求 | |
|---|---|
| `GET {base}/snapshot` | `{ board, seq }` |
| `POST {base}/batches` | 一个批次 → `{ seq }`。重发已接收的批次会得到相同的 `seq`。 |
| `GET {base}/batches?after=N&wait=S` | `seq` > N 的 `{ batches }`。服务器可将请求挂起最多 S 秒，直到有新内容；`410` 表示 N 过旧——客户端重新加载。 |
| `POST {base}/presence` | 自身在场状态 → `{ presence: [...] }`（最近 30 秒内出现过的所有人）。 |

请求携带页面的 cookie（`credentials: same-origin`）；其他请求头（CSRF
token）通过 `headers` 传入。

## 服务器

`BoardServer` 是参考服务器逻辑——任何宿主都可以用传输层和存储将其包装，
或将其移植：

```ts
import { BoardServer } from '@dskripchenko/board'

const server = new BoardServer(await storage.load()) // { board, seq }
const { batch, fresh } = server.receive(incoming) // throws over the limits
if (fresh) broadcast(batch)
server.snapshot() // { board, seq } — persist it now and then
server.since(seq) // the batches after seq, or null (too old)
server.touch(presence) // presence of everyone active
```

它为批次编号，忽略重发（依据 `client` + `cseq`），为恢复连接的客户端保留
日志，并强制执行限制（每批次 500 个操作，每个白板 10 000 个对象）。请在
`receive` 之前检查权限：查看者不得发送批次。
