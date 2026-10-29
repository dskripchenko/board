---
'@dskripchenko/board': patch
---

The minimap draws nothing while the editor has no size yet (a hidden or not yet laid out container) instead of `NaN` coordinates that browsers report as errors.
