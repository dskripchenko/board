<script setup lang="ts">
import { ref } from 'vue'
import type { Board } from '../src'
import BoardEditor from '../src/vue/BoardEditor.vue'
import '../src/vue/board.css'
import { sample } from './sample'

const params = new URLSearchParams(location.search)
const board = ref<Board>(params.has('empty') ? { version: 1, objects: {} } : sample)
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
