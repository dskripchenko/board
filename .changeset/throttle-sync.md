---
'@dskripchenko/board': patch
---

Real-time sync sends a drag as a few intermediate positions instead of every pointer move: local changes go out at most every 80 ms (`flushInterval`), and the changes of one object in that window merge into one operation (`compactOps`). The others no longer fall behind or lose frames while someone moves objects.
