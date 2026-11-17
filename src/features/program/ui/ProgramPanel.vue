<script setup lang="ts">
import { ref } from "vue";
import {
  Download,
  Upload,
  Pencil,
  Play,
  AlertTriangle,
  Clapperboard,
  MessagesSquare,
  UserRound,
} from "lucide-vue-next";
import { timecode } from "../../../shared/format";
import { downloadProgram, parseProgram } from "../lib/serialize";
import { hasBlocking } from "../lib/timeline";
import type { Program } from "../model/program";

const props = defineProps<{ program: Program }>();
const emit = defineEmits<{ edit: []; present: [] }>();

const fileInput = ref<HTMLInputElement>();
const importReport = ref<{ missing: number; repaired: number; title: string } | null>(null);

function iconOf(kind: string, stop?: string) {
  if (kind === "clip") return Clapperboard;
  return stop === "interview" ? UserRound : MessagesSquare;
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const report = parseProgram(raw);
    props.program.replaceDocument(report.doc);
    importReport.value = {
      missing: report.missing.length,
      repaired: report.repaired,
      title: report.doc.title,
    };
  } catch {
    props.program.flash("文件无法识别，请选择 .shoreline-program.json 编单文件");
  } finally {
    if (fileInput.value) fileInput.value.value = "";
  }
}
</script>

<template>
  <section class="program-panel">
    <div class="panel-heading">
      <div>
        <small>SCHOOL SCREENING PROGRAM</small>
        <h2>{{ program.doc.value.title }}</h2>
        <p class="program-desc">{{ program.doc.value.description }}</p>
      </div>
      <div class="program-head-actions">
        <button class="text-button" @click="emit('edit')">
          <Pencil :size="15" /> 编辑编单
        </button>
        <button class="text-button" @click="downloadProgram(program.doc.value, program.entries.value)">
          <Download :size="15" /> 导出编单
        </button>
        <button class="text-button" @click="fileInput?.click()">
          <Upload :size="15" /> 导入编单
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          hidden
          @change="onFile"
        />
      </div>
    </div>

    <div v-if="importReport" class="import-report" :class="{ warn: importReport.missing > 0 }">
      <AlertTriangle v-if="importReport.missing" :size="15" />
      <span>
        已载入「{{ importReport.title }}」：
        <template v-if="importReport.missing">
          {{ importReport.missing }} 处素材在本机缺失，相关条目已标红保留，可在编辑器中重新指定；
        </template>
        <template v-else>所有素材均可用；</template>
        <template v-if="importReport.repaired">自动整理了 {{ importReport.repaired }} 个重复条目。</template>
        顺序与时间均按文件原样恢复。
      </span>
    </div>

    <div class="program-stats">
      <span><b>{{ program.entries.value.length }}</b> 个条目</span>
      <span><b>{{ timecode(program.total.value) }}</b> 连续放映时长</span>
      <span
        ><b>{{ program.entries.value.filter((e) => e.item.kind === "stop").length }}</b>
        处停顿（不计入）</span
      >
      <span
        v-if="program.blockingCount.value"
        class="stat-error"
        ><AlertTriangle :size="14" /> {{ program.blockingCount.value }} 个无效片段待修正</span
      >
    </div>

    <ol class="program-overview">
      <li
        v-for="e in program.entries.value"
        :key="e.item.id"
        :class="{ invalid: hasBlocking(e.issues), stop: e.item.kind === 'stop' }"
      >
        <component :is="iconOf(e.item.kind, 'stop' in e.item ? e.item.stop : undefined)" :size="14" />
        <span class="ov-time">{{ timecode(e.start) }}</span>
        <em>{{ e.item.title }}</em>
        <small v-if="e.item.kind === 'clip'">
          {{ timecode(e.item.sourceStart) }}–{{ timecode(e.item.sourceEnd) }} ·
          {{ timecode(e.duration) }}
        </small>
        <small v-else>停顿点</small>
        <b v-if="hasBlocking(e.issues)" class="ov-error">无效 · 可修正</b>
      </li>
    </ol>

    <div class="present-row">
      <button class="primary present-btn" @click="emit('present')">
        <Play :size="16" /> 开始按编单放映
      </button>
      <p class="side-hint">
        放映中可在停顿点讨论；观众点开热点属于临时支线，结束后回到编单当前位置。
      </p>
    </div>
    <p v-if="program.storageError.value" role="alert" class="program-notice">
      {{ program.storageError.value }}
    </p>
  </section>
</template>
