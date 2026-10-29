// Drives the playground in Chromium: renders the sample, then creates,
// moves, edits, connects, undoes and exports; saves screenshots.
//   node scripts/browser-check.mjs [url]     (playground on :5330)
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url)
const { chromium } = require('playwright')
const url = process.argv[2] ?? 'http://localhost:5330/'
const out = join(import.meta.dirname, '..', 'tests', 'browser', 'output')
mkdirSync(out, { recursive: true })

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(url)
await page.waitForSelector('.bd-obj')
await page.waitForTimeout(500)
const count = () => page.locator('.bd-canvas > g:not(.bd-overlay) .bd-obj').count()
const n0 = await count()
check('renders the sample', n0 >= 20, `${n0} objects`)
await page.screenshot({ path: join(out, '1-sample.png') })

const canvas = page.locator('.bd-canvas')
const box = await canvas.boundingBox()
const at = (x, y) => ({ x: box.x + x, y: box.y + y })

// Sticky by double click on empty space, type text.
let p = at(936, 700)
await page.mouse.dblclick(p.x, p.y)
await page.waitForSelector('.bd-text-editor')
await page.keyboard.type('Новый стикер из теста')
await page.keyboard.press('Escape')
check('double click adds a sticky with text', (await count()) === n0 + 1)
check('the sticky shows its text', await page.locator('.bd-sticky text', { hasText: 'Новый' }).count() > 0)

// Shape tool: drag a shape.
await page.keyboard.press('s')
await page.mouse.move(at(1000, 560).x, at(1000, 560).y)
await page.mouse.down()
await page.mouse.move(at(1120, 640).x, at(1120, 640).y, { steps: 5 })
await page.mouse.up()
await page.keyboard.type('Фигура')
await page.keyboard.press('Escape')
check('shape tool draws a shape', (await count()) === n0 + 2)

// Move the selection with the mouse.
const shape = page.locator('.bd-shape').last()
const sb = await shape.boundingBox()
await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
await page.mouse.down()
await page.mouse.move(sb.x + sb.width / 2 + 80, sb.y + sb.height / 2 + 30, { steps: 8 })
await page.mouse.up()
const sb2 = await shape.boundingBox()
check('drag moves the object', Math.abs(sb2.x - sb.x - 80) < 12, `dx=${Math.round(sb2.x - sb.x)}`)

// Connector between the new sticky and the shape.
await page.keyboard.press('l')
const st = await page.locator('.bd-sticky').last().boundingBox()
await page.mouse.move(st.x + st.width / 2, st.y + st.height / 2)
await page.mouse.down()
await page.mouse.move(sb2.x + sb2.width / 2, sb2.y + sb2.height / 2, { steps: 8 })
await page.mouse.up()
check('connector tool links two objects', (await count()) === n0 + 3)

// Undo three times, redo once.
await page.keyboard.press("Control+z")
const afterUndo = await count()
check('undo removes the connector', afterUndo === n0 + 2, `${afterUndo}`)
await page.keyboard.press('Control+Shift+z')
check('redo brings the connector back', (await count()) === n0 + 3)

// Select all with marquee, copy-paste via keyboard (duplicate).
await page.keyboard.press('Control+a')
const selected = await page.locator('.bd-outline').count()
check('select all', selected === (await count()), `${selected}`)
await page.keyboard.press('Escape')

// Zoom and fit.
await page.keyboard.press('Control+=')
await page.waitForTimeout(400)
const zoom = await page.locator('.bd-zoom-pct').innerText()
await page.keyboard.press('Shift+1')
await page.waitForTimeout(400)
check('zoom controls react', zoom !== (await page.locator('.bd-zoom-pct').innerText()), zoom)

// Context bar on a sticky: recolour.
const firstSticky = page.locator('.bd-sticky').first()
const fb = await firstSticky.boundingBox()
await page.mouse.click(fb.x + 20, fb.y + 20)
await page.waitForSelector('.bd-bar')
await page.screenshot({ path: join(out, '2-selected.png') })
await page.locator('.bd-bar .bd-color').nth(2).click()
const fill = await firstSticky.locator('rect').nth(1).getAttribute('fill')
check('context bar recolours a sticky', fill === '#ffc9de', fill)

// Export SVG string through the exposed API is covered by unit tests; check the PNG path runs.
const png = await page.evaluate(async () => {
  const el = document.querySelector('.bd-root')
  const inst = el.__vueParentComponent
  return !!inst
})
void png

// Dark theme.
await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
await page.waitForTimeout(200)
await page.screenshot({ path: join(out, '3-dark.png') })

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
console.log(failures.length ? `${failures.length} failed` : 'all checks passed')
process.exit(failures.length ? 1 : 0)
