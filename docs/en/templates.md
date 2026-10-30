# Workshop templates

The editor's toolbar has a **Templates** button; the core has the same
templates for an interface of your own.

| Template              | What is on it                                                                 |
| --------------------- | ----------------------------------------------------------------------------- |
| Event storming        | A legend of the sticky kinds (domain event, command, actor, policy, read model, external system, aggregate, hotspot) and a timeline with a worked example |
| Customer journey map  | Persona and goal, the stages of the journey against actions, touchpoints, thoughts, emotions (a face per stage), pain points and opportunities |
| User story map        | The user journey, activities and tasks as the backbone, stories sliced into releases |
| Retrospective         | What went well, what to improve, and what we will do                          |

A template is placed in the middle of the view — or, when that is taken,
beside the board's content — selected and brought into view, as one step of
history: one undo removes it. Every object is an ordinary sticky, shape,
text, frame or connector, edited like any other. Texts follow the `locale`
prop (or the page's language): Russian or English.

## In code

```ts
import { insertTemplate, listTemplates } from '@dskripchenko/board'

listTemplates('en') // [{ id: 'event-storming', title, description }, …]
const { ids, ops, bounds } = insertTemplate(board, 'story-map', { x: 0, y: 0 }, 'en')
doc.apply(ops)
```

`insertTemplate` centres the template on the point and returns the
operations that create it (fresh ids, above everything on the board), the
new ids and the area it covers.
