# Security policy

A board is edited by many people, and in a collaborative setup its content
comes from a server. The package is built so that no board content becomes
active content in the page.

## What is guaranteed

- **Text is text.** Sticky notes, shapes, titles, frame titles, connector
  labels and emoji are rendered as SVG text nodes; no field of the model is
  ever inserted as HTML. The text editor is a plain `<textarea>`.
- **Colours are attributes.** Fill, stroke and text colours go into SVG
  attributes as strings; they are not evaluated as CSS or markup.
- **No requests of its own.** Without a provider the editor fetches nothing.
  With `httpProvider`, requests go only to the `base` you give it, with the
  page's cookies (`credentials: same-origin`) and the headers you pass.
- **Parsing is strict.** `parseBoard` keeps only known object types, checks
  numbers and connector ends, and refuses unknown versions.
- **Clipboard.** Pasted data is parsed with `JSON.parse` and goes through the
  same operations as any edit; anything else becomes the text of a sticky
  note.

## What the host is responsible for

- **Permissions.** `BoardServer` orders and limits batches; it does not know
  users. Check that the sender may edit the board before `receive`, and that
  a reader may read it before serving the snapshot, batches and presence.
- **Limits.** The server refuses batches over 500 operations and boards over
  10 000 objects; keep request size limits in the transport as well.
- **Exported SVG** contains the board's text; treat it as user content where
  you display it.

## Reporting a vulnerability

Please report privately through GitHub's
[security advisories](https://github.com/dskripchenko/board/security/advisories/new)
rather than an issue.
