<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Plus,
  Clapperboard,
  MessagesSquare,
  UserRound,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Eye,
} from "lucide-vue-next";
import { chapters, people } from "../../../shared/content";
import { timecode } from "../../../shared/format";
import { hasBlocking } from "../lib/timeline";
import type { ClipItem, ProgramItem } from "../model/types";
import type { Program } from "../model/program";

const props = defineProps<{ program: Program }>();
const emit = defineEmits<{ close: [] }>();

const addChapter = ref(chapters[0]!.id);
const addPerson = ref(people[0]!.id);
const showPreview = ref(true);

const source = computed(() => props.program.draft.value ?? props.program.doc.value);
const entries = computed(() =>
  props.program.draft.value
    ? props.program.draftEntries.value
    : props.program.entries.value,
);
const isDrafting = computed(() => !!props.program.draft.value);
const draftErrors = computed(
  () => props.program.draftEntries.value.filter((e) => hasBlocking(e.issues)).length,
);
const total = computed(() => entries.value.reduce((s, e) => s + e.duration, 0));
const stopCount = computed(
  () => source.value.items.filter((i) => i.kind === "stop").length,
);

function chapterTitle(id: string) {
  return chapters.find((c) => c.id === id)?.title ?? `缺失章节：${id}`;
}
function personName(id: string) {
  return people.find((p) => p.id === id)?.name ?? `缺失人物：${id}`;
}
function itemIcon(item: ProgramItem) {
  if (item.kind === "clip") return Clapperboard;
  return item.stop === "interview" ? UserRound : MessagesSquare;
}
function num(e: Event) {
  return Number((e.target as HTMLInputElement).value);
}
</script>

<template>
  <section class="builder">
    <header class="builder-head">
      <div>
        <small>THEME PROGRAM BUILDER</small>
        <h2>校园放映主题编单</h2>
        <p>只引用原片片段，不修改原片；停顿不占放映时长。</p>
      </div>
      <div class="builder-actions">
        <button class="text-button" @click="showPreview = !showPreview">
          <Eye :size="15" /> {{ showPreview ? "隐藏" : "显示" }}连续时间预览
        </button>
        <button v-if="!isDrafting" class="primary" @click="program.openEditor()">
          开始编辑
        </button>
        <button v-else class="text-button" @click="program.discardDraft(); emit('close')">
          放弃草稿
        </button>
        <button
          v-if="isDrafting"
          class="primary"
          :disabled="draftErrors > 0"
          @click="program.commit() && emit('close')"
        >
          提交编单{{ draftErrors ? `（${draftErrors} 个无效片段）` : "" }}
        </button>
        <button class="text-button" @click="emit('close')">返回</button>
      </div>
    </header>

    <div v-if="isDrafting" class="meta-row">
      <label>
        编单标题
        <input
          :value="source.title"
          @input="program.updateMeta('title', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label>
        说明
        <input
          :value="source.description"
          @input="
            program.updateMeta('description', ($event.target as HTMLInputElement).value)
          "
        />
      </label>
    </div>

    <div class="builder-body">
      <div class="builder-list">
        <p v-if="!source.items.length" class="builder-empty">
          编单还是空的，从右侧添加片段或停顿。
        </p>

        <article
          v-for="e in entries"
          :key="e.item.id"
          class="builder-item"
          :class="{ blocking: hasBlocking(e.issues), stop: e.item.kind === 'stop' }"
        >
          <div class="builder-item-head">
            <component :is="itemIcon(e.item)" :size="15" />
            <strong>#{{ e.index + 1 }} {{ e.item.title || "未命名条目" }}</strong>
            <span class="chip">
              <template v-if="e.item.kind === 'clip'">
                片段 {{ timecode(e.duration) }}
              </template>
              <template v-else>停顿 · 不计时长</template>
            </span>
            <span v-if="hasBlocking(e.issues)" class="chip chip-error">
              <AlertTriangle :size="12" /> 无效
            </span>
            <span class="spacer" />
            <span class="seg-time">{{ timecode(e.start) }} 起</span>
          </div>

          <!-- 无效原因与修正 -->
          <ul v-if="e.issues.length" class="issue-list">
            <li v-for="(iss, k) in e.issues" :key="k" :class="iss.severity">
              <AlertTriangle :size="12" /> {{ iss.message }}
            </li>
          </ul>

          <div class="builder-fields" :class="{ readonly: !isDrafting }">
            <label class="full">
              字幕标题
              <input
                :value="e.item.title"
                :disabled="!isDrafting"
                @input="program.updateItem(e.item.id, { title: ($event.target as HTMLInputElement).value })"
              />
            </label>

            <template v-if="e.item.kind === 'clip'">
              <label>
                引用章节（原片不修改）
                <select
                  :value="e.item.chapterId"
                  :disabled="!isDrafting"
                  @change="program.updateItem(e.item.id, { chapterId: ($event.target as HTMLSelectElement).value } as Partial<ClipItem>)"
                >
                  <option v-for="c in chapters" :key="c.id" :value="c.id">
                    {{ c.title }}（{{ timecode(c.duration) }}）
                  </option>
                </select>
              </label>
              <label>
                入点（秒）
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  :value="e.item.sourceStart"
                  :disabled="!isDrafting"
                  @input="
                    program.updateItem(e.item.id, { sourceStart: num($event) } as Partial<ClipItem>)
                  "
                />
              </label>
              <label>
                出点（秒）
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  :value="e.item.sourceEnd"
                  :disabled="!isDrafting"
                  @input="
                    program.updateItem(e.item.id, { sourceEnd: num($event) } as Partial<ClipItem>)
                  "
                />
              </label>
              <p class="field-hint">当前取「{{ chapterTitle(e.item.chapterId) }}」
                {{ timecode(e.item.sourceStart) }}–{{ timecode(e.item.sourceEnd) }}</p>
            </template>

            <template v-else-if="e.item.stop === 'interview'">
              <label class="full">
                讲述者
                <select
                  :value="e.item.personId"
                  :disabled="!isDrafting"
                  @change="
                    program.updateItem(e.item.id, {
                      personId: ($event.target as HTMLSelectElement).value,
                    } as Partial<ProgramItem>)
                  "
                >
                  <option v-for="p in people" :key="p.id" :value="p.id">
                    {{ p.name }} · {{ p.role }}
                  </option>
                </select>
              </label>
              <p class="field-hint">访谈对象：{{ personName(e.item.personId) }}</p>
            </template>

            <label class="full">
              字幕 / 主持提示
              <textarea
                rows="2"
                :value="e.item.note"
                :disabled="!isDrafting"
                @input="program.updateItem(e.item.id, { note: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
          </div>

          <div v-if="isDrafting" class="builder-item-actions">
            <button @click="program.move(e.item.id, -1)"><ArrowUp :size="14" /> 上移</button>
            <button @click="program.move(e.item.id, 1)"><ArrowDown :size="14" /> 下移</button>
            <button @click="program.duplicate(e.item.id)"><Copy :size="14" /> 复制（可改镜头）</button>
            <button
              v-if="e.item.kind === 'clip' && hasBlocking(e.issues)"
              class="repair-btn"
              @click="program.repair(e.item.id)"
            >
              <Wrench :size="14" /> 一键修正到章节边界
            </button>
            <button class="danger" @click="program.remove(e.item.id)">
              <Trash2 :size="14" /> 删除
            </button>
          </div>
        </article>
      </div>

      <aside class="builder-side">
        <div class="side-card">
          <h3>添加条目</h3>
          <label>
            章节片段
            <select v-model="addChapter">
              <option v-for="c in chapters" :key="c.id" :value="c.id">{{ c.title }}</option>
            </select>
          </label>
          <button class="primary" :disabled="!isDrafting" @click="program.addClip(addChapter)">
            <Plus :size="14" /> 加入片段
          </button>
          <button class="text-button" :disabled="!isDrafting" @click="program.addDiscuss()">
            <MessagesSquare :size="14" /> 加入讨论停顿
          </button>
          <label>
            访谈人物
            <select v-model="addPerson">
              <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <button
            class="text-button"
            :disabled="!isDrafting"
            @click="program.addInterview(addPerson)"
          >
            <UserRound :size="14" /> 加入访谈停顿
          </button>
          <p v-if="!isDrafting" class="side-hint">点击「开始编辑」创建草稿后即可增删条目。</p>
        </div>

        <div v-if="showPreview" class="side-card">
          <h3>连续放映时间预览</h3>
          <p class="side-hint">
            总时长 <b>{{ timecode(total) }}</b> · 停顿 {{ stopCount }} 处（不计入）
          </p>
          <ol class="preview-list">
            <li v-for="e in entries" :key="e.item.id" :class="{ invalid: hasBlocking(e.issues) }">
              <span>{{ timecode(e.start) }}</span>
              <component :is="itemIcon(e.item)" :size="12" />
              <em>{{ e.item.title || "未命名" }}</em>
              <CheckCircle2 v-if="!hasBlocking(e.issues)" :size="13" class="ok" />
              <AlertTriangle v-else :size="13" class="warn" />
            </li>
          </ol>
          <p class="side-hint">
            调整前段长度后，后续停顿与字幕的放映时间会整体跟随移动；已收藏手记只记原片位置，不受影响。
          </p>
        </div>
      </aside>
    </div>
  </section>
</template>
