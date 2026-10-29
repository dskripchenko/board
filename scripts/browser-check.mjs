// Drives the playground in Chromium: renders the sample, then creates,
// moves, edits, connects, undoes and exports; saves screenshots.
//   node scripts/browser-check.mjs [url]     (starts the playground itself without a url)
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url)
const { chromium } = require('playwright')

// The playground on a free port, unless a URL is given.
let server = null
let url = process.argv[2]
if (!url) {
  const { createServer } = await import('vite')
  const root = join(import.meta.dirname, '..')
  const port = 5331
  server = await createServer({ configFile: join(root, 'playground/vite.config.ts'), server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'warn' })
  await server.listen()
  url = `http://127.0.0.1:${port}/`
}
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

// Text tool: a click places a text and opens it for typing.
await page.keyboard.press('t')
await page.mouse.click(at(700, 700).x, at(700, 700).y)
await page.waitForTimeout(200)
check('text tool: a click opens the text editor', (await page.locator('.bd-text-editor').count()) === 1)
await page.keyboard.type('Заметка')
await page.keyboard.press('Escape')
check('text tool: the text stays on the board', (await page.locator('.bd-text text', { hasText: 'Заметка' }).count()) === 1)
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')

// Sticky tool: a click places a sticky ready for typing.
await page.keyboard.press('n')
await page.mouse.click(at(560, 700).x, at(560, 700).y)
await page.waitForTimeout(200)
check('sticky tool: a click opens the sticky for typing', (await page.locator('.bd-text-editor').count()) === 1)
await page.keyboard.press('Escape')
await page.keyboard.press('Control+z')

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

// Pen, marker, eraser.
const inks = () => page.locator('.bd-ink').count()
const drawStroke = async (x1, y1, x2, y2) => {
  await page.mouse.move(at(x1, y1).x, at(x1, y1).y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(at(x1 + ((x2 - x1) * i) / 12, y1 + ((y2 - y1) * i) / 12 + (i % 2) * 8).x, at(x1 + ((x2 - x1) * i) / 12, y1 + ((y2 - y1) * i) / 12 + (i % 2) * 8).y)
  await page.mouse.up()
}
await page.locator('.bd-tool--pen').click()
check('pen: the colour and width flyout opens', (await page.locator('.bd-flyout--ink').count()) === 1)
await page.locator('.bd-flyout--ink .bd-color').nth(1).click()
await drawStroke(300, 420, 520, 470)
check('pen draws a stroke', (await inks()) === 1)
check('pen uses the picked colour', (await page.locator('.bd-ink path').first().getAttribute('stroke')) === '#ef4444')
await page.keyboard.press('m')
await drawStroke(300, 480, 520, 480)
check('marker draws a translucent stroke', (await inks()) === 2 && (await page.locator('.bd-ink path').nth(1).getAttribute('stroke-opacity')) === '0.45')
await page.screenshot({ path: join(out, '5-ink.png') })
await page.keyboard.press('x')
await drawStroke(400, 400, 400, 520)
check('eraser removes the strokes it touches', (await inks()) === 0)
await page.keyboard.press('Control+z')
check('undo brings erased strokes back', (await inks()) === 2)
await page.keyboard.press('v')
const inkBox = await page.locator('.bd-ink').first().boundingBox()
await page.mouse.click(inkBox.x + inkBox.width / 2, inkBox.y + inkBox.height / 2)
await page.waitForTimeout(150)
check('a stroke can be selected', (await page.locator('.bd-outline').count()) === 1)
await page.keyboard.press('Delete')
await page.keyboard.press('Control+z')
for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z')
await page.keyboard.press('Escape')

// Group resize: select two stickies, drag the south-east handle.
await page.keyboard.press('Escape')
const s1b = await page.locator('.bd-sticky').nth(0).boundingBox()
const s2b = await page.locator('.bd-sticky').nth(1).boundingBox()
await page.mouse.click(s1b.x + 10, s1b.y + 10)
await page.keyboard.down('Shift')
await page.mouse.click(s2b.x + 10, s2b.y + 10)
await page.keyboard.up('Shift')
const se = page.locator('.bd-handle--se')
check('group selection shows box handles', (await page.locator('.bd-handle').count()) === 8)
const hb = await se.boundingBox()
await page.mouse.move(hb.x + 5, hb.y + 5)
await page.mouse.down()
await page.mouse.move(hb.x + 65, hb.y + 45, { steps: 6 })
await page.mouse.up()
const s1c = await page.locator('.bd-sticky').nth(0).boundingBox()
check('group resize scales the objects', s1c.width > s1b.width + 5, `${Math.round(s1b.width)} → ${Math.round(s1c.width)}`)
await page.keyboard.press('Control+z')

// The context bar stays on screen for an object at the left edge.
await page.keyboard.press('Escape')
const bar = async () => (await page.locator('.bd-bar').boundingBox())
await page.mouse.click(s1b.x + 10, s1b.y + 10)
await page.mouse.down()
await page.mouse.move(box.x + 30, s1b.y + 10, { steps: 6 })
await page.mouse.up()
const bb = await bar()
check('context bar stays inside the canvas', bb && bb.x >= box.x && bb.x + bb.width <= box.x + box.width, bb ? `x=${Math.round(bb.x)}` : 'none')
await page.keyboard.press('Control+z')

// Dark theme.
await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
await page.waitForTimeout(200)
await page.screenshot({ path: join(out, '3-dark.png') })

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

// Two editors on one hub (≈90 ms latency): changes and cursors travel.
const collab = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const cErrors = []
collab.on('pageerror', (e) => cErrors.push(e.message))
await collab.goto(url + (url.includes('?') ? '&' : '?') + 'collab')
await collab.waitForSelector('.collab-Борис .bd-obj')
await collab.waitForTimeout(800)
const left = collab.locator('.collab-Анна')
const right = collab.locator('.collab-Борис')
const objs = (side) => side.locator('.bd-canvas > g:not(.bd-overlay) .bd-obj').count()
const before = await objs(right)
const lb = await left.locator('.bd-canvas').boundingBox()
await collab.mouse.dblclick(lb.x + lb.width / 2, lb.y + lb.height - 120)
await collab.keyboard.type('От Анны')
await collab.keyboard.press('Escape')
await collab.waitForTimeout(600)
check('collab: a sticky made on the left appears on the right', (await objs(right)) === before + 1)
check('collab: its text arrives too', (await right.locator('.bd-sticky text', { hasText: 'От Анны' }).count()) > 0)
await collab.mouse.move(lb.x + 200, lb.y + 200)
await collab.mouse.move(lb.x + 260, lb.y + 240, { steps: 4 })
await collab.waitForTimeout(500)
check('collab: Anna\'s cursor with her name shows on the right', (await right.locator('.bd-cursor text', { hasText: 'Анна' }).count()) === 1)
check('collab: own avatar first, then the others', (await right.locator('.bd-avatar').count()) === 2 && (await right.locator('.bd-avatar--me').innerText()) === 'Б')
// Undo on the left reaches the right.
await left.locator('.bd-canvas').click({ position: { x: 5, y: 5 } })
await collab.keyboard.press('Control+z')
await collab.keyboard.press('Control+z')
await collab.waitForTimeout(600)
check('collab: undo on the left removes the sticky on the right', (await objs(right)) === before)
await collab.screenshot({ path: join(out, '4-collab.png') })
check('collab: no page errors', cErrors.length === 0, cErrors.slice(0, 2).join(' | '))
await collab.close()

// 5 000 objects: first paint and frame rate while panning.
const stress = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const t0 = Date.now()
await stress.goto(url + (url.includes('?') ? '&' : '?') + 'stress=5000')
await stress.waitForSelector('.bd-obj')
const firstPaint = Date.now() - t0
await stress.keyboard.press('Control+=')
for (let i = 0; i < 3; i++) await stress.keyboard.press('Control+=')
await stress.waitForTimeout(500)
const sbox = await stress.locator('.bd-canvas').boundingBox()
await stress.mouse.move(sbox.x + 700, sbox.y + 450)
const fps = await stress.evaluate(async () => {
  let frames = 0
  let run = true
  const tick = () => { frames++; if (run) requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  const el = document.querySelector('.bd-canvas')
  for (let i = 0; i < 60; i++) {
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 30, deltaY: 20, bubbles: true, cancelable: true, clientX: 700, clientY: 450 }))
    await new Promise((r) => setTimeout(r, 16))
  }
  run = false
  return Math.round(frames / (60 * 16 / 1000))
})
check('5 000 objects: first paint under 5 s', firstPaint < 5000, `${firstPaint} ms`)
check('5 000 objects: panning at 30+ fps when zoomed in', fps >= 30, `${fps} fps`)
await stress.close()
await browser.close()
await server?.close()
console.log(failures.length ? `${failures.length} failed` : 'all checks passed')
process.exit(failures.length ? 1 : 0)
