import { defineComponent, h, type PropType, type VNode } from 'vue'
import type { SvgNode } from '../render'

function toVNode(node: SvgNode | string): VNode | string {
  if (typeof node === 'string') return node
  return h(node.tag, node.attrs ?? {}, (node.children ?? []).map(toVNode))
}

/** Renders the core renderer's SVG tree (inside an `<svg>`). */
export default defineComponent({
  name: 'BoardSvgTree',
  props: { node: { type: Object as PropType<SvgNode>, required: true } },
  setup(props) {
    return () => toVNode(props.node)
  },
})
