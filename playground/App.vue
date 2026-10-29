<script setup lang="ts">
import { ref } from 'vue'
import type { Board } from '../src'
import BoardEditor from '../src/vue/BoardEditor.vue'
import '../src/vue/board.css'
import { sample } from './sample'

const params = new URLSearchParams(location.search)
function stress(n: number): Board {
  const objects: Board['objects'] = {}
  const colors = ['yellow', 'orange', 'pink', 'violet', 'blue', 'cyan', 'green', 'gray'] as const
  const cols = Math.ceil(Math.sqrt(n))
  for (let i = 0; i < n; i++) {
    const id = `o${i}`
    const x = (i % cols) * 240
    const y = Math.floor(i / cols) * 240
    const z = `a${String(i).padStart(5, '0')}`
    objects[id] = i % 3 === 0
      ? { id, type: 'shape', kind: 'rounded', x, y, w: 200, h: 120, z, text: `Шаг ${i}` }
      : { id, type: 'sticky', color: colors[i % 8]!, x, y, w: 200, h: 200, z, text: `Идея номер ${i}` }
  }
  return { version: 1, objects }
}
const board = ref<Board>(params.has('stress') ? stress(Number(params.get('stress')) || 5000) : params.has('empty') ? { version: 1, objects: {} } : sample)
const changes = ref(0)
</script>

<template>
  <div style="height: 100%; display: flex; flex-direction: column">
    <div style="padding: 6px 12px; font-size: 13px; border-bottom: 1px solid var(--uid-color-border)">
      @dskripchenko/board · объектов: {{ Object.keys(board.objects).length }} · изменений: {{ changes }}
    </div>
    <div style="flex: 1; min-height: 0">
      <BoardEditor
        v-model="board"
        :readonly="params.has('readonly')"
        @change="changes++"
      />
    </div>
  </div>
</template>
