<script setup lang="ts">
/** A read-only board: pan, zoom, minimap and export. */
import type { Board } from '../model/types'
import type { BoardLabels } from './labels'
import BoardEditor from './BoardEditor.vue'

defineProps<{ board?: Board | string | null; locale?: string; labels?: Partial<BoardLabels>; minimap?: boolean }>()
</script>

<template>
  <BoardEditor
    :model-value="board ?? null"
    readonly
    :locale="locale"
    :labels="labels"
    :minimap="minimap ?? false"
  />
</template>
