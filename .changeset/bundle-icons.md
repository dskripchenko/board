---
'@dskripchenko/board': patch
---

The Vue entry bundles its icons (with the Lucide license): it imports only `vue` and `@dskripchenko/ui` at run time, so it works from a CDN import map (as `@dskripchenko/embed` loads it).
