# Editor

```vue
<BoardEditor v-model="board" :locale="'en'" style="height: 720px" @change="onChange" />
```

## Props

| Prop | Typ | Standard | |
|---|---|---|---|
| `modelValue` | `Board \| string \| null` | `null` | Das Board, als Objekt oder JSON-Text. |
| `readonly` | `boolean` | `false` | Ein Betrachter: Verschieben, Zoom, Minikarte, Export. |
| `locale` | `string` | das `lang` der Seite | `ru` oder `en`. |
| `labels` | `Partial<BoardLabels>` | — | Ersetzt beliebige Oberflächentexte. |
| `minimap` | `boolean` | `true` | Minikarte beim Start anzeigen. |
| `provider` | `BoardProvider \| null` | `null` | Zusammenarbeit in Echtzeit ([Zusammenarbeit](collaboration.md)). |
| `user` | `{ id?, name?, color? }` | — | Wer bearbeitet: wird den anderen angezeigt. |

## Events

| Event | Payload | |
|---|---|---|
| `update:modelValue` | `Board` | Nach jeder Änderung. |
| `change` | `{ board, ops, origin }` | Die angewendeten Operationen; `origin` ist `local`, `undo`, `redo` oder `remote`. |
| `selection` | `string[]` | Die ausgewählten ids. |

## Nach außen verfügbar

Über eine Template-Ref: `fit()`, `select(ids)`, `zoomTo(k)`, `toPng(scale?)`
(ein `Blob`), `toSvg()` (`{ svg, width, height }`), `applyRemote(ops)`, `doc`
(das `BoardDoc`), `sync()` (der `SyncClient`, wenn ein Provider gesetzt ist).

## Werkzeuge

| Werkzeug | Taste | |
|---|---|---|
| Auswahl | V | Klicken, Shift-Klick, Auswahlrechteck aufziehen. |
| Hand | H, oder Space gedrückt halten | Verschieben. |
| Haftnotiz | N | Klicken zum Platzieren; sofort tippen. Ein Doppelklick auf eine leere Stelle erzeugt ebenfalls eine. |
| Form | S | Klicken für die Standardgröße oder ziehen; erneuter Klick auf das Werkzeug für die acht Arten. |
| Text | T | Klicken und tippen: Titel, Überschrift oder Text. |
| Frame | F | Klicken oder ziehen. In einen Frame abgelegte Objekte bewegen sich mit ihm. |
| Connector | L | Von einem Objekt (oder von irgendwo) zu einem anderen ziehen; Enden heften sich an Objekte. |
| Emoji | E | Eines auswählen, dann zum Platzieren klicken. |
| Stift | P | Zeichnen; erneuter Klick auf das Werkzeug für Farben und Breiten. |
| Marker | M | Ein breiter, halbtransparenter Strich. |
| Radierer | X | Entfernt die berührten Striche (ganze Striche). |

## Bearbeiten

- **Verschieben** durch Ziehen; Kanten und Mittelpunkte rasten an nahen
  Objekten ein (Alt gedrückt halten für freies Verschieben). Pfeiltasten
  verschieben um 1, mit Shift um 10.
- **Größe ändern** mit den Griffen (Shift behält die Proportionen bei),
  **drehen** mit dem runden Griff oben (Shift rastet in 15°-Schritten ein).
  Eine Gruppe wird als Ganzes skaliert.
- **Text:** Doppelklick oder Enter. Escape oder Ctrl/⌘ + Enter beendet.
- **Connectors:** einen Endgriff ziehen, um ihn neu anzuheften.
- **Die Leiste über der Auswahl:** Farben, Formart, Füllung und Linie,
  Textstil, Connector-Route und Pfeile, Strichfarbe und -breite, Ausrichten
  und Verteilen (mehrere Objekte), Auswahl in einen Frame fassen, in den
  Vordergrund, in den Hintergrund, duplizieren, sperren, löschen.

## Tastatur

| Tasten | |
|---|---|
| Ctrl/⌘ + Z, Ctrl/⌘ + Shift + Z (oder Y) | Rückgängig, Wiederholen |
| Ctrl/⌘ + A, D | Alles auswählen, duplizieren |
| Ctrl/⌘ + C, X, V | Kopieren, Ausschneiden, Einfügen (reiner Text wird zur Haftnotiz) |
| Ctrl/⌘ + ], [ | In den Vordergrund, in den Hintergrund |
| Delete, Backspace | Löschen |
| Ctrl/⌘ + =, − ; Ctrl/⌘ + Mausrad oder Pinch | Zoom |
| Mausrad oder Zwei-Finger-Scrollen | Verschieben |
| Shift + 1 | An Bildschirm anpassen |
| Escape | Auswahl aufheben, zurück zur Auswahl |

## Export

Die Download-Schaltfläche (unten rechts) speichert ein PNG (2×), ein SVG oder
das JSON des Boards — die Auswahl, oder das ganze Board, wenn nichts
ausgewählt ist. Der Export nutzt denselben Renderer wie der Bildschirm.

## Theming

Der Editor verwendet die Tokens des Kits und diese Variablen, die alle auf
`.bd-root` überschrieben werden können: `--bd-text`, `--bd-stroke`,
`--bd-shape-fill`, `--bd-surface`, `--bd-frame-fill`, `--bd-frame-stroke`,
`--bd-frame-title`, `--bd-connector`, `--bd-accent`, `--bd-canvas`,
`--bd-dot`. Explizite Farben an Objekten (die Farbe einer Haftnotiz, die
Füllung einer Form) bleiben im dunklen Theme unverändert; Text darauf wechselt
für den Kontrast zwischen dunkel und weiß.

## Leistung

Gezeichnet werden nur sichtbare Objekte, und das Rendering eines Objekts wird
zwischengespeichert, bis es sich ändert. Ein Board mit 5 000 Objekten öffnet
sich in etwa 0,3 s und lässt sich mit 60 fps verschieben. Grenzen: 10 000
Objekte pro Board; ein Strich wird ab 2 000 Punkten aufgeteilt.
