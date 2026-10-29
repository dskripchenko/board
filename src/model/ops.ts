import type { Board, BoardObject } from './types'

/**
 * One change to one object. These are both the undo/redo unit and what the
 * sync protocol sends. In `set`, a `null` value removes the property.
 */
export type Op =
  | { k: 'create'; id: string; obj: BoardObject }
  | { k: 'set'; id: string; props: Record<string, unknown> }
  | { k: 'delete'; id: string }
  /** Board settings (`meta`): title, lock… `id` is always META. */
  | { k: 'meta'; id: typeof META; props: Record<string, unknown> }

export const META = '$meta' as const

const IMMUTABLE = new Set(['id', 'type'])

/**
 * Applies operations and returns the new board (the input is not changed)
 * and the operations that undo them, in the order to apply them.
 * Operations on missing objects are skipped, so replays are harmless.
 */
export function applyOps(board: Board, ops: readonly Op[]): { board: Board; inverse: Op[] } {
  const objects = { ...board.objects }
  let meta = board.meta
  const inverse: Op[] = []
  for (const op of ops) {
    if (op.k === 'meta') {
      const before: Record<string, unknown> = {}
      const next: Record<string, unknown> = { ...(meta ?? {}) }
      let changed = false
      for (const [key, value] of Object.entries(op.props)) {
        const prev = next[key]
        if (sameValue(prev, value === null ? undefined : value)) continue
        before[key] = prev === undefined ? null : prev
        if (value === null || value === undefined) delete next[key]
        else next[key] = value
        changed = true
      }
      if (!changed) continue
      meta = Object.keys(next).length ? (next as Board['meta']) : undefined
      inverse.push({ k: 'meta', id: META, props: before })
      continue
    }
    const current = objects[op.id]
    if (op.k === 'create') {
      if (current) continue
      objects[op.id] = { ...op.obj, id: op.id }
      inverse.push({ k: 'delete', id: op.id })
    } else if (op.k === 'delete') {
      if (!current) continue
      delete objects[op.id]
      inverse.push({ k: 'create', id: op.id, obj: current })
    } else {
      if (!current) continue
      const next: Record<string, unknown> = { ...current }
      const before: Record<string, unknown> = {}
      let changed = false
      for (const [key, value] of Object.entries(op.props)) {
        if (IMMUTABLE.has(key)) continue
        const prev = (current as unknown as Record<string, unknown>)[key]
        if (sameValue(prev, value === null ? undefined : value)) continue
        before[key] = prev === undefined ? null : prev
        if (value === null || value === undefined) delete next[key]
        else next[key] = value
        changed = true
      }
      if (!changed) continue
      objects[op.id] = next as unknown as BoardObject
      inverse.push({ k: 'set', id: op.id, props: before })
    }
  }
  inverse.reverse()
  const next: Board = { ...board, objects }
  if (meta) next.meta = meta
  else delete next.meta
  return { board: next, inverse }
}

/** Whether a board is locked for editing. */
export function isLocked(board: Board): boolean {
  return board.meta?.locked === true
}

/** The operation that locks (or unlocks) a board. */
export function lockOp(locked: boolean, by?: string): Op {
  return { k: 'meta', id: META, props: locked ? { locked: true, lockedBy: by ?? null } : { locked: null, lockedBy: null } }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}
