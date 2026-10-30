# Workshop-Vorlagen

Die Werkzeugleiste des Editors hat eine Schaltfläche **Vorlagen**; der Kern
hat dieselben Vorlagen für eine eigene Oberfläche.

| Vorlage               | Inhalt                                                                        |
| --------------------- | ----------------------------------------------------------------------------- |
| Event Storming        | Eine Legende der Zettelarten (Domänenereignis, Befehl, Akteur, Policy, Lesemodell, externes System, Aggregat, Hotspot) und ein Zeitstrahl mit einem durchgearbeiteten Beispiel |
| Customer Journey Map  | Persona und Ziel, die Phasen der Reise gegen Handlungen, Kontaktpunkte, Gedanken, Gefühle (ein Gesicht pro Phase), Schmerzpunkte und Chancen |
| User Story Map        | Die Reise des Nutzers, Aktivitäten und Aufgaben als Rückgrat, Stories in Releases geschnitten |
| Retrospektive         | Was gut lief, was besser werden soll und was wir tun                          |

Eine Vorlage wird in die Mitte der Ansicht gesetzt — oder, wenn dort schon
etwas ist, neben den Inhalt des Boards —, ausgewählt und ins Bild geholt, als
ein Schritt der Historie: Einmal Rückgängig entfernt sie ganz. Jedes Objekt
ist ein gewöhnlicher Zettel, eine Form, ein Text, ein Rahmen oder ein
Verbinder und wird wie jedes andere bearbeitet. Die Texte folgen der Prop
`locale` (oder der Sprache der Seite): Russisch oder Englisch.

## Im Code

```ts
import { insertTemplate, listTemplates } from '@dskripchenko/board'

listTemplates('en') // [{ id: 'event-storming', title, description }, …]
const { ids, ops, bounds } = insertTemplate(board, 'story-map', { x: 0, y: 0 }, 'en')
doc.apply(ops)
```

`insertTemplate` zentriert die Vorlage auf den Punkt und liefert die
Operationen, die sie anlegen (neue ids, über allem auf dem Board), die neuen
ids und die belegte Fläche.
