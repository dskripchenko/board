# Zusammenarbeit

Mehrere Personen bearbeiten ein Board gleichzeitig: Änderungen, Cursor und
Auswahlen werden in Echtzeit übertragen.

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

Mit einem Provider kommt das Board vom Server (`modelValue` wird nicht
benötigt); der Editor ist schreibgeschützt, bis es geladen ist. Die Leiste
oben rechts zeigt die Verbindung und wer da ist — Sie zuerst.

## Das Protokoll

Der Server ordnet die Änderungen; Konflikte werden pro Eigenschaft
entschieden — der spätere Schreibvorgang in der Reihenfolge des Servers
gewinnt.

- Eine Benutzeraktion ist ein **Batch** von [Operationen](model.md#operationen):
  `{ client, cseq, ops }` — die id des Clients und sein eigener Zähler.
- Der Client wendet seinen Batch sofort an und reiht ihn ein; der Server
  vergibt eine Nummer (`seq`) und sendet ihn an alle, den Autor
  eingeschlossen — das ist die Bestätigung.
- Der Client wendet die Batches des Servers der Reihe nach auf das
  **bestätigte** Board an und zeigt das bestätigte Board mit seinen eigenen
  unbestätigten Batches darüber. Ein zu früh eintreffender Batch wartet auf
  den fehlenden.
- Jeder Client wendet dieselben Batches in derselben Reihenfolge an, sodass
  jedes Board am Ende gleich ist. Die Tests des Pakets prüfen dies an 1 000
  zufälligen Szenarien mit vier Clients und beliebiger Zustellreihenfolge.

Regeln:

- `set` — pro Eigenschaft gewinnt der spätere Schreibvorgang.
- `delete` gewinnt: spätere Änderungen an einem gelöschten Objekt werden
  ignoriert.
- Rückgängig ist lokal: es sendet die Umkehrung Ihrer eigenen letzten Aktion;
  Änderungen anderer machen Sie niemals rückgängig.
- Zwei Personen tippen gleichzeitig in derselben Haftnotiz: der spätere Text
  gewinnt (es gibt kein zeichenweises Zusammenführen).

**Präsenz** — Cursor, Auswahl, Name, Farbe — läuft separat, wird nicht
gespeichert, höchstens 10-mal pro Sekunde, und verblasst nach 30 Sekunden
Stille.

## Provider

Ein Provider ist der Transport; das Board weiß nicht, wie Batches übertragen
werden.

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
| `httpProvider({ base, wait?, interval?, headers? })` | Der HTTP-Vertrag unten: Long Polling, geordnete Sendungen mit Wiederholung und Back-off. |
| `new MemoryHub(snapshot?, latency?).provider()` | In einer Seite oder einem Prozess: mehrere Editoren nebeneinander, Tests, Demos. |

Ein WebSocket-Provider sind ein paar Zeilen über einem beliebigen Socket:
Batches senden, die `onBatch`-Listener mit dem aufrufen, was der Server
verteilt.

## Der HTTP-Vertrag

| Anfrage | |
|---|---|
| `GET {base}/snapshot` | `{ board, seq }` |
| `POST {base}/batches` | Ein Batch → `{ seq }`. Ein erneut gesendeter, bereits empfangener Batch erhält dieselbe `seq`. |
| `GET {base}/batches?after=N&wait=S` | `{ batches }` mit `seq` > N. Der Server darf die Anfrage bis zu S Sekunden halten, bis etwas vorliegt; `410` bedeutet, N ist zu alt — der Client lädt neu. |
| `POST {base}/presence` | Eigene Präsenz → `{ presence: [...] }` (alle in den letzten 30 s Gesehenen). |

Anfragen tragen die Cookies der Seite (`credentials: same-origin`); übergeben
Sie weitere Header (CSRF-Token) mit `headers`.

## Der Server

`BoardServer` ist die Referenz-Serverlogik — jeder Host umhüllt sie mit
Transport und Speicher oder portiert sie:

```ts
import { BoardServer } from '@dskripchenko/board'

const server = new BoardServer(await storage.load()) // { board, seq }
const { batch, fresh } = server.receive(incoming) // throws over the limits
if (fresh) broadcast(batch)
server.snapshot() // { board, seq } — persist it now and then
server.since(seq) // the batches after seq, or null (too old)
server.touch(presence) // presence of everyone active
```

Er nummeriert Batches, ignoriert erneute Sendungen (anhand von `client` +
`cseq`), führt ein Protokoll für wiederaufnehmende Clients und setzt Grenzen
durch (500 Operationen pro Batch, 10 000 Objekte pro Board). Prüfen Sie
Berechtigungen vor `receive`: Betrachter dürfen keine Batches senden.
