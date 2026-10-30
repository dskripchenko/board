/**
 * Workshop templates: event storming, a customer journey map, a user story
 * map and a retrospective. A template is a set of objects laid out around
 * the origin; `insertTemplate` places it on a board as one step of history,
 * with fresh ids, above everything there.
 */
import type { Board, BoardObject, Point, Rect, StickyColor } from './model/types'
import type { Op } from './model/ops'
import { newId } from './model/ids'
import { keysBetween } from './model/zindex'

export type TemplateId = 'event-storming' | 'customer-journey' | 'story-map' | 'retrospective'

export interface TemplateInfo {
  id: TemplateId
  title: string
  description: string
}

/** An object of a template: its key stands for the id; `parent` and connector ends name keys. */
type Item = Record<string, unknown> & { key: string; type: BoardObject['type']; x: number; y: number; w: number; h: number; parent?: string }

interface Strings {
  titles: Record<TemplateId, string>
  descriptions: Record<TemplateId, string>
  es: { legend: string; timeline: string; time: string; example: string; event: string; command: string; actor: string; policy: string; readModel: string; external: string; aggregate: string; hotspot: string; sample: string[] }
  cjm: { persona: string; goal: string; stages: string[]; rows: string[] }
  map: { journey: string; activities: string; tasks: string; releases: string[]; activityNames: string[]; taskNames: string[][]; story: string }
  retro: { well: string; improve: string; actions: string; hint: string }
}

const EN: Strings = {
  titles: { 'event-storming': 'Event storming', 'customer-journey': 'Customer journey map', 'story-map': 'User story map', retrospective: 'Retrospective' },
  descriptions: {
    'event-storming': 'Domain events on a timeline, with commands, actors, policies and hotspots',
    'customer-journey': 'Stages of the journey against actions, touchpoints, thoughts, emotions and pain points',
    'story-map': 'The backbone of activities and tasks, stories sliced into releases',
    retrospective: 'What went well, what to improve, and what we will do',
  },
  es: {
    legend: 'Legend',
    timeline: 'Timeline',
    time: 'Time',
    example: 'Example — replace it with yours',
    event: 'Domain event',
    command: 'Command',
    actor: 'Actor',
    policy: 'Policy',
    readModel: 'Read model',
    external: 'External system',
    aggregate: 'Aggregate',
    hotspot: 'Hotspot',
    sample: ['Customer', 'Place order', 'Order', 'Order placed', 'When an order is placed, reserve the stock', 'Payment provider', 'Stock reserved', 'Who checks the address?'],
  },
  cjm: {
    persona: 'Persona: who is travelling?',
    goal: 'Goal: what do they want to get done?',
    stages: ['Awareness', 'Consideration', 'Purchase', 'Use', 'Loyalty'],
    rows: ['Actions', 'Touchpoints', 'Thoughts', 'Emotions', 'Pain points', 'Opportunities'],
  },
  map: {
    journey: 'User journey',
    activities: 'Activities',
    tasks: 'Tasks',
    releases: ['Release 1 — MVP', 'Release 2', 'Later'],
    activityNames: ['Find a product', 'Buy it', 'Receive it'],
    taskNames: [
      ['Search', 'Compare'],
      ['Add to cart', 'Pay'],
      ['Track delivery', 'Return'],
    ],
    story: 'Story',
  },
  retro: { well: 'What went well', improve: 'What to improve', actions: 'Actions', hint: 'Add a note' },
}

const RU: Strings = {
  titles: { 'event-storming': 'Event storming', 'customer-journey': 'Карта пути клиента', 'story-map': 'Карта пользовательских историй', retrospective: 'Ретроспектива' },
  descriptions: {
    'event-storming': 'События предметной области на шкале времени, с командами, актёрами, политиками и горячими точками',
    'customer-journey': 'Этапы пути против действий, точек контакта, мыслей, эмоций и болей',
    'story-map': 'Хребет из активностей и задач, истории нарезаны на релизы',
    retrospective: 'Что прошло хорошо, что улучшить и что мы сделаем',
  },
  es: {
    legend: 'Легенда',
    timeline: 'Шкала времени',
    time: 'Время',
    example: 'Пример — замените своим',
    event: 'Событие',
    command: 'Команда',
    actor: 'Актёр',
    policy: 'Политика',
    readModel: 'Модель чтения',
    external: 'Внешняя система',
    aggregate: 'Агрегат',
    hotspot: 'Горячая точка',
    sample: ['Покупатель', 'Оформить заказ', 'Заказ', 'Заказ оформлен', 'Когда заказ оформлен — зарезервировать товар', 'Платёжный сервис', 'Товар зарезервирован', 'Кто проверяет адрес?'],
  },
  cjm: {
    persona: 'Персона: кто проходит путь?',
    goal: 'Цель: чего он хочет добиться?',
    stages: ['Осведомлённость', 'Выбор', 'Покупка', 'Использование', 'Лояльность'],
    rows: ['Действия', 'Точки контакта', 'Мысли', 'Эмоции', 'Боли', 'Возможности'],
  },
  map: {
    journey: 'Путь пользователя',
    activities: 'Активности',
    tasks: 'Задачи',
    releases: ['Релиз 1 — MVP', 'Релиз 2', 'Позже'],
    activityNames: ['Найти товар', 'Купить', 'Получить'],
    taskNames: [
      ['Поиск', 'Сравнение'],
      ['В корзину', 'Оплата'],
      ['Отследить доставку', 'Возврат'],
    ],
    story: 'История',
  },
  retro: { well: 'Что прошло хорошо', improve: 'Что улучшить', actions: 'Что сделаем', hint: 'Добавьте заметку' },
}

function strings(locale: string | undefined): Strings {
  return (locale ?? '').toLowerCase().startsWith('ru') ? RU : EN
}

const IDS: TemplateId[] = ['event-storming', 'customer-journey', 'story-map', 'retrospective']

/** The templates on offer, with titles in the given language (`ru…`, else English). */
export function listTemplates(locale?: string): TemplateInfo[] {
  const s = strings(locale)
  return IDS.map((id) => ({ id, title: s.titles[id], description: s.descriptions[id] }))
}

// ---------------------------------------------------------------------------
// The templates, around (0, 0)
// ---------------------------------------------------------------------------

const sticky = (key: string, x: number, y: number, color: StickyColor, text: string, parent: string, w = 150, h = 110, extra: Record<string, unknown> = {}): Item => ({
  key,
  type: 'sticky',
  x,
  y,
  w,
  h,
  color,
  text,
  fontSize: 'auto',
  parent,
  ...extra,
})

const text = (key: string, x: number, y: number, w: number, value: string, variant: 'title' | 'h2' | 'body', parent?: string, extra: Record<string, unknown> = {}): Item => ({
  key,
  type: 'text',
  x,
  y,
  w,
  h: variant === 'title' ? 48 : variant === 'h2' ? 36 : 28,
  text: value,
  variant,
  parent,
  ...extra,
})

function eventStorming(s: Strings): Item[] {
  const e = s.es
  const items: Item[] = [
    { key: 'board', type: 'frame', x: 0, y: 0, w: 1880, h: 860, title: s.titles['event-storming'] },
    { key: 'legend', type: 'frame', x: 40, y: 60, w: 380, h: 760, title: e.legend, fill: '#f8fafc', parent: 'board' },
  ]
  const legend: [string, StickyColor, string, Record<string, unknown>?, number?, number?][] = [
    ['l-event', 'orange', e.event],
    ['l-command', 'blue', e.command],
    ['l-actor', 'yellow', e.actor, {}, 100, 80],
    ['l-policy', 'violet', e.policy],
    ['l-read', 'green', e.readModel],
    ['l-external', 'pink', e.external],
    ['l-aggregate', 'yellow', e.aggregate, {}, 150, 160],
    ['l-hotspot', 'pink', e.hotspot, { rotation: 45 }, 100, 100],
  ]
  legend.forEach(([key, color, label, extra, w, h], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    items.push(sticky(key, 70 + col * 170, 110 + row * 175, color, label, 'legend', w ?? 150, h ?? 110, extra ?? {}))
  })
  items.push({ key: 'timeline', type: 'frame', x: 460, y: 60, w: 1380, h: 760, title: e.timeline, parent: 'board' })
  items.push({ key: 'arrow', type: 'connector', x: 0, y: 0, w: 0, h: 0, from: { x: 500, y: 780 }, to: { x: 1800, y: 780 }, route: 'straight', endArrow: 'triangle', label: e.time, stroke: '#64748b', parent: 'timeline' })
  items.push(text('example', 500, 100, 600, e.example, 'body', 'timeline', { color: '#64748b' }))
  const [actor, command, aggregate, event, policy, external, event2, hotspot] = e.sample
  items.push(
    sticky('s-actor', 500, 200, 'yellow', actor!, 'timeline', 100, 80),
    sticky('s-command', 620, 180, 'blue', command!, 'timeline'),
    sticky('s-aggregate', 790, 160, 'yellow', aggregate!, 'timeline', 150, 160),
    sticky('s-event', 960, 180, 'orange', event!, 'timeline'),
    sticky('s-policy', 1130, 180, 'violet', policy!, 'timeline'),
    sticky('s-external', 1130, 330, 'pink', external!, 'timeline'),
    sticky('s-event2', 1300, 180, 'orange', event2!, 'timeline'),
    sticky('s-hotspot', 1490, 190, 'pink', hotspot!, 'timeline', 100, 100, { rotation: 45 }),
  )
  return items
}

function customerJourney(s: Strings): Item[] {
  const c = s.cjm
  const head = 220
  const col = 260
  const rowH = 140
  const top = 220
  const width = head + col * c.stages.length + 80
  const items: Item[] = [
    { key: 'board', type: 'frame', x: 0, y: 0, w: width, h: top + 70 + rowH * c.rows.length + 40, title: s.titles['customer-journey'] },
    sticky('persona', 40, 50, 'yellow', c.persona, 'board', 300, 120),
    sticky('goal', 360, 50, 'yellow', c.goal, 'board', 300, 120),
  ]
  c.stages.forEach((stage, i) => {
    items.push({ key: `stage-${i}`, type: 'shape', kind: 'rounded', x: 40 + head + col * i, y: top, w: col - 20, h: 56, fill: '#dbeafe', stroke: '#93c5fd', text: stage, fontSize: 18, parent: 'board' })
  })
  c.rows.forEach((row, r) => {
    const y = top + 70 + rowH * r
    items.push({ key: `row-${r}`, type: 'shape', kind: 'rect', x: 40, y, w: head - 20, h: rowH - 12, fill: '#f1f5f9', stroke: '#cbd5e1', text: row, fontSize: 16, parent: 'board' })
    c.stages.forEach((_, i) => {
      const x = 40 + head + col * i
      if (r === 3) {
        // The emotional curve: a face per stage to move up or down.
        items.push({ key: `cell-${r}-${i}`, type: 'shape', kind: 'rect', x, y, w: col - 20, h: rowH - 12, stroke: '#e2e8f0', strokeStyle: 'dashed', parent: 'board' })
        items.push({ key: `face-${i}`, type: 'emoji', x: x + (col - 20) / 2 - 28, y: y + 30 + (i % 2) * 30 - 15, w: 56, h: 56, char: ['🙂', '🤔', '😀', '😐', '😍'][i] ?? '🙂', parent: 'board' })
      } else {
        items.push({ key: `cell-${r}-${i}`, type: 'shape', kind: 'rect', x, y, w: col - 20, h: rowH - 12, stroke: '#e2e8f0', strokeStyle: 'dashed', parent: 'board' })
      }
    })
  })
  return items
}

function storyMap(s: Strings): Item[] {
  const m = s.map
  const left = 220
  const colW = 180
  const cols = m.taskNames.flat().length
  const width = left + colW * cols + 80
  const releaseTop = 470
  const releaseH = 220
  const items: Item[] = [
    { key: 'board', type: 'frame', x: 0, y: 0, w: width, h: releaseTop + releaseH * m.releases.length + 40, title: s.titles['story-map'] },
    { key: 'journey', type: 'connector', x: 0, y: 0, w: 0, h: 0, from: { x: left + 40, y: 70 }, to: { x: width - 60, y: 70 }, route: 'straight', endArrow: 'triangle', label: m.journey, stroke: '#64748b', parent: 'board' },
    text('h-activities', 40, 120, left - 40, m.activities, 'h2', 'board'),
    text('h-tasks', 40, 300, left - 40, m.tasks, 'h2', 'board'),
  ]
  let column = 0
  m.activityNames.forEach((activity, a) => {
    const tasks = m.taskNames[a] ?? []
    items.push(sticky(`activity-${a}`, left + 40 + colW * column, 100, 'orange', activity, 'board', colW * tasks.length - 30, 110))
    tasks.forEach((task, t) => {
      items.push(sticky(`task-${a}-${t}`, left + 40 + colW * (column + t), 280, 'yellow', task, 'board', 150, 110))
    })
    column += tasks.length
  })
  m.releases.forEach((release, r) => {
    const y = releaseTop + releaseH * r
    items.push({ key: `line-${r}`, type: 'connector', x: 0, y: 0, w: 0, h: 0, from: { x: 40, y }, to: { x: width - 40, y }, route: 'straight', endArrow: 'none', strokeStyle: 'dashed', stroke: '#94a3b8', parent: 'board' })
    items.push(text(`release-${r}`, 40, y + 16, left - 40, release, 'h2', 'board'))
    // A story or two under the first tasks shows where they go.
    for (let c = 0; c < cols; c++) {
      if ((c + r) % 3 === 2) continue
      if (r === 2 && c > 2) continue
      items.push(sticky(`story-${r}-${c}`, left + 40 + colW * c, y + 40, 'blue', m.story, 'board', 150, 90))
    }
  })
  return items
}

function retrospective(s: Strings): Item[] {
  const r = s.retro
  const items: Item[] = [{ key: 'board', type: 'frame', x: 0, y: 0, w: 1380, h: 720, title: s.titles.retrospective }]
  const columns: [string, string, string, StickyColor][] = [
    ['well', r.well, '#ecfdf5', 'green'],
    ['improve', r.improve, '#fff1f2', 'pink'],
    ['actions', r.actions, '#eff6ff', 'blue'],
  ]
  columns.forEach(([key, title, fill, color], i) => {
    items.push({ key, type: 'frame', x: 40 + i * 440, y: 60, w: 410, h: 620, title, fill, parent: 'board' })
    items.push(sticky(`${key}-hint`, 70 + i * 440, 110, color, r.hint, key, 160, 120))
  })
  return items
}

const BUILDERS: Record<TemplateId, (s: Strings) => Item[]> = {
  'event-storming': eventStorming,
  'customer-journey': customerJourney,
  'story-map': storyMap,
  retrospective,
}

function topZ(board: Board): string | null {
  let max: string | null = null
  for (const o of Object.values(board.objects)) if (max === null || o.z > max) max = o.z
  return max
}

/**
 * Places a template with its centre at `at`: the objects to create (one
 * step of history), their ids, and the area it covers.
 */
export function insertTemplate(board: Board, id: TemplateId, at: Point, locale?: string): { ids: string[]; ops: Op[]; bounds: Rect } {
  const build = BUILDERS[id]
  if (!build) throw new Error(`Unknown template "${id}"`)
  const items = build(strings(locale))
  const root = items[0]!
  const dx = Math.round(at.x - (root.x + root.w / 2))
  const dy = Math.round(at.y - (root.y + root.h / 2))
  const idOf = new Map(items.map((it) => [it.key, newId()]))
  const zs = keysBetween(topZ(board), null, items.length)
  const shift = (end: unknown) => {
    const e = end as { x?: number; y?: number; id?: string }
    if (e.id !== undefined) return { ...e, id: idOf.get(e.id) ?? e.id }
    return { x: (e.x ?? 0) + dx, y: (e.y ?? 0) + dy }
  }
  const ops: Op[] = items.map((it, i) => {
    const { key, parent, ...rest } = it
    const obj: Record<string, unknown> = { ...rest, id: idOf.get(key)!, x: it.x + dx, y: it.y + dy, z: zs[i]! }
    if (parent) obj.parent = idOf.get(parent)
    if (it.type === 'connector') {
      obj.from = shift(it.from)
      obj.to = shift(it.to)
    }
    return { k: 'create', id: idOf.get(key)!, obj: obj as unknown as BoardObject }
  })
  return { ids: items.map((it) => idOf.get(it.key)!), ops, bounds: { x: root.x + dx, y: root.y + dy, w: root.w, h: root.h } }
}
