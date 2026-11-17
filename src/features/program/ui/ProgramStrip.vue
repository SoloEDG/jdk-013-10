<script setup lang="ts">
import { Clapperboard, PauseCircle, MessagesSquare, UserRound } from "lucide-vue-next";
import { timecode } from "../../../shared/format";
import { hasBlocking } from "../lib/timeline";
import type { Program } from "../model/program";

const props = defineProps<{ program: Program }>();
defineEmits<{ seek: [time: number] }>();

function icon(entry: (typeof props.program.entries.value)[number]) {
  if (entry.item.kind === "clip") return Clapperboard;
  return entry.item.stop === "interview" ? UserRound : MessagesSquare;
}
</script>

<template>
  <div class="program-strip">
    <div class="program-strip-head">
      <span class="pg-badge"><PauseCircle :size="13" /> 主题编单放映</span>
      <small>{{ program.doc.value.title }}</small>
    </div>
    <ol class="program-segments">
      <li
        v-for="e in program.entries.value"
        :key="e.item.id"
        :class="{
          active: program.currentIndex.value === e.index,
          invalid: e.item.kind === 'clip' && hasBlocking(e.issues),
          stop: e.item.kind === 'stop',
        }"
      >
        <button
          class="segment"
          :title="`${timecode(e.start)} 起 · ${e.item.title}`"
          @click="$emit('seek', e.start)"
        >
          <component :is="icon(e)" :size="12" />
          <span class="seg-time">{{ timecode(e.start) }}</span>
          <span class="seg-title">{{ e.item.title }}</span>
          <em v-if="e.item.kind === 'stop'">停顿</em>
          <em v-else-if="hasBlocking(e.issues)" class="seg-error">无效</em>
        </button>
      </li>
    </ol>
  </div>
</template>
