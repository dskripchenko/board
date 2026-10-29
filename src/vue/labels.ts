export interface BoardLabels {
  pen: string; marker: string; eraser: string; width: string; you: string; lockBoard: string; unlockBoard: string; boardLocked: string
  select: string; hand: string; sticky: string; shape: string; text: string; frame: string; connector: string; emoji: string
  undo: string; redo: string; zoomIn: string; zoomOut: string; fit: string; minimap: string
  exportPng: string; exportSvg: string; exportJson: string; export: string
  front: string; back: string; duplicate: string; lock: string; unlock: string; delete: string; wrap: string
  align: string; alignLeft: string; alignCenterX: string; alignRight: string; alignTop: string; alignCenterY: string; alignBottom: string
  distributeX: string; distributeY: string
  title: string; h2: string; body: string; fill: string; stroke: string; dashed: string
  straight: string; elbow: string; curve: string; startArrow: string; endArrow: string
  frameTitle: string; emptyHint: string; locked: string
  shapes: Record<string, string>
}

const en: BoardLabels = {
  pen: 'Pen (P)', marker: 'Marker (M)', eraser: 'Eraser (X)', width: 'Width', you: 'you', lockBoard: 'Lock the board', unlockBoard: 'Unlock', boardLocked: 'The board is locked',
  select: 'Select (V)', hand: 'Hand (H)', sticky: 'Sticky note (N)', shape: 'Shape (S)', text: 'Text (T)', frame: 'Frame (F)', connector: 'Connector (L)', emoji: 'Emoji (E)',
  undo: 'Undo', redo: 'Redo', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit to screen', minimap: 'Minimap',
  exportPng: 'PNG image', exportSvg: 'SVG image', exportJson: 'Board JSON', export: 'Export',
  front: 'Bring to front', back: 'Send to back', duplicate: 'Duplicate', lock: 'Lock', unlock: 'Unlock', delete: 'Delete', wrap: 'Frame selection',
  align: 'Align', alignLeft: 'Align left', alignCenterX: 'Align centre', alignRight: 'Align right', alignTop: 'Align top', alignCenterY: 'Align middle', alignBottom: 'Align bottom',
  distributeX: 'Distribute horizontally', distributeY: 'Distribute vertically',
  title: 'Title', h2: 'Heading', body: 'Text', fill: 'Fill', stroke: 'Line', dashed: 'Dashed',
  straight: 'Straight', elbow: 'Elbow', curve: 'Curve', startArrow: 'Start arrow', endArrow: 'End arrow',
  frameTitle: 'Frame', emptyHint: 'Double-click to add a sticky note, or pick a tool on the left', locked: 'Locked',
  shapes: { rect: 'Rectangle', rounded: 'Rounded rectangle', ellipse: 'Ellipse', diamond: 'Diamond', triangle: 'Triangle', parallelogram: 'Parallelogram', hexagon: 'Hexagon', star: 'Star' },
}

const ru: BoardLabels = {
  pen: 'Карандаш (P)', marker: 'Маркер (M)', eraser: 'Ластик (X)', width: 'Толщина', you: 'вы', lockBoard: 'Заблокировать доску', unlockBoard: 'Разблокировать', boardLocked: 'Доска заблокирована',
  select: 'Выбор (V)', hand: 'Рука (H)', sticky: 'Стикер (N)', shape: 'Фигура (S)', text: 'Текст (T)', frame: 'Блок (F)', connector: 'Связь (L)', emoji: 'Эмодзи (E)',
  undo: 'Отменить', redo: 'Повторить', zoomIn: 'Приблизить', zoomOut: 'Отдалить', fit: 'Показать всё', minimap: 'Мини-карта',
  exportPng: 'Картинка PNG', exportSvg: 'Картинка SVG', exportJson: 'Доска в JSON', export: 'Экспорт',
  front: 'На передний план', back: 'На задний план', duplicate: 'Дублировать', lock: 'Закрепить', unlock: 'Открепить', delete: 'Удалить', wrap: 'Обернуть в блок',
  align: 'Выровнять', alignLeft: 'По левому краю', alignCenterX: 'По центру', alignRight: 'По правому краю', alignTop: 'По верху', alignCenterY: 'По середине', alignBottom: 'По низу',
  distributeX: 'Распределить по горизонтали', distributeY: 'Распределить по вертикали',
  title: 'Заголовок', h2: 'Подзаголовок', body: 'Текст', fill: 'Заливка', stroke: 'Линия', dashed: 'Пунктир',
  straight: 'Прямая', elbow: 'Ломаная', curve: 'Кривая', startArrow: 'Стрелка в начале', endArrow: 'Стрелка в конце',
  frameTitle: 'Блок', emptyHint: 'Двойной щелчок — новый стикер; инструменты — слева', locked: 'Закреплено',
  shapes: { rect: 'Прямоугольник', rounded: 'Скруглённый', ellipse: 'Эллипс', diamond: 'Ромб', triangle: 'Треугольник', parallelogram: 'Параллелограмм', hexagon: 'Шестиугольник', star: 'Звезда' },
}

export function resolveLabels(locale: string | undefined, overrides?: Partial<BoardLabels>): BoardLabels {
  const lang = (locale ?? (typeof document !== 'undefined' ? document.documentElement.lang : '') ?? '').toLowerCase()
  return { ...(lang.startsWith('ru') ? ru : en), ...overrides }
}

export const EMOJI = ['👍', '👎', '❤️', '🔥', '🎉', '✅', '❌', '⚠️', '❓', '💡', '⭐', '🚀', '👀', '🙌', '👏', '😀', '😂', '😍', '🤔', '😢', '😡', '😎', '🤝', '💪', '📌', '📎', '📅', '⏰', '💰', '🐛', '🔒', '🏁']
