<script setup lang="ts">
import { ref } from 'vue'
import { MemoryHub, type Board } from '../src'
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
const collab = params.has('collab')
const hub = collab ? new MemoryHub({ board: sample, seq: 0 }, () => 60 + Math.random() * 60) : null
const users = [{ name: 'Анна', color: '#ec4899' }, { name: 'Борис', color: '#3b82f6' }]
</script>

<template>
  <div style="height: 100%; display: flex; flex-direction: column">
    <div style="padding: 6px 12px; font-size: 13px; border-bottom: 1px solid var(--uid-color-border)">
      @dskripchenko/board · объектов: {{ Object.keys(board.objects).length }} · изменений: {{ changes }}
    </div>
    <div
      v-if="hub"
      style="flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 2px; background: var(--uid-color-border)"
    >
      <div
        v-for="u in users"
        :key="u.name"
        style="display: flex; flex-direction: column; min-height: 0; background: var(--uid-color-bg)"
      >
        <div :style="{ padding: '4px 12px', fontSize: '13px', fontWeight: 600, color: '#fff', background: u.color }">
          {{ u.name }} — эта панель
        </div>
        <BoardEditor
          :provider="hub.provider()"
          :user="u"
          :class="`collab-${u.name}`"
          :minimap="false"
          style="flex: 1; min-height: 0"
        />
      </div>
    </div>
    <div
      v-else
      style="flex: 1; min-height: 0"
    >
      <BoardEditor
        v-model="board"
        :readonly="params.has('readonly')"
        @change="changes++"
      />
    </div>
  </div>
</template>
