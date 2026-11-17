<script setup lang="ts">
import { timecode } from "../../../shared/format";
import type { Program } from "../model/program";
defineProps<{ program: Program }>();
</script>

<template>
  <div class="program-caption" v-if="program.currentEntry.value">
    <template v-if="program.currentEntry.value.item.kind === 'clip'">
      <small>编单字幕 · 放映 {{ timecode(program.time.value) }}</small>
      <h3>{{ program.currentEntry.value.item.title }}</h3>
      <p v-if="program.currentEntry.value.item.note">
        {{ program.currentEntry.value.item.note }}
      </p>
    </template>
    <template v-else>
      <small>放映已暂停 · 停顿点</small>
      <h3>{{ program.currentEntry.value.item.title }}</h3>
      <p v-if="program.currentEntry.value.item.note">
        {{ program.currentEntry.value.item.note }}
      </p>
      <button class="primary continue-btn" @click="program.continueAfterStop()">
        继续放映（回到编单下一位置）
      </button>
    </template>
  </div>
</template>
