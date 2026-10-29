import type { Board, BoardObject, ObjectType, ShapeKind } from './types'
import { STICKY_COLORS } from './types'
import { keysBetween } from './zindex'

export class BoardError extends Error {
  constructor(
    message: string,
    /** A JSON pointer to the faulty value. */
    readonly pointer: string,
  ) {
    super(`${pointer || '/'}: ${message}`)
    this.name = 'BoardError'
  }
}

const TYPES: ObjectType[] = ['shape', 'sticky', 'text', 'frame', 'connector', 'emoji', 'ink']
const KINDS: ShapeKind[] = ['rect', 'rounded', 'ellipse', 'diamond', 'triangle', 'parallelogram', 'hexagon', 'star']

export function emptyBoard(): Board {
  return { version: 1, objects: {} }
}

/**
 * Reads a board from JSON text or an object: checks the structure, fills
 * defaults (stacking keys, sticky colour, text variant…), drops objects of an
 * unknown type. Throws `BoardError` with a JSON pointer.
 */
export function parseBoard(input: unknown): Board {
  let data = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch (e) {
      throw new BoardError(`not JSON: ${(e as Error).message}`, '')
    }
  }
  if (!isRecord(data)) throw new BoardError('a board is an object', '')
  if (data.version !== undefined && data.version !== 1) throw new BoardError(`unsupported version ${String(data.version)}`, '/version')
  const raw = data.objects ?? {}
  if (!isRecord(raw)) throw new BoardError('objects is a map of id → object', '/objects')

  const objects: Record<string, BoardObject> = {}
  const missingZ: string[] = []
  for (const [key, value] of Object.entries(raw)) {
    const at = `/objects/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`
    if (!isRecord(value)) throw new BoardError('an object is expected', at)
    const type = value.type
    if (!TYPES.includes(type as ObjectType)) continue
    const obj: Record<string, unknown> = { ...value, id: key }
    for (const field of ['x', 'y', 'w', 'h'] as const) {
      const n = obj[field] ?? (field === 'w' || field === 'h' ? 0 : 0)
      if (typeof n !== 'number' || !Number.isFinite(n)) throw new BoardError(`${field} must be a number`, `${at}/${field}`)
      obj[field] = n
    }
    if (typeof obj.z !== 'string' || obj.z === '') missingZ.push(key)
    switch (type) {
      case 'shape':
        if (!KINDS.includes(obj.kind as ShapeKind)) obj.kind = 'rect'
        break
      case 'sticky':
        if (!STICKY_COLORS.includes(obj.color as never)) obj.color = 'yellow'
        break
      case 'text':
        obj.text = typeof obj.text === 'string' ? obj.text : ''
        if (!['title', 'h2', 'body'].includes(obj.variant as string)) obj.variant = 'body'
        break
      case 'connector':
        for (const end of ['from', 'to'] as const) {
          const e = obj[end]
          const ok = isRecord(e) && (typeof e.id === 'string' || (typeof e.x === 'number' && typeof e.y === 'number'))
          if (!ok) throw new BoardError('a connector end is { id } or { x, y }', `${at}/${end}`)
        }
        if (!['straight', 'elbow', 'curve'].includes(obj.route as string)) obj.route = 'elbow'
        break
      case 'ink': {
        const pts = obj.points
        if (!Array.isArray(pts) || pts.length < 2 || pts.length % 2 !== 0 || !pts.every((n) => typeof n === 'number' && Number.isFinite(n))) {
          throw new BoardError('a stroke needs points: x,y pairs', `${at}/points`)
        }
        if (obj.tool !== 'marker') obj.tool = 'pen'
        if (typeof obj.vw !== 'number' || obj.vw <= 0) obj.vw = Math.max(1, obj.w as number)
        if (typeof obj.vh !== 'number' || obj.vh <= 0) obj.vh = Math.max(1, obj.h as number)
        if (typeof obj.color !== 'string') obj.color = '#1f2937'
        if (typeof obj.width !== 'number' || obj.width <= 0) obj.width = obj.tool === 'marker' ? 20 : 3
        break
      }
      case 'emoji':
        if (typeof obj.char !== 'string' || obj.char === '') throw new BoardError('an emoji needs a char', `${at}/char`)
        break
    }
    objects[key] = obj as unknown as BoardObject
  }
  // Objects without a stacking key go on top, in the order written.
  if (missingZ.length > 0) {
    const top = Object.values(objects).reduce<string | null>((max, o) => (o.z && (max === null || o.z > max) ? o.z : max), null)
    const keys = keysBetween(top, null, missingZ.length)
    missingZ.forEach((id, i) => ((objects[id] as { z: string }).z = keys[i]!))
  }
  const board: Board = { version: 1, objects }
  if (isRecord(data.meta)) board.meta = data.meta as Board['meta']
  return board
}

export function stringifyBoard(board: Board): string {
  return JSON.stringify(board, null, 2)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
