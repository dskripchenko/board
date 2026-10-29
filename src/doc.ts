import type { Board } from './model/types'
import { applyOps, type Op } from './model/ops'
import { emptyBoard } from './model/parse'

interface Entry {
  undo: Op[]
  redo: Op[]
  /** Consecutive changes with the same key (a drag, typing) merge into one step. */
  key?: string
  at: number
}

export interface ApplyOptions {
  /** Merge with the previous step when it has the same key and is recent. */
  mergeKey?: string
  /** false: not undoable (remote changes, programmatic loads). */
  record?: boolean
}

export type Listener = (board: Board, ops: Op[], origin: 'local' | 'undo' | 'redo' | 'remote') => void

const MERGE_WINDOW = 1000
const LIMIT = 200

/**
 * The board being edited: applies operations, keeps undo/redo of local
 * changes and tells listeners. The sync engine plugs in through `onLocal`.
 */
export class BoardDoc {
  private past: Entry[] = []
  private future: Entry[] = []
  private listeners = new Set<Listener>()

  constructor(public board: Board = emptyBoard()) {}

  apply(ops: Op[], options: ApplyOptions = {}): Op[] {
    if (ops.length === 0) return []
    const { board, inverse } = applyOps(this.board, ops)
    if (inverse.length === 0) return []
    this.board = board
    if (options.record !== false) {
      const last = this.past[this.past.length - 1]
      const now = Date.now()
      if (options.mergeKey && last && last.key === options.mergeKey && now - last.at < MERGE_WINDOW) {
        last.undo = [...inverse, ...last.undo]
        last.redo = [...last.redo, ...ops]
        last.at = now
      } else {
        this.past.push({ undo: inverse, redo: ops, key: options.mergeKey, at: now })
        if (this.past.length > LIMIT) this.past.shift()
      }
      this.future = []
    }
    this.emit(ops, options.record === false ? 'remote' : 'local')
    return inverse
  }

  /**
   * The sync engine's view changed under us (remote batches rebased with our
   * pending ones): take the new board as is, keep the undo history.
   */
  replace(board: Board, ops: Op[]): void {
    this.board = board
    this.emit(ops, 'remote')
  }

  /** Remote changes: applied, not undoable. */
  applyRemote(ops: Op[]): void {
    const { board } = applyOps(this.board, ops)
    this.board = board
    this.emit(ops, 'remote')
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  undo(): Op[] {
    const entry = this.past.pop()
    if (!entry) return []
    const { board, inverse } = applyOps(this.board, entry.undo)
    this.board = board
    this.future.push({ undo: inverse, redo: entry.undo, at: Date.now() })
    this.emit(entry.undo, 'undo')
    return entry.undo
  }

  redo(): Op[] {
    const entry = this.future.pop()
    if (!entry) return []
    const { board, inverse } = applyOps(this.board, entry.undo)
    this.board = board
    this.past.push({ undo: inverse, redo: entry.undo, at: Date.now() })
    this.emit(entry.undo, 'redo')
    return entry.undo
  }

  /** Replaces the whole board (load); clears history. */
  load(board: Board): void {
    this.board = board
    this.past = []
    this.future = []
    this.emit([], 'remote')
  }

  /** Ends the current merge window (e.g. on pointer up), so the next change is a step of its own. */
  seal(): void {
    const last = this.past[this.past.length - 1]
    if (last) last.key = undefined
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(ops: Op[], origin: Parameters<Listener>[2]): void {
    for (const l of this.listeners) l(this.board, ops, origin)
  }
}
