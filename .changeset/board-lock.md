---
'@dskripchenko/board': minor
---

Locking the board: a lock button (for those with `lockable`, on by default) locks the board for everyone — the editor turns to viewing with a banner naming who locked it, and only Unlock remains. The lock is a board setting (`meta.locked`, `lockOp()`, `isLocked()`), synced and undoable like any change; `BoardServer` drops object changes that arrive while the board is locked, so every client rolls them back alike.
