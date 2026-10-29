/** The board document: a flat map of objects, versioned. */
export interface Board {
  version: 1
  objects: Record<string, BoardObject>
  meta?: BoardMeta
}

export interface BoardMeta {
  title?: string
  background?: 'dots' | 'grid' | 'none'
}

export type ObjectType = 'shape' | 'sticky' | 'text' | 'frame' | 'connector' | 'emoji'

interface Base {
  id: string
  type: ObjectType
  /** World coordinates of the top-left corner (before rotation). */
  x: number
  y: number
  w: number
  h: number
  /** Degrees, clockwise, around the centre. */
  rotation?: number
  /** Fractional index: the stacking order, compared as strings. */
  z: string
  /** The frame this object belongs to: it moves with the frame. */
  parent?: string
  locked?: boolean
}

export type ShapeKind = 'rect' | 'rounded' | 'ellipse' | 'diamond' | 'triangle' | 'parallelogram' | 'hexagon' | 'star'
export type StrokeStyle = 'solid' | 'dashed'
export type TextAlign = 'left' | 'center' | 'right'

export interface ShapeObject extends Base {
  type: 'shape'
  kind: ShapeKind
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeStyle?: StrokeStyle
  text?: string
  textAlign?: TextAlign
  fontSize?: number
}

export const STICKY_COLORS = ['yellow', 'orange', 'pink', 'violet', 'blue', 'cyan', 'green', 'gray'] as const
export type StickyColor = (typeof STICKY_COLORS)[number]

export interface StickyObject extends Base {
  type: 'sticky'
  color: StickyColor
  text?: string
  /** A size in px, or `auto` (fit the text to the sticky). */
  fontSize?: number | 'auto'
}

export type TextVariant = 'title' | 'h2' | 'body'

export interface TextObject extends Base {
  type: 'text'
  text: string
  variant: TextVariant
  color?: string
  align?: TextAlign
}

export interface FrameObject extends Base {
  type: 'frame'
  title?: string
  fill?: string
}

export type Side = 'top' | 'right' | 'bottom' | 'left'
/** A connector end: attached to an object (optionally to one of its sides), or a free point. */
export type ConnectorEnd = { id: string; side?: Side } | { x: number; y: number }
export type ConnectorRoute = 'straight' | 'elbow' | 'curve'
export type Arrow = 'none' | 'arrow' | 'triangle' | 'circle'

export interface ConnectorObject extends Base {
  type: 'connector'
  from: ConnectorEnd
  to: ConnectorEnd
  route: ConnectorRoute
  startArrow?: Arrow
  endArrow?: Arrow
  label?: string
  stroke?: string
  strokeWidth?: number
  strokeStyle?: StrokeStyle
}

export interface EmojiObject extends Base {
  type: 'emoji'
  /** One grapheme. */
  char: string
}

export type BoardObject = ShapeObject | StickyObject | TextObject | FrameObject | ConnectorObject | EmojiObject

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
