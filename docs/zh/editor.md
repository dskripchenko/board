# 编辑器

```vue
<BoardEditor v-model="board" :locale="'en'" style="height: 720px" @change="onChange" />
```

## Props

| Prop | 类型 | 默认值 | |
|---|---|---|---|
| `modelValue` | `Board \| string \| null` | `null` | 白板，可为对象或 JSON 文本。 |
| `readonly` | `boolean` | `false` | 查看模式：平移、缩放、小地图、导出。 |
| `locale` | `string` | 页面的 `lang` | `ru` 或 `en`。 |
| `labels` | `Partial<BoardLabels>` | — | 替换任意界面文本。 |
| `minimap` | `boolean` | `true` | 启动时显示小地图。 |
| `provider` | `BoardProvider \| null` | `null` | 实时协作（[协作](collaboration.md)）。 |
| `user` | `{ id?, name?, color? }` | — | 编辑者：显示给其他人。 |

## 事件

| 事件 | 载荷 | |
|---|---|---|
| `update:modelValue` | `Board` | 每次变更后。 |
| `change` | `{ board, ops, origin }` | 已应用的操作；`origin` 为 `local`、`undo`、`redo` 或 `remote`。 |
| `selection` | `string[]` | 选中的 id。 |

## 对外暴露

通过模板 ref：`fit()`、`select(ids)`、`zoomTo(k)`、`toPng(scale?)`
（一个 `Blob`）、`toSvg()`（`{ svg, width, height }`）、`applyRemote(ops)`、
`doc`（`BoardDoc`）、`sync()`（`SyncClient`，设置了 provider 时）。

## 工具

| 工具 | 快捷键 | |
|---|---|---|
| 选择 | V | 单击、Shift 单击、拖出选框。 |
| 抓手 | H，或按住 Space | 平移。 |
| 便签 | N | 单击放置；立即输入。在空白处双击也会创建便签。 |
| 形状 | S | 单击得到默认大小，或拖动；再次单击该工具可选择八种形状。 |
| 文本 | T | 单击并输入：标题、小标题或正文。 |
| 框架 | F | 单击或拖动。放入框架的对象会随框架移动。 |
| 连接线 | L | 从一个对象（或任意位置）拖到另一个对象；端点附着到对象上。 |
| Emoji | E | 选择一个，然后单击放置。 |
| 钢笔 | P | 绘制；再次单击该工具可选择颜色和粗细。 |
| 马克笔 | M | 宽而半透明的笔迹。 |
| 橡皮擦 | X | 删除接触到的笔迹（整条笔迹）。 |

## 编辑

- **移动**：拖动；边缘和中心会吸附到附近的对象（按住 Alt 可自由移动）。
  方向键每次移动 1，配合 Shift 移动 10。
- **调整大小**：使用控制柄（Shift 保持比例）；**旋转**：使用上方的圆形
  控制柄（Shift 以 15° 为步长吸附）。组会作为整体缩放。
- **文本：** 双击或 Enter。Escape 或 Ctrl/⌘ + Enter 结束编辑。
- **连接线：** 拖动端点控制柄以重新附着。
- **选区上方的工具栏：** 颜色、形状种类、填充和线条、文本样式、连接线路由
  和箭头、笔迹颜色和粗细、对齐与分布（多个对象）、用框架包裹选区、置于顶层、
  置于底层、复制、锁定、删除。

## 键盘

| 按键 | |
|---|---|
| Ctrl/⌘ + Z, Ctrl/⌘ + Shift + Z（或 Y） | 撤销、重做 |
| Ctrl/⌘ + A, D | 全选、复制 |
| Ctrl/⌘ + C, X, V | 复制、剪切、粘贴（纯文本会变成便签） |
| Ctrl/⌘ + ], [ | 置于顶层、置于底层 |
| Delete, Backspace | 删除 |
| Ctrl/⌘ + =, − ; Ctrl/⌘ + 滚轮或双指捏合 | 缩放 |
| 滚轮或双指滚动 | 平移 |
| Shift + 1 | 适应屏幕 |
| Escape | 清除选区，返回选择工具 |

## 导出

下载按钮（右下角）可保存 PNG（2×）、SVG 或白板的 JSON——导出选区，未选中
任何内容时导出整个白板。导出使用与屏幕相同的渲染器。

## 主题

编辑器使用组件库的 token 以及以下变量，均可在 `.bd-root` 上覆盖：
`--bd-text`、`--bd-stroke`、`--bd-shape-fill`、`--bd-surface`、
`--bd-frame-fill`、`--bd-frame-stroke`、`--bd-frame-title`、`--bd-connector`、
`--bd-accent`、`--bd-canvas`、`--bd-dot`。对象上的显式颜色（便签的颜色、
形状的填充）在深色主题中保持不变；其上的文本会在深色与白色之间切换以保证
对比度。

## 性能

只绘制视野内的对象，且对象的渲染结果会被缓存，直到对象发生变化。一个包含
5 000 个对象的白板约 0.3 秒即可打开，并以 60 fps 平移。限制：每个白板
10 000 个对象；笔迹超过 2 000 个点时拆分。
