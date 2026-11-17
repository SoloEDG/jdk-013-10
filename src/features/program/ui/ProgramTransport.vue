<script setup lang="ts">
import { computed } from "vue";
import { Play, Pause } from "lucide-vue-next";
import { timecode } from "../../../shared/format";
import type { Program } from "../model/program";

const props = defineProps<{
  program: Program;
  sourceChapterId: string;
  sourceTime: number;
}>();

const entry = computed(() => props.program.currentEntry.value);
const inClip = computed(() => entry.value?.item.kind === "clip");

function onSeek(e: Event) {
  props.program.seek(Number((e.target as HTMLInputElement).value));
}
</script>

<template>
  <div class="program-transport">
    <div class="timeline-labels">
      <span>编单连续时间轴（停顿不计入时长）</span>
      <span>
        {{ timecode(program.time.value) }} / {{ timecode(program.total.value) }}
      </span>
    </div>
    <input
      aria-label="编单放映进度"
      type="range"
      min="0"
      :max="program.total.value || 0"
      step="0.1"
      :value="program.time.value"
      @input="onSeek"
    />
    <div class="controls">
      <button :aria-label="program.playing.value ? '暂停' : '播放'" @click="program.toggle()">
        <Pause v-if="program.playing.value" /><Play v-else />
      </button>
      <span class="time">
        放映 {{ timecode(program.time.value) }}
        <template v-if="inClip">
          <em>｜</em>
          原片位置
          {{ sourceChapterId }} {{ timecode(sourceTime) }}
        </template>
      </span>
      <span class="spacer" />
      <small v-if="program.parkedStop.value" class="stop-hint">
        已到停顿点，可组织讨论或完成访谈后继续
      </small>
    </div>
    <p v-if="program.notice.value" class="program-notice" role="status">
      {{ program.notice.value }}
    </p>
  </div>
</template>
