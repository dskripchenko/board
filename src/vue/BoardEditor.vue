<script setup lang="ts">
/**
 * The whiteboard editor. `v-model` holds the board (JSON); `change` reports
 * every applied operation batch (the sync engine's input). `readonly` turns
 * it into a viewer with pan, zoom and export.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from 'vue'
import { UidButton, UidTooltip } from '@dskripchenko/ui'
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical,
  ArrowDownToLine, ArrowUpToLine, Circle, Copy, Diamond, Download, Frame, Hand, Hexagon, Lock, LockOpen, Map as MapIcon,
  Maximize, Minus, MousePointer2, Plus, Redo2, Smile, Spline, Square, Star, StickyNote, Trash2, Triangle, Type, Undo2,
} from '@dskripchenko/ui/icons'
import type { Board, BoardObject, ConnectorEnd, ConnectorObject, Point, Rect, ShapeKind, StickyColor } from '../model/types'
import { STICKY_COLORS } from '../model/types'
import type { Op } from '../model/ops'
import { parseBoard, emptyBoard } from '../model/parse'
import { BoardDoc } from '../doc'
import { SyncClient } from '../sync/client'
import type { BoardProvider, ConnectionStatus, Presence } from '../sync/types'
import {
  align as alignCmd, bringToFront, createConnector, createObject, deleteObjects, distribute, duplicate, moveObjects, pasteObjects,
  resizeObject, scaleObjects, sendToBack, setProps, withChildren, wrapInFrame, type AlignEdge,
} from '../edit'
import { bounds, boardBounds, center, connectorPoints, hitTest, objectsInRect, rotatePoint, shapePath, unionRects, visibleObjects } from '../geometry'
import { boardToSvg, PALETTE, renderObject, STICKY_FILL, TEXT_STYLE, type SvgNode } from '../render'
import { snapRect, type Guide } from '../snap'
import { LINE_HEIGHT, wrapLines } from '../text'
import { toScreen } from '../viewport'
import { canvasMeasurer } from './measure'
import { useViewport } from './useViewport'
import SvgTree from './SvgTree'
import { EMOJI, resolveLabels, type BoardLabels } from './labels'

type Tool = 'select' | 'hand' | 'sticky' | 'shape' | 'text' | 'frame' | 'connector' | 'emoji'

const props = withDefaults(
  defineProps<{
    modelValue?: Board | string | null
    readonly?: boolean
    locale?: string
    labels?: Partial<BoardLabels>
    /** Show the minimap initially. */
    minimap?: boolean
    /** Real-time collaboration: the transport (MemoryHub, httpProvider…). */
    provider?: BoardProvider | null
    /** Who is editing: shown to the others next to the cursor. */
    user?: { id?: string; name?: string; color?: string } | null
  }>(),
  { modelValue: null, readonly: false, locale: undefined, labels: undefined, minimap: true, provider: null, user: null },
)
const emit = defineEmits<{
  'update:modelValue': [board: Board]
  change: [payload: { board: Board; ops: Op[]; origin: 'local' | 'undo' | 'redo' | 'remote' }]
  selection: [ids: string[]]
}>()

const L = computed(() => resolveLabels(props.locale, props.labels))
const uid = Math.random().toString(36).slice(2, 8)

// ---------- document ----------
function load(v: Board | string | null | undefined): Board {
  if (!v) return emptyBoard()
  try {
    return parseBoard(v)
  } catch {
    return emptyBoard()
  }
}
const doc = new BoardDoc(load(props.modelValue))
const board = shallowRef<Board>(doc.board)
let lastEmitted: Board | null = null
const off = doc.on((b, ops, origin) => {
  board.value = b
  if (origin !== 'remote' || ops.length) {
    lastEmitted = b
    emit('update:modelValue', b)
    emit('change', { board: b, ops, origin })
  }
  // Drop selected ids that no longer exist.
  if (selection.value.some((id) => !b.objects[id])) selection.value = selection.value.filter((id) => b.objects[id])
})
watch(
  () => props.modelValue,
  (v) => {
    // The parent's ref wraps our own value in a reactive proxy: compare the raw object.
    if (v && typeof v === 'object' && toRaw(v) === lastEmitted) return
    doc.load(load(v))
  },
)

function apply(ops: Op[], mergeKey?: string): void {
  if (props.readonly || !ready.value || ops.length === 0) return
  doc.apply(ops, { mergeKey })
}

/** For hosts (the sync engine): apply remote operations. */
function applyRemote(ops: Op[]): void {
  doc.applyRemote(ops)
}

// ---------- collaboration ----------
const PRESENCE_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']
let sync: SyncClient | null = null
const status = ref<ConnectionStatus | null>(null)
const ready = ref(!props.provider)
const others = ref<Presence[]>([])
const myColor = props.user?.color ?? PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)]!
let presenceTimer: ReturnType<typeof setTimeout> | undefined
let presenceDue = false
let lastPresence = 0

function startSync(): void {
  if (!props.provider) return
  sync = new SyncClient(doc, props.provider, { user: props.user?.id ?? props.user?.name })
  sync.ready.then(() => {
    ready.value = true
    sendPresence()
    nextTick(() => fitAll(false))
  })
  props.provider.status?.on((s) => (status.value = s))
  props.provider.presence?.on((all) => {
    const now = Date.now()
    others.value = all.filter((p) => p.client !== sync?.client && (!p.at || now - p.at < 30_000))
  })
}
/** Sends cursor and selection, at most 10 times a second. */
function sendPresence(): void {
  if (!sync || !props.provider?.presence) return
  const now = Date.now()
  if (now - lastPresence < 100) {
    if (!presenceDue) {
      presenceDue = true
      presenceTimer = setTimeout(() => {
        presenceDue = false
        sendPresence()
      }, 100 - (now - lastPresence))
    }
    return
  }
  lastPresence = now
  sync.sendPresence({ user: props.user?.id, name: props.user?.name, color: myColor, cursor: cursorWorld, selection: selection.value })
}
let cursorWorld: Point | null = null
const heartbeat = setInterval(() => sendPresence(), 10_000)

// ---------- view ----------
const root = ref<HTMLElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
const vp = useViewport(root, () => ({ min: 0.1, max: 4 }))
const view = vp.view
const measure = ref(canvasMeasurer(''))
let ro: ResizeObserver | null = null

onMounted(() => {
  const el = root.value!
  measure.value = canvasMeasurer(getComputedStyle(el).fontFamily)
  const sync = () => (vp.size.value = { width: el.clientWidth, height: el.clientHeight })
  sync()
  ro = new ResizeObserver(sync)
  ro.observe(el)
  fitAll(false)
  startSync()
})
onBeforeUnmount(() => {
  clearInterval(heartbeat)
  clearTimeout(presenceTimer)
  sync?.close()
  ro?.disconnect()
  off()
  vp.dispose()
})

function fitAll(smooth = true): void {
  const b = boardBounds(board.value)
  if (b) vp.fit(b, smooth, 64)
  else vp.set({ x: vp.size.value.width / 2, y: vp.size.value.height / 2, k: 1 }, smooth)
}

const viewRect = computed<Rect>(() => {
  const v = view.value
  const { width, height } = vp.size.value
  return { x: -v.x / v.k, y: -v.y / v.k, w: width / v.k, h: height / v.k }
})
const visible = computed(() => visibleObjects(board.value, viewRect.value, 200 / view.value.k))

// Rendered trees, cached per object version (objects are immutable).
const cache = new WeakMap<BoardObject, SvgNode>()
function rendered(o: BoardObject): SvgNode {
  if (o.type === 'connector') return renderObject(o, board.value, { measure: measure.value })
  let node = cache.get(o)
  if (!node) {
    node = renderObject(o, board.value, { measure: measure.value })
    cache.set(o, node)
  }
  return node
}

const zoomPct = computed(() => Math.round(view.value.k * 100))
const transform = computed(() => `translate(${view.value.x} ${view.value.y}) scale(${view.value.k})`)
const dotGap = computed(() => 24 * view.value.k)

// ---------- selection ----------
const selection = ref<string[]>([])
watch(selection, (s) => {
  emit('selection', s)
  sendPresence()
})
const selectedObjects = computed(() => selection.value.map((id) => board.value.objects[id]).filter((o): o is BoardObject => !!o))
const selectionBox = computed(() => unionRects(selectedObjects.value.map((o) => bounds(o, board.value))))
const single = computed(() => (selectedObjects.value.length === 1 ? selectedObjects.value[0]! : null))
const selectedTypes = computed(() => new Set(selectedObjects.value.map((o) => o.type)))
const anyLocked = computed(() => selectedObjects.value.some((o) => o.locked))

function select(ids: string[]): void {
  selection.value = [...new Set(ids)]
}

// ---------- tools ----------
const tool = ref<Tool>('select')
const shapeKind = ref<ShapeKind>('rect')
const emojiChar = ref('👍')
const emojiOpen = ref(false)
const shapeOpen = ref(false)
const showMinimap = ref(props.minimap)
const exportOpen = ref(false)

const tools = computed(() => [
  { id: 'select' as const, icon: MousePointer2, label: L.value.select },
  { id: 'hand' as const, icon: Hand, label: L.value.hand },
  { id: 'sticky' as const, icon: StickyNote, label: L.value.sticky },
  { id: 'shape' as const, icon: shapeIcon(shapeKind.value), label: L.value.shape },
  { id: 'text' as const, icon: Type, label: L.value.text },
  { id: 'frame' as const, icon: Frame, label: L.value.frame },
  { id: 'connector' as const, icon: Spline, label: L.value.connector },
  { id: 'emoji' as const, icon: Smile, label: L.value.emoji },
])
const SHAPES: ShapeKind[] = ['rect', 'rounded', 'ellipse', 'diamond', 'triangle', 'parallelogram', 'hexagon', 'star']
function shapeIcon(k: ShapeKind) {
  return k === 'ellipse' ? Circle : k === 'diamond' ? Diamond : k === 'triangle' ? Triangle : k === 'hexagon' ? Hexagon : k === 'star' ? Star : Square
}
function pickTool(t: Tool): void {
  tool.value = t
  shapeOpen.value = t === 'shape' ? !shapeOpen.value : false
  emojiOpen.value = t === 'emoji' ? !emojiOpen.value : false
  if (t !== 'select') editing.value = null
}

// ---------- pointer interactions ----------
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type Interaction =
  | { kind: 'pan'; startX: number; startY: number; vx: number; vy: number }
  | { kind: 'move'; start: Point; ids: string[]; applied: Point; moved: boolean; others: Rect[]; box: Rect }
  | { kind: 'marquee'; start: Point; cur: Point; additive: boolean; base: string[] }
  | { kind: 'resize'; id: string; handle: Handle; start: Point; rect: Rect; aspect: number }
  | { kind: 'scale'; ids: string[]; handle: Handle; start: Point; box: Rect; board: Board; seq: number }
  | { kind: 'rotate'; id: string; c: Point }
  | { kind: 'create'; type: 'shape' | 'frame'; start: Point; cur: Point }
  | { kind: 'connect'; from: ConnectorEnd; start: Point; cur: Point }
  | { kind: 'end'; id: string; which: 'from' | 'to'; cur: Point }

const inter = shallowRef<Interaction | null>(null)
const guides = ref<Guide[]>([])
const spaceDown = ref(false)
let lastPointer: Point = { x: 0, y: 0 }
let dragSeq = 0

function world(e: PointerEvent | MouseEvent | WheelEvent): Point {
  return vp.clientToWorld(e.clientX, e.clientY)
}

function targetFor(p: Point, exclude?: string): BoardObject | null {
  const hit = hitTest(board.value, p, 4 / view.value.k)
  if (!hit || hit.type === 'connector' || hit.id === exclude) return null
  return hit
}

function endFor(p: Point): ConnectorEnd {
  const t = targetFor(p)
  if (!t) return { x: p.x, y: p.y }
  return { id: t.id }
}

function onPointerDown(e: PointerEvent): void {
  root.value?.focus({ preventScroll: true })
  if (editing.value) commitText()
  shapeOpen.value = false
  exportOpen.value = false
  const p = world(e)
  lastPointer = p
  ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  if (e.button === 1 || tool.value === 'hand' || spaceDown.value || (props.readonly && e.button === 0)) {
    inter.value = { kind: 'pan', startX: e.clientX, startY: e.clientY, vx: view.value.x, vy: view.value.y }
    return
  }
  if (e.button !== 0) return
  const handle = (e.target as Element).closest('[data-handle]')?.getAttribute('data-handle')
  if (handle && !single.value && selectionBox.value) {
    inter.value = { kind: 'scale', ids: [...selection.value], handle: handle as Handle, start: p, box: { ...selectionBox.value }, board: board.value, seq: ++dragSeq }
    return
  }
  if (handle && single.value) {
    const o = single.value
    if (handle === 'rotate') {
      inter.value = { kind: 'rotate', id: o.id, c: center(o) }
      return
    }
    if (handle === 'from' || handle === 'to') {
      inter.value = { kind: 'end', id: o.id, which: handle, cur: p }
      return
    }
    inter.value = { kind: 'resize', id: o.id, handle: handle as Handle, start: p, rect: { x: o.x, y: o.y, w: o.w, h: o.h }, aspect: o.w / Math.max(o.h, 1) }
    return
  }
  switch (tool.value) {
    case 'sticky':
    case 'text':
    case 'emoji': {
      const type = tool.value
      const extra: Record<string, unknown> = type === 'emoji' ? { char: emojiChar.value } : {}
      const { id, ops } = createObject(board.value, type, p, extra)
      apply(ops)
      select([id])
      if (type !== 'emoji') nextTick(() => startEdit(id))
      tool.value = 'select'
      emojiOpen.value = false
      return
    }
    case 'shape':
    case 'frame':
      inter.value = { kind: 'create', type: tool.value, start: p, cur: p }
      return
    case 'connector':
      inter.value = { kind: 'connect', from: endFor(p), start: p, cur: p }
      return
  }
  // select tool
  const hit = hitTest(board.value, p, 4 / view.value.k)
  if (!hit) {
    inter.value = { kind: 'marquee', start: p, cur: p, additive: e.shiftKey, base: e.shiftKey ? selection.value : [] }
    if (!e.shiftKey) select([])
    return
  }
  if (e.shiftKey) {
    select(selection.value.includes(hit.id) ? selection.value.filter((id) => id !== hit.id) : [...selection.value, hit.id])
    return
  }
  if (!selection.value.includes(hit.id)) select([hit.id])
  const ids = selection.value.filter((id) => !board.value.objects[id]?.locked)
  if (ids.length === 0) return
  const moving = withChildren(board.value, ids)
  const others = visible.value.filter((o) => !moving.has(o.id) && o.type !== 'connector').map((o) => bounds(o))
  inter.value = { kind: 'move', start: p, ids, applied: { x: 0, y: 0 }, moved: false, others, box: selectionBox.value ?? bounds(hit) }
  dragSeq++
}

function onPointerMove(e: PointerEvent): void {
  const p = world(e)
  lastPointer = p
  cursorWorld = p
  sendPresence()
  const it = inter.value
  if (!it) return
  switch (it.kind) {
    case 'pan':
      vp.set({ k: view.value.k, x: it.vx + e.clientX - it.startX, y: it.vy + e.clientY - it.startY })
      return
    case 'move': {
      let dx = p.x - it.start.x
      let dy = p.y - it.start.y
      if (!it.moved && Math.hypot(dx, dy) * view.value.k < 3) return
      it.moved = true
      if (!e.altKey) {
        const snap = snapRect({ ...it.box, x: it.box.x + dx, y: it.box.y + dy }, it.others, 6 / view.value.k)
        dx += snap.dx
        dy += snap.dy
        guides.value = snap.guides
      } else guides.value = []
      const inc = { x: dx - it.applied.x, y: dy - it.applied.y }
      if (inc.x || inc.y) apply(moveObjects(board.value, it.ids, inc.x, inc.y), `move-${dragSeq}`)
      it.applied = { x: dx, y: dy }
      return
    }
    case 'marquee': {
      it.cur = p
      inter.value = { ...it }
      const r = rectOf(it.start, p)
      const inside = objectsInRect(board.value, r).map((o) => o.id)
      select(it.additive ? [...it.base, ...inside] : inside)
      return
    }
    case 'resize': {
      const o = board.value.objects[it.id]
      if (!o) return
      const next = resized(it.rect, it.handle, p.x - it.start.x, p.y - it.start.y, e.shiftKey || o.type === 'emoji' ? it.aspect : 0)
      const ops = resizeObject(board.value, it.id, next)
      if (o.type === 'text') ops.push({ k: 'set', id: o.id, props: { h: textHeight(o.text, next.w, o.variant) } })
      apply(ops, `resize-${it.id}`)
      return
    }
    case 'scale': {
      const next = resized(it.box, it.handle, p.x - it.start.x, p.y - it.start.y, e.shiftKey ? it.box.w / Math.max(it.box.h, 1) : 0)
      apply(scaleObjects(it.board, it.ids, it.box, next), `scale-${it.seq}`)
      return
    }
    case 'rotate': {
      let deg = (Math.atan2(p.y - it.c.y, p.x - it.c.x) * 180) / Math.PI + 90
      deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg)
      deg = ((deg % 360) + 360) % 360
      apply(setProps(board.value, [it.id], { rotation: deg === 0 ? null : deg }), `rotate-${it.id}`)
      return
    }
    case 'create':
    case 'connect':
      it.cur = p
      inter.value = { ...it }
      return
    case 'end':
      it.cur = p
      inter.value = { ...it }
      return
  }
}

function onPointerUp(e: PointerEvent): void {
  const it = inter.value
  inter.value = null
  guides.value = []
  doc.seal()
  if (!it) return
  const p = world(e)
  if (it.kind === 'create') {
    const r = rectOf(it.start, p)
    const small = r.w * view.value.k < 8 && r.h * view.value.k < 8
    const props: Record<string, unknown> = it.type === 'shape' ? { kind: shapeKind.value } : { title: L.value.frameTitle }
    const at = small ? it.start : it.type === 'frame' ? { x: r.x, y: r.y } : center(r)
    if (!small) Object.assign(props, { w: r.w, h: r.h })
    const { id, ops } = createObject(board.value, it.type, at, props)
    apply(ops)
    select([id])
    tool.value = 'select'
    shapeOpen.value = false
    if (it.type === 'shape') nextTick(() => startEdit(id))
  } else if (it.kind === 'connect') {
    if (Math.hypot(p.x - it.start.x, p.y - it.start.y) * view.value.k < 10) return
    const to = endFor(p)
    if ('id' in to && 'id' in it.from && to.id === it.from.id) return
    const { id, ops } = createConnector(board.value, it.from, to)
    apply(ops)
    select([id])
    tool.value = 'select'
  } else if (it.kind === 'end') {
    const c = board.value.objects[it.id] as ConnectorObject | undefined
    if (!c) return
    const end = endFor(p)
    const other = it.which === 'from' ? c.to : c.from
    if ('id' in end && 'id' in other && end.id === other.id) return
    apply([{ k: 'set', id: it.id, props: { [it.which]: end } }])
  }
}

function resized(r: Rect, h: Handle, dx: number, dy: number, aspect: number): Rect {
  let { x, y, w, h: hh } = r
  if (h.includes('e')) w = r.w + dx
  if (h.includes('w')) {
    w = r.w - dx
    x = r.x + dx
  }
  if (h.includes('s')) hh = r.h + dy
  if (h.includes('n')) {
    hh = r.h - dy
    y = r.y + dy
  }
  if (aspect) {
    if (h === 'n' || h === 's') w = hh * aspect
    else hh = w / aspect
    if (h.includes('n')) y = r.y + r.h - hh
    if (h.includes('w')) x = r.x + r.w - w
  }
  const minW = 16, minH = 16
  if (w < minW) {
    if (h.includes('w')) x -= minW - w
    w = minW
  }
  if (hh < minH) {
    if (h.includes('n')) y -= minH - hh
    hh = minH
  }
  return { x, y, w, h: hh }
}

function rectOf(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

function textHeight(text: string, w: number, variant: 'title' | 'h2' | 'body'): number {
  const st = TEXT_STYLE[variant] ?? TEXT_STYLE.body
  const lines = wrapLines(text || ' ', w, { size: st.size, weight: st.weight }, measure.value)
  return Math.ceil(lines.length * st.size * LINE_HEIGHT + 4)
}

function onWheel(e: WheelEvent): void {
  const local = vp.clientToLocal(e.clientX, e.clientY)
  if (e.ctrlKey || e.metaKey) vp.zoomBy(Math.exp(-e.deltaY * 0.0025), local)
  else vp.panBy(-e.deltaX, -e.deltaY)
}

function onDblClick(e: MouseEvent): void {
  if (props.readonly) return
  const p = world(e)
  const hit = hitTest(board.value, p, 4 / view.value.k)
  if (hit) {
    select([hit.id])
    startEdit(hit.id)
    return
  }
  const { id, ops } = createObject(board.value, 'sticky', p)
  apply(ops)
  select([id])
  nextTick(() => startEdit(id))
}

// ---------- text editing ----------
const editing = ref<{ id: string; field: 'text' | 'title' | 'label'; value: string } | null>(null)
const textarea = ref<HTMLTextAreaElement | null>(null)

function startEdit(id: string): void {
  const o = board.value.objects[id]
  if (!o || o.locked || props.readonly || o.type === 'emoji') return
  const field = o.type === 'frame' ? 'title' : o.type === 'connector' ? 'label' : 'text'
  const value = ((o as unknown as Record<string, unknown>)[field] as string | undefined) ?? ''
  editing.value = { id, field, value }
  nextTick(() => {
    textarea.value?.focus()
    textarea.value?.select()
  })
}

function commitText(): void {
  const ed = editing.value
  if (!ed) return
  editing.value = null
  const o = board.value.objects[ed.id]
  if (!o) return
  if (o.type === 'text' && ed.value.trim() === '') {
    apply(deleteObjects(board.value, [o.id]))
    return
  }
  const ops: Op[] = setProps(board.value, [ed.id], { [ed.field]: ed.value === '' && ed.field !== 'text' ? null : ed.value })
  if (o.type === 'text') ops.push({ k: 'set', id: o.id, props: { h: textHeight(ed.value, o.w, o.variant) } })
  apply(ops)
  root.value?.focus({ preventScroll: true })
}

const editorStyle = computed((): Record<string, string | undefined> => {
  const ed = editing.value
  if (!ed) return {}
  const o = board.value.objects[ed.id]
  if (!o) return {}
  const k = view.value.k
  let r: Rect
  let size = 16
  let alignText = 'center'
  if (o.type === 'connector') {
    const pts = connectorPoints(o, board.value)
    const mid = pts[Math.floor(pts.length / 2)]!
    r = { x: mid.x - 80, y: mid.y - 14, w: 160, h: 28 }
    size = 13
  } else if (o.type === 'frame') {
    r = { x: o.x + 6, y: o.y + 2, w: Math.min(o.w - 12, 360), h: 26 }
    size = 14
    alignText = 'left'
  } else if (o.type === 'text') {
    const st = TEXT_STYLE[o.variant]
    r = { x: o.x, y: o.y, w: o.w, h: Math.max(o.h, st.size * LINE_HEIGHT) }
    size = st.size
    alignText = o.align ?? 'left'
  } else {
    r = { x: o.x + 12, y: o.y + 12, w: o.w - 24, h: o.h - 24 }
    size = o.type === 'shape' ? (o.fontSize ?? 16) : o.type === 'sticky' && typeof o.fontSize === 'number' ? o.fontSize : Math.min(28, Math.max(14, o.h / 8))
  }
  const s = toScreen(view.value, { x: r.x, y: r.y })
  return {
    left: `${s.x}px`,
    top: `${s.y}px`,
    width: `${r.w * k}px`,
    height: `${r.h * k}px`,
    fontSize: `${size * k}px`,
    lineHeight: String(LINE_HEIGHT),
    textAlign: alignText,
    fontWeight: o.type === 'text' ? String(TEXT_STYLE[o.variant].weight) : o.type === 'frame' ? '600' : '400',
    transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined,
  }
})

function onEditorKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) || (e.key === 'Enter' && editing.value?.field !== 'text')) {
    e.preventDefault()
    commitText()
  }
  e.stopPropagation()
}

// ---------- commands ----------
function del(): void {
  apply(deleteObjects(board.value, selection.value.filter((id) => !board.value.objects[id]?.locked)))
  select([])
}
function dup(): void {
  const d = duplicate(board.value, selection.value)
  apply(d.ops)
  select(d.ids)
}
function setSel(props: Record<string, unknown>): void {
  apply(setProps(board.value, selection.value, props))
}
function toFront(): void {
  apply(bringToFront(board.value, selection.value))
}
function toBack(): void {
  apply(sendToBack(board.value, selection.value))
}
function toggleLock(): void {
  apply(setProps(board.value, selection.value, { locked: anyLocked.value ? null : true }))
}
function wrap(): void {
  const w = wrapInFrame(board.value, selection.value, L.value.frameTitle)
  apply(w.ops)
  if (w.id) select([w.id])
}
function alignLabel(edge: AlignEdge): string {
  const key = `align${edge.charAt(0).toUpperCase()}${edge.slice(1)}` as keyof BoardLabels
  return L.value[key] as string
}
function doAlign(edge: AlignEdge): void {
  apply(alignCmd(board.value, selection.value, edge))
}
function doDistribute(axis: 'x' | 'y'): void {
  apply(distribute(board.value, selection.value, axis))
}
function undo(): void {
  doc.undo()
}
function redo(): void {
  doc.redo()
}

// ---------- clipboard ----------
const CLIP = 'dsk-board/v1'
let pasteCount = 0
function onCopy(e: ClipboardEvent, cut = false): void {
  if (editing.value || selection.value.length === 0) return
  const ids = withChildren(board.value, selection.value)
  const objects = [...ids].map((id) => board.value.objects[id]).filter(Boolean)
  e.clipboardData?.setData('text/plain', JSON.stringify({ [CLIP]: true, objects }))
  e.preventDefault()
  pasteCount = 0
  if (cut) del()
}
function onPaste(e: ClipboardEvent): void {
  if (editing.value || props.readonly) return
  const text = e.clipboardData?.getData('text/plain') ?? ''
  let objects: BoardObject[] | null = null
  try {
    const data = JSON.parse(text)
    if (data && data[CLIP] && Array.isArray(data.objects)) objects = data.objects
  } catch {
    // Plain text: a sticky with it.
  }
  e.preventDefault()
  if (!objects) {
    if (!text.trim()) return
    const { id, ops } = createObject(board.value, 'sticky', inView(lastPointer) ? lastPointer : center(viewRect.value), { text: text.trim().slice(0, 2000) })
    apply(ops)
    select([id])
    return
  }
  const box = unionRects(objects.filter((o) => o.type !== 'connector').map((o) => bounds(o)))
  pasteCount++
  const offset = box && !inView(center(box)) ? { x: center(viewRect.value).x - center(box).x, y: center(viewRect.value).y - center(box).y } : { x: 24 * pasteCount, y: 24 * pasteCount }
  const p = pasteObjects(board.value, objects, offset)
  apply(p.ops)
  select(p.ids)
}
function inView(p: Point): boolean {
  const r = viewRect.value
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

// ---------- keyboard ----------
function onKey(e: KeyboardEvent): void {
  if (editing.value) return
  const mod = e.metaKey || e.ctrlKey
  const k = e.key.toLowerCase()
  if (e.key === ' ') {
    spaceDown.value = true
    e.preventDefault()
    return
  }
  if (mod && k === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
    return
  }
  if (mod && k === 'y') return void (e.preventDefault(), redo())
  if (mod && k === 'a') return void (e.preventDefault(), select(Object.keys(board.value.objects)))
  if (mod && k === 'd') return void (e.preventDefault(), dup())
  if (mod && (e.key === ']' || e.key === '}')) return void (e.preventDefault(), toFront())
  if (mod && (e.key === '[' || e.key === '{')) return void (e.preventDefault(), toBack())
  if (mod && (k === '=' || k === '+')) return void (e.preventDefault(), vp.zoomBy(1.25, undefined, true))
  if (mod && k === '-') return void (e.preventDefault(), vp.zoomBy(0.8, undefined, true))
  if (e.shiftKey && (e.key === '1' || e.key === '!')) return void (e.preventDefault(), fitAll())
  if (mod) return
  if (e.key === 'Escape') {
    select([])
    tool.value = 'select'
    shapeOpen.value = emojiOpen.value = exportOpen.value = false
    return
  }
  if (props.readonly) return
  if (e.key === 'Delete' || e.key === 'Backspace') return void (e.preventDefault(), del())
  if (e.key === 'Enter' && single.value) return void (e.preventDefault(), startEdit(single.value.id))
  if (e.key.startsWith('Arrow') && selection.value.length) {
    e.preventDefault()
    const step = e.shiftKey ? 10 : 1
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
    apply(moveObjects(board.value, selection.value, dx, dy), 'nudge')
    return
  }
  const map: Record<string, Tool> = { v: 'select', h: 'hand', n: 'sticky', s: 'shape', t: 'text', f: 'frame', l: 'connector', e: 'emoji' }
  if (map[k]) {
    tool.value = map[k]!
    shapeOpen.value = emojiOpen.value = false
  }
}
function onKeyUp(e: KeyboardEvent): void {
  if (e.key === ' ') spaceDown.value = false
}

// ---------- overlays (screen space) ----------
function boxHandles(r: Rect) {
  const pts: Record<string, Point> = {
    nw: { x: r.x, y: r.y }, n: { x: r.x + r.w / 2, y: r.y }, ne: { x: r.x + r.w, y: r.y }, e: { x: r.x + r.w, y: r.y + r.h / 2 },
    se: { x: r.x + r.w, y: r.y + r.h }, s: { x: r.x + r.w / 2, y: r.y + r.h }, sw: { x: r.x, y: r.y + r.h }, w: { x: r.x, y: r.y + r.h / 2 },
  }
  return Object.entries(pts).map(([id, p]) => ({ id, ...toScreen(view.value, p) }))
}

const handles = computed(() => {
  if (selectedObjects.value.length > 1) {
    const box = selectionBox.value
    if (!box || anyLocked.value || props.readonly || inter.value?.kind === 'move' || editing.value) return []
    return boxHandles(box)
  }
  const o = single.value
  if (!o || o.locked || props.readonly || inter.value?.kind === 'move' || editing.value) return []
  if (o.type === 'connector') {
    const pts = connectorPoints(o, board.value)
    return [
      { id: 'from', ...toScreen(view.value, pts[0]!) },
      { id: 'to', ...toScreen(view.value, pts[pts.length - 1]!) },
    ]
  }
  const c = center(o)
  const pts: Record<string, Point> = {
    nw: { x: o.x, y: o.y }, n: { x: o.x + o.w / 2, y: o.y }, ne: { x: o.x + o.w, y: o.y }, e: { x: o.x + o.w, y: o.y + o.h / 2 },
    se: { x: o.x + o.w, y: o.y + o.h }, s: { x: o.x + o.w / 2, y: o.y + o.h }, sw: { x: o.x, y: o.y + o.h }, w: { x: o.x, y: o.y + o.h / 2 },
  }
  const keys = o.type === 'text' ? ['e', 'w'] : o.type === 'emoji' ? ['nw', 'ne', 'se', 'sw'] : Object.keys(pts)
  const list = keys.map((id) => ({ id, ...toScreen(view.value, rotatePoint(pts[id]!, c, o.rotation ?? 0)) }))
  if (o.type !== 'frame') {
    const top = rotatePoint({ x: c.x, y: o.y - 24 / view.value.k }, c, o.rotation ?? 0)
    list.push({ id: 'rotate', ...toScreen(view.value, top) })
  }
  return list
})

const groupOutline = computed(() => {
  const box = selectionBox.value
  if (!box || selectedObjects.value.length < 2) return null
  const a = toScreen(view.value, box)
  return { x: a.x, y: a.y, w: box.w * view.value.k, h: box.h * view.value.k }
})

const outlines = computed(() =>
  selectedObjects.value.map((o) => {
    if (o.type === 'connector') return { id: o.id, d: 'M' + connectorPoints(o, board.value).map((p) => { const s = toScreen(view.value, p); return `${s.x} ${s.y}` }).join(' L') }
    const c = center(o)
    const corners = [
      { x: o.x, y: o.y }, { x: o.x + o.w, y: o.y }, { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h },
    ].map((p) => toScreen(view.value, rotatePoint(p, c, o.rotation ?? 0)))
    return { id: o.id, d: 'M' + corners.map((p) => `${p.x} ${p.y}`).join(' L') + ' Z' }
  }),
)

const preview = computed(() => {
  const it = inter.value
  if (!it) return null
  if (it.kind === 'marquee' || it.kind === 'create') {
    const r = rectOf(it.start, it.cur)
    const s = toScreen(view.value, r)
    return { kind: it.kind, x: s.x, y: s.y, w: r.w * view.value.k, h: r.h * view.value.k }
  }
  if (it.kind === 'connect' || it.kind === 'end') {
    let a: Point
    if (it.kind === 'connect') {
      a = 'id' in it.from ? center(bounds(board.value.objects[it.from.id]!)) : it.from
    } else {
      const c = board.value.objects[it.id] as ConnectorObject
      const pts = connectorPoints(c, board.value)
      a = it.which === 'to' ? pts[0]! : pts[pts.length - 1]!
    }
    const s1 = toScreen(view.value, a)
    const s2 = toScreen(view.value, it.cur)
    const target = targetFor(it.cur)
    const tr = target ? bounds(target) : null
    return { kind: 'line', x1: s1.x, y1: s1.y, x2: s2.x, y2: s2.y, target: tr ? { ...toScreen(view.value, tr), w: tr.w * view.value.k, h: tr.h * view.value.k } : null }
  }
  return null
})

const guideLines = computed(() =>
  guides.value.map((g) => {
    const a = toScreen(view.value, g.axis === 'x' ? { x: g.at, y: g.from } : { x: g.from, y: g.at })
    const b = toScreen(view.value, g.axis === 'x' ? { x: g.at, y: g.to } : { x: g.to, y: g.at })
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
  }),
)

const barEl = ref<HTMLElement | null>(null)
const barSize = ref({ w: 0, h: 44 })
const barPos = computed(() => {
  const box = selectionBox.value
  if (!box || inter.value || editing.value || props.readonly) return null
  const top = toScreen(view.value, { x: box.x + box.w / 2, y: box.y })
  const bottom = toScreen(view.value, { x: box.x, y: box.y + box.h })
  const half = barSize.value.w / 2
  const width = vp.size.value.width
  const x = Math.max(8 + half, Math.min(width - 8 - half, top.x))
  // Above the selection; below it when there is no room; never off screen.
  let y = top.y - barSize.value.h - 12
  if (y < 8) y = Math.min(bottom.y + 12, vp.size.value.height - barSize.value.h - 8)
  return { left: `${x}px`, top: `${Math.max(8, y)}px` }
})
watch(
  () => `${barPos.value === null}|${selection.value.join()}`,
  () =>
    nextTick(() => {
      const el = barEl.value
      if (el && (el.offsetWidth !== barSize.value.w || el.offsetHeight !== barSize.value.h)) barSize.value = { w: el.offsetWidth, h: el.offsetHeight }
    }),
)

const remote = computed(() =>
  others.value.map((p, i) => {
    const color = p.color ?? PRESENCE_COLORS[i % PRESENCE_COLORS.length]!
    const cursor = p.cursor ? toScreen(view.value, p.cursor) : null
    const boxes = (p.selection ?? [])
      .map((id) => board.value.objects[id])
      .filter((o): o is BoardObject => !!o)
      .map((o) => {
        const r = bounds(o, board.value)
        const a = toScreen(view.value, r)
        return { id: o.id, x: a.x - 3, y: a.y - 3, w: r.w * view.value.k + 6, h: r.h * view.value.k + 6 }
      })
    return { client: p.client, name: p.name ?? p.user ?? '', color, cursor, boxes }
  }),
)

// ---------- minimap ----------
const MINI = { w: 200, h: 140 }
const mini = computed(() => {
  const all = boardBounds(board.value)
  const r = viewRect.value
  const box = unionRects([all ?? r, r])!
  const scale = Math.min(MINI.w / box.w, MINI.h / box.h)
  const ox = (MINI.w - box.w * scale) / 2 - box.x * scale
  const oy = (MINI.h - box.h * scale) / 2 - box.y * scale
  const tr = (rr: Rect) => ({ x: rr.x * scale + ox, y: rr.y * scale + oy, w: Math.max(1, rr.w * scale), h: Math.max(1, rr.h * scale) })
  const objects = Object.values(board.value.objects)
    .filter((o) => o.type !== 'connector')
    .slice(0, 3000)
    .map((o) => ({ id: o.id, ...tr(bounds(o)), fill: o.type === 'sticky' ? STICKY_FILL[o.color] : o.type === 'frame' ? 'var(--bd-frame-stroke, #d5d9e0)' : 'var(--bd-mini, #9aa3af)' }))
  return { objects, view: tr(r), scale, ox, oy }
})
function onMiniPointer(e: PointerEvent): void {
  if (e.type === 'pointermove' && e.buttons !== 1) return
  const el = e.currentTarget as HTMLElement
  const rr = el.getBoundingClientRect()
  const m = mini.value
  const p = { x: (e.clientX - rr.left - m.ox) / m.scale, y: (e.clientY - rr.top - m.oy) / m.scale }
  vp.centre(p, e.type === 'pointerdown')
}

// ---------- export ----------
function download(name: string, blob: Blob): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
function svgString(): { svg: string; width: number; height: number } {
  const family = root.value ? getComputedStyle(root.value).fontFamily : undefined
  return boardToSvg(board.value, { measure: measure.value, fontFamily: family, ids: selection.value.length ? selection.value : undefined, background: '#ffffff' })
}
function exportSvg(): void {
  download('board.svg', new Blob([svgString().svg], { type: 'image/svg+xml' }))
  exportOpen.value = false
}
async function toPng(scale = 2): Promise<Blob> {
  const { svg, width, height } = svgString()
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0, width, height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
}
async function exportPng(): Promise<void> {
  download('board.png', await toPng())
  exportOpen.value = false
}
function exportJson(): void {
  download('board.json', new Blob([JSON.stringify(board.value, null, 2)], { type: 'application/json' }))
  exportOpen.value = false
}

const emptyHint = computed(() => Object.keys(board.value.objects).length === 0 && !props.readonly)

defineExpose({ doc, applyRemote, sync: () => sync, fit: fitAll, select, toPng, toSvg: svgString, zoomTo: vp.zoomTo })

// Swatches.
const stickySwatches = STICKY_COLORS.map((c) => ({ id: c as StickyColor, color: STICKY_FILL[c] }))
const singleShape = computed(() => (single.value?.type === 'shape' ? single.value : null))
const onlyType = computed(() => (selectedTypes.value.size === 1 ? [...selectedTypes.value][0] : null))
const firstConnector = computed(() => selectedObjects.value.find((o): o is ConnectorObject => o.type === 'connector') ?? null)
</script>

<template>
  <div
    ref="root"
    class="bd-root"
    :class="{ 'bd-root--readonly': readonly, [`bd-tool-${tool}`]: true, 'bd-panning': spaceDown || inter?.kind === 'pan' }"
    tabindex="0"
    @keydown="onKey"
    @keyup="onKeyUp"
    @copy="onCopy($event)"
    @cut="onCopy($event, true)"
    @paste="onPaste"
  >
    <svg
      ref="svgEl"
      class="bd-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @dblclick="onDblClick"
      @contextmenu.prevent
    >
      <defs>
        <pattern
          :id="`bd-dots-${uid}`"
          :width="dotGap"
          :height="dotGap"
          patternUnits="userSpaceOnUse"
          :x="view.x % dotGap"
          :y="view.y % dotGap"
        >
          <circle
            :cx="dotGap / 2"
            :cy="dotGap / 2"
            :r="Math.max(0.6, Math.min(1.4, view.k))"
            class="bd-dot"
          />
        </pattern>
      </defs>
      <rect
        class="bd-bg"
        width="100%"
        height="100%"
        :fill="`url(#bd-dots-${uid})`"
      />
      <g :transform="transform">
        <SvgTree
          v-for="o in visible"
          :key="o.id"
          :node="rendered(o)"
          :class="{ 'bd-editing': editing?.id === o.id }"
        />
      </g>
      <g class="bd-overlay">
        <rect
          v-if="groupOutline"
          :x="groupOutline.x"
          :y="groupOutline.y"
          :width="groupOutline.w"
          :height="groupOutline.h"
          class="bd-group-outline"
        />
        <path
          v-for="ol in outlines"
          :key="ol.id"
          :d="ol.d"
          class="bd-outline"
        />
        <line
          v-for="(g, i) in guideLines"
          :key="i"
          v-bind="g"
          class="bd-guide"
        />
        <template v-if="preview">
          <rect
            v-if="preview.kind === 'marquee' || preview.kind === 'create'"
            :x="preview.x"
            :y="preview.y"
            :width="preview.w"
            :height="preview.h"
            :class="preview.kind === 'marquee' ? 'bd-marquee' : 'bd-create'"
          />
          <template v-else-if="preview.kind === 'line'">
            <rect
              v-if="preview.target"
              :x="preview.target.x - 3"
              :y="preview.target.y - 3"
              :width="preview.target.w + 6"
              :height="preview.target.h + 6"
              rx="6"
              class="bd-drop"
            />
            <line
              :x1="preview.x1"
              :y1="preview.y1"
              :x2="preview.x2"
              :y2="preview.y2"
              class="bd-connect-line"
            />
          </template>
        </template>
        <g
          v-for="r in remote"
          :key="r.client"
          class="bd-remote"
        >
          <rect
            v-for="bx in r.boxes"
            :key="bx.id"
            :x="bx.x"
            :y="bx.y"
            :width="bx.w"
            :height="bx.h"
            rx="4"
            fill="none"
            :stroke="r.color"
            stroke-width="2"
          />
          <g
            v-if="r.cursor"
            :transform="`translate(${r.cursor.x} ${r.cursor.y})`"
            class="bd-cursor"
          >
            <path
              d="M0 0 L0 16 L4.5 12 L7.5 19 L10 18 L7 11 L13 11 Z"
              :fill="r.color"
              stroke="#fff"
              stroke-width="1.2"
            />
            <g
              v-if="r.name"
              transform="translate(14 18)"
            >
              <rect
                :width="r.name.length * 7 + 12"
                height="20"
                rx="6"
                :fill="r.color"
              />
              <text
                x="6"
                y="14"
                font-size="12"
                fill="#fff"
              >{{ r.name }}</text>
            </g>
          </g>
        </g>
        <template
          v-for="hd in handles"
          :key="hd.id"
        >
          <circle
            v-if="hd.id === 'rotate' || hd.id === 'from' || hd.id === 'to'"
            :cx="hd.x"
            :cy="hd.y"
            r="6"
            :data-handle="hd.id"
            :class="['bd-handle', `bd-handle--${hd.id}`]"
          />
          <rect
            v-else
            :x="hd.x - 5"
            :y="hd.y - 5"
            width="10"
            height="10"
            rx="2"
            :data-handle="hd.id"
            :class="['bd-handle', `bd-handle--${hd.id}`]"
          />
        </template>
      </g>
    </svg>

    <textarea
      v-if="editing"
      ref="textarea"
      v-model="editing.value"
      class="bd-text-editor"
      :style="editorStyle"
      spellcheck="false"
      @keydown="onEditorKey"
      @blur="commitText"
    />

    <div
      v-if="provider"
      class="bd-panel bd-status"
      :class="`bd-status--${ready ? status ?? 'online' : 'connecting'}`"
    >
      <span class="bd-status-dot" />
      <span
        v-for="o in others.slice(0, 6)"
        :key="o.client"
        class="bd-avatar"
        :style="{ background: o.color }"
        :title="o.name ?? o.user"
      >{{ (o.name ?? o.user ?? '?').slice(0, 1).toUpperCase() }}</span>
    </div>
    <div
      v-if="emptyHint && ready"
      class="bd-hint"
    >
      {{ L.emptyHint }}
    </div>

    <!-- tools -->
    <div
      v-if="!readonly"
      class="bd-panel bd-tools"
    >
      <UidTooltip
        v-for="t in tools"
        :key="t.id"
        :content="t.label"
        placement="right"
      >
        <UidButton
          size="sm"
          :variant="tool === t.id ? 'secondary' : 'ghost'"
          :icon="t.icon"
          :aria-label="t.label"
          :class="`bd-tool bd-tool--${t.id}`"
          @click="pickTool(t.id)"
        />
      </UidTooltip>
      <span class="bd-sep" />
      <UidTooltip
        :content="L.undo"
        placement="right"
      >
        <UidButton
          size="sm"
          variant="ghost"
          :icon="Undo2"
          :aria-label="L.undo"
          :disabled="!doc.canUndo"
          @click="undo"
        />
      </UidTooltip>
      <UidTooltip
        :content="L.redo"
        placement="right"
      >
        <UidButton
          size="sm"
          variant="ghost"
          :icon="Redo2"
          :aria-label="L.redo"
          :disabled="!doc.canRedo"
          @click="redo"
        />
      </UidTooltip>
    </div>
    <div
      v-if="shapeOpen && tool === 'shape'"
      class="bd-panel bd-flyout bd-flyout--shapes"
    >
      <button
        v-for="k in SHAPES"
        :key="k"
        type="button"
        :class="['bd-swatch-btn', { 'is-active': shapeKind === k }]"
        :title="L.shapes[k]"
        @click="shapeKind = k; shapeOpen = false"
      >
        <svg
          viewBox="-2 -2 28 22"
          width="28"
          height="22"
        ><path
          :d="shapePath(k, 24, 18)"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
        /></svg>
      </button>
    </div>
    <div
      v-if="emojiOpen && tool === 'emoji'"
      class="bd-panel bd-flyout bd-flyout--emoji"
    >
      <button
        v-for="em in EMOJI"
        :key="em"
        type="button"
        :class="['bd-emoji-btn', { 'is-active': emojiChar === em }]"
        @click="emojiChar = em; emojiOpen = false"
      >
        {{ em }}
      </button>
    </div>

    <!-- context bar -->
    <div
      v-if="barPos && selectedObjects.length"
      ref="barEl"
      class="bd-panel bd-bar"
      :style="barPos"
      @pointerdown.stop
    >
      <template v-if="onlyType === 'sticky'">
        <button
          v-for="sw in stickySwatches"
          :key="sw.id"
          type="button"
          class="bd-color"
          :style="{ background: sw.color }"
          :aria-label="sw.id"
          @click="setSel({ color: sw.id })"
        />
        <span class="bd-sep" />
      </template>
      <template v-if="onlyType === 'shape'">
        <select
          v-if="singleShape"
          class="bd-select"
          :value="singleShape.kind"
          @change="setSel({ kind: ($event.target as HTMLSelectElement).value })"
        >
          <option
            v-for="k in SHAPES"
            :key="k"
            :value="k"
          >
            {{ L.shapes[k] }}
          </option>
        </select>
        <span class="bd-label">{{ L.fill }}</span>
        <button
          v-for="c in PALETTE"
          :key="'f' + c"
          type="button"
          class="bd-color bd-color--sm"
          :style="{ background: c }"
          @click="setSel({ fill: c })"
        />
        <span class="bd-label">{{ L.stroke }}</span>
        <button
          v-for="c in PALETTE.slice(0, 9)"
          :key="'s' + c"
          type="button"
          class="bd-color bd-color--sm bd-color--ring"
          :style="{ borderColor: c }"
          @click="setSel({ stroke: c })"
        />
        <UidButton
          size="sm"
          :variant="singleShape?.strokeStyle === 'dashed' ? 'secondary' : 'ghost'"
          @click="setSel({ strokeStyle: singleShape?.strokeStyle === 'dashed' ? null : 'dashed' })"
        >
          {{ L.dashed }}
        </UidButton>
        <span class="bd-sep" />
      </template>
      <template v-if="onlyType === 'text'">
        <UidButton
          v-for="vr in (['title', 'h2', 'body'] as const)"
          :key="vr"
          size="sm"
          :variant="single?.type === 'text' && single.variant === vr ? 'secondary' : 'ghost'"
          @click="setSel({ variant: vr })"
        >
          {{ L[vr] }}
        </UidButton>
        <button
          v-for="c in PALETTE.slice(0, 9)"
          :key="'t' + c"
          type="button"
          class="bd-color bd-color--sm"
          :style="{ background: c }"
          @click="setSel({ color: c })"
        />
        <span class="bd-sep" />
      </template>
      <template v-if="firstConnector && onlyType === 'connector'">
        <UidButton
          v-for="rt in (['straight', 'elbow', 'curve'] as const)"
          :key="rt"
          size="sm"
          :variant="firstConnector.route === rt ? 'secondary' : 'ghost'"
          @click="setSel({ route: rt })"
        >
          {{ L[rt] }}
        </UidButton>
        <UidButton
          size="sm"
          :variant="(firstConnector.startArrow ?? 'none') !== 'none' ? 'secondary' : 'ghost'"
          @click="setSel({ startArrow: (firstConnector.startArrow ?? 'none') !== 'none' ? null : 'arrow' })"
        >
          ←
        </UidButton>
        <UidButton
          size="sm"
          :variant="(firstConnector.endArrow ?? 'arrow') !== 'none' ? 'secondary' : 'ghost'"
          @click="setSel({ endArrow: (firstConnector.endArrow ?? 'arrow') !== 'none' ? 'none' : 'arrow' })"
        >
          →
        </UidButton>
        <UidButton
          size="sm"
          :variant="firstConnector.strokeStyle === 'dashed' ? 'secondary' : 'ghost'"
          @click="setSel({ strokeStyle: firstConnector.strokeStyle === 'dashed' ? null : 'dashed' })"
        >
          {{ L.dashed }}
        </UidButton>
        <button
          v-for="c in PALETTE.slice(0, 9)"
          :key="'c' + c"
          type="button"
          class="bd-color bd-color--sm"
          :style="{ background: c }"
          @click="setSel({ stroke: c })"
        />
        <span class="bd-sep" />
      </template>
      <template v-if="selectedObjects.length > 1">
        <UidTooltip
          v-for="a in ([['left', AlignStartVertical], ['centerX', AlignCenterVertical], ['right', AlignEndVertical], ['top', AlignStartHorizontal], ['centerY', AlignCenterHorizontal], ['bottom', AlignEndHorizontal]] as const)"
          :key="a[0]"
          :content="alignLabel(a[0])"
          placement="top"
        >
          <UidButton
            size="sm"
            variant="ghost"
            :icon="a[1]"
            @click="doAlign(a[0])"
          />
        </UidTooltip>
        <UidButton
          v-if="selectedObjects.length > 2"
          size="sm"
          variant="ghost"
          :title="L.distributeX"
          @click="doDistribute('x')"
        >
          ⇹
        </UidButton>
        <UidTooltip
          :content="L.wrap"
          placement="top"
        >
          <UidButton
            size="sm"
            variant="ghost"
            :icon="Frame"
            @click="wrap"
          />
        </UidTooltip>
        <span class="bd-sep" />
      </template>
      <UidTooltip
        :content="L.front"
        placement="top"
      >
        <UidButton
          size="sm"
          variant="ghost"
          :icon="ArrowUpToLine"
          @click="toFront"
        />
      </UidTooltip>
      <UidTooltip
        :content="L.back"
        placement="top"
      >
        <UidButton
          size="sm"
          variant="ghost"
          :icon="ArrowDownToLine"
          @click="toBack"
        />
      </UidTooltip>
      <UidTooltip
        :content="L.duplicate"
        placement="top"
      >
        <UidButton
          size="sm"
          variant="ghost"
          :icon="Copy"
          @click="dup"
        />
      </UidTooltip>
      <UidTooltip
        :content="anyLocked ? L.unlock : L.lock"
        placement="top"
      >
        <UidButton
          size="sm"
          :variant="anyLocked ? 'secondary' : 'ghost'"
          :icon="anyLocked ? Lock : LockOpen"
          @click="toggleLock"
        />
      </UidTooltip>
      <UidTooltip
        :content="L.delete"
        placement="top"
      >
        <UidButton
          size="sm"
          variant="ghost"
          :icon="Trash2"
          class="bd-delete"
          @click="del"
        />
      </UidTooltip>
    </div>

    <!-- zoom, minimap, export -->
    <div class="bd-corner">
      <div
        v-if="showMinimap"
        class="bd-panel bd-minimap"
        @pointerdown="onMiniPointer"
        @pointermove="onMiniPointer"
      >
        <svg
          :width="MINI.w"
          :height="MINI.h"
        >
          <rect
            v-for="m in mini.objects"
            :key="m.id"
            :x="m.x"
            :y="m.y"
            :width="m.w"
            :height="m.h"
            :fill="m.fill"
          />
          <rect
            :x="mini.view.x"
            :y="mini.view.y"
            :width="mini.view.w"
            :height="mini.view.h"
            class="bd-mini-view"
          />
        </svg>
      </div>
      <div class="bd-panel bd-zoom">
        <UidButton
          size="sm"
          variant="ghost"
          :icon="Minus"
          :aria-label="L.zoomOut"
          @click="vp.zoomBy(0.8, undefined, true)"
        />
        <UidButton
          size="sm"
          variant="ghost"
          class="bd-zoom-pct"
          @click="vp.zoomTo(1)"
        >
          {{ zoomPct }}%
        </UidButton>
        <UidButton
          size="sm"
          variant="ghost"
          :icon="Plus"
          :aria-label="L.zoomIn"
          @click="vp.zoomBy(1.25, undefined, true)"
        />
        <UidTooltip
          :content="L.fit"
          placement="top"
        >
          <UidButton
            size="sm"
            variant="ghost"
            :icon="Maximize"
            :aria-label="L.fit"
            @click="fitAll()"
          />
        </UidTooltip>
        <UidTooltip
          :content="L.minimap"
          placement="top"
        >
          <UidButton
            size="sm"
            :variant="showMinimap ? 'secondary' : 'ghost'"
            :icon="MapIcon"
            :aria-label="L.minimap"
            @click="showMinimap = !showMinimap"
          />
        </UidTooltip>
        <UidTooltip
          :content="L.export"
          placement="top"
        >
          <UidButton
            size="sm"
            variant="ghost"
            :icon="Download"
            :aria-label="L.export"
            @click="exportOpen = !exportOpen"
          />
        </UidTooltip>
      </div>
      <div
        v-if="exportOpen"
        class="bd-panel bd-export"
      >
        <button
          type="button"
          @click="exportPng"
        >
          {{ L.exportPng }}
        </button>
        <button
          type="button"
          @click="exportSvg"
        >
          {{ L.exportSvg }}
        </button>
        <button
          type="button"
          @click="exportJson"
        >
          {{ L.exportJson }}
        </button>
      </div>
    </div>
  </div>
</template>
