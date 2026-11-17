import { computed, ref } from "vue";
import { chapters } from "../../../shared/content";
import type {
  ClipItem,
  DiscussStop,
  InterviewStop,
  ProgramDocument,
  ProgramItem,
  TimelineEntry,
} from "./types";
import {
  buildTimeline,
  entryAt,
  hasBlocking,
  repairClip,
  totalDuration,
} from "../lib/timeline";
import { loadProgram, persistProgram } from "../lib/storage";
import { newItemId, sampleProgram } from "../lib/seed";

/** 引擎通过驱动接口操作原片播放器，避免与 chapters 模块产生循环依赖 */
export interface ProgramDriver {
  /** 载入某章节并定位到源片时间，playing 决定是否立即播放 */
  loadClip: (chapterId: string, sourceTime: number, playing: boolean) => void;
  pause: () => void;
  resume: () => void;
}

interface ExploreReturn {
  index: number;
  sourceTime: number;
  playing: boolean;
}

export function createProgram(driver: ProgramDriver, onStop?: (e: TimelineEntry) => void) {
  const doc = ref<ProgramDocument>(loadProgram() ?? sampleProgram());
  const draft = ref<ProgramDocument | null>(null);
  const active = ref(false);
  const currentIndex = ref<number | null>(null);
  const time = ref(0);
  const playing = ref(false);
  /** 用户手动暂停（与「到达停顿点自动暂停」区分，避免 timeupdate 把状态冲掉） */
  const manualPause = ref(false);
  const notice = ref("");
  const storageError = ref("");
  let exploreReturn: ExploreReturn | null = null;

  const entries = computed<TimelineEntry[]>(() => buildTimeline(doc.value));
  const draftEntries = computed<TimelineEntry[]>(() =>
    draft.value ? buildTimeline(draft.value) : [],
  );
  const total = computed(() => totalDuration(entries.value));
  const currentEntry = computed(() =>
    currentIndex.value === null ? undefined : entries.value[currentIndex.value],
  );
  const parkedStop = computed(
    () =>
      currentEntry.value?.item.kind === "stop" &&
      !playing.value &&
      manualPause.value &&
      currentEntry.value,
  );
  const blockingCount = computed(
    () =>
      draftEntries.value.filter((e) => hasBlocking(e.issues)).length +
      (draft.value ? 0 : entries.value.filter((e) => hasBlocking(e.issues)).length),
  );

  function flash(message: string) {
    notice.value = message;
  }

  function isPlayable(e: TimelineEntry | undefined): e is TimelineEntry & { item: ClipItem } {
    return !!e && e.item.kind === "clip" && !hasBlocking(e.issues);
  }

  function applyEntry(e: TimelineEntry, shouldPlay: boolean) {
    if (e.item.kind === "clip") {
      currentIndex.value = e.index;
      time.value = e.start;
      playing.value = shouldPlay;
      manualPause.value = !shouldPlay;
      driver.loadClip(e.item.chapterId, e.item.sourceStart, shouldPlay);
      return true;
    }
    return false;
  }

  /** 从给定序号起找到下一个可放映片段；途中遇到停顿点则停下并通知 */
  function advance(fromIndex: number): boolean {
    for (let i = fromIndex; i < entries.value.length; i++) {
      const e = entries.value[i]!;
      if (e.item.kind === "clip") {
        if (hasBlocking(e.issues)) {
          flash(`片段「${e.item.title}」无效，已跳过，请在编辑器中修正`);
          continue;
        }
        return applyEntry(e, true);
      }
      // 停顿点：不占连续时长，停在这里等待讨论 / 访谈结束
      currentIndex.value = e.index;
      time.value = e.start;
      playing.value = false;
      manualPause.value = true;
      driver.pause();
      onStop?.(e);
      return false;
    }
    // 没有后续条目：放映结束
    currentIndex.value = entries.value.length - 1;
    time.value = total.value;
    playing.value = false;
    manualPause.value = true;
    driver.pause();
    flash("本场编单放映结束");
    return false;
  }

  /** 源片 timeupdate 回调：把源片时间换算成编单连续时间 */
  function syncSourceTime(sourceTime: number) {
    if (!active.value || !currentEntry.value) return;
    const e = currentEntry.value;
    if (e.item.kind !== "clip" || hasBlocking(e.issues)) return;
    const local = sourceTime - e.item.sourceStart;
    const programTime = e.start + Math.min(Math.max(local, 0), e.duration);
    time.value = programTime;
    if (programTime >= e.end - 0.05) advance(e.index + 1);
  }

  function sourceEnded() {
    if (!active.value || !currentEntry.value) return;
    advance(currentEntry.value.index + 1);
  }

  function play() {
    if (!active.value || !entries.value.length) return;
    if (parkedStop.value) {
      continueAfterStop();
      return;
    }
    if (currentEntry.value && isPlayable(currentEntry.value)) {
      manualPause.value = false;
      playing.value = true;
      driver.resume();
      return;
    }
    advance(0);
  }

  function pause() {
    if (!playing.value) return;
    playing.value = false;
    manualPause.value = true;
    driver.pause();
  }

  function toggle() {
    playing.value ? pause() : play();
  }

  function seek(programTime: number) {
    const target = entryAt(entries.value, programTime);
    if (!target) return;
    if (target.item.kind === "stop") {
      currentIndex.value = target.index;
      time.value = target.start;
      playing.value = false;
      manualPause.value = true;
      driver.pause();
      onStop?.(target);
      return;
    }
    if (hasBlocking(target.issues)) {
      flash("该片段无效，无法定位，请先在编辑器修正");
      return;
    }
    const offset = Math.min(
      Math.max(programTime - target.start, 0),
      Math.max(target.duration - 0.05, 0),
    );
    currentIndex.value = target.index;
    time.value = target.start + offset;
    manualPause.value = false;
    driver.loadClip(target.item.chapterId, target.item.sourceStart + offset, playing.value);
  }

  function continueAfterStop() {
    if (currentIndex.value === null) return;
    advance(currentIndex.value + 1);
  }

  /** 观众在片段中临时点开热点 / 人物支线：记住编单位置并暂停 */
  function enterExploreBranch() {
    const e = currentEntry.value;
    if (!e || e.item.kind !== "clip") return;
    const sourceTime = e.item.sourceStart + (time.value - e.start);
    exploreReturn = { index: e.index, sourceTime, playing: playing.value };
    playing.value = false;
    driver.pause();
  }

  /** 支线结束：回到编单对应位置（不是原片开头），恢复原播放状态 */
  function leaveExploreBranch() {
    const point = exploreReturn;
    exploreReturn = null;
    const e = point ? entries.value[point.index] : currentEntry.value;
    if (!e || e.item.kind !== "clip" || hasBlocking(e.issues)) {
      pause();
      return;
    }
    currentIndex.value = e.index;
    time.value = e.start + Math.min(Math.max(point!.sourceTime - e.item.sourceStart, 0), e.duration);
    manualPause.value = !point!.playing;
    playing.value = point!.playing;
    driver.loadClip(e.item.chapterId, point!.sourceTime, point!.playing);
  }

  function activate() {
    active.value = true;
    currentIndex.value = null;
    time.value = 0;
    playing.value = false;
    manualPause.value = true;
    exploreReturn = null;
  }

  function deactivate() {
    active.value = false;
    playing.value = false;
    currentIndex.value = null;
    time.value = 0;
    exploreReturn = null;
  }

  /* ---------------- 编辑器：草稿与提交边界 ---------------- */

  function openEditor() {
    // doc 是响应式代理，structuredClone 在部分环境无法克隆代理；数据为纯 JSON，用 JSON 深拷贝
    draft.value = JSON.parse(JSON.stringify(doc.value)) as ProgramDocument;
  }
  function discardDraft() {
    draft.value = null;
  }
  function bump() {
    if (draft.value) draft.value = { ...draft.value };
  }

  function updateMeta(field: "title" | "description", value: string) {
    if (!draft.value) return;
    draft.value[field] = value;
    bump();
  }

  function addClip(chapterId: string) {
    if (!draft.value) return;
    const chapter = chapters.find((c) => c.id === chapterId);
    const item: ClipItem = {
      id: newItemId(),
      kind: "clip",
      title: `片段 · ${chapter?.title ?? chapterId}`,
      chapterId,
      sourceStart: 0,
      sourceEnd: chapter ? Math.min(8, chapter.duration) : 1,
      note: "",
    };
    draft.value.items.push(item);
    bump();
  }

  function addDiscuss() {
    if (!draft.value) return;
    const item: DiscussStop = {
      id: newItemId(),
      kind: "stop",
      stop: "discuss",
      title: "新的讨论停顿",
      note: "",
    };
    draft.value.items.push(item);
    bump();
  }

  function addInterview(personId: string) {
    if (!draft.value) return;
    const item: InterviewStop = {
      id: newItemId(),
      kind: "stop",
      stop: "interview",
      title: "人物访谈停顿",
      personId,
      note: "",
    };
    draft.value.items.push(item);
    bump();
  }

  function updateItem(id: string, patch: Partial<ProgramItem>) {
    if (!draft.value) return;
    draft.value.items = draft.value.items.map((it) =>
      it.id === id ? ({ ...it, ...patch } as ProgramItem) : it,
    );
    bump();
  }

  function move(id: string, dir: -1 | 1) {
    if (!draft.value) return;
    const items = [...draft.value.items];
    const i = items.findIndex((it) => it.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j]!, items[i]!];
    draft.value.items = items;
    bump();
  }

  function remove(id: string) {
    if (!draft.value) return;
    draft.value.items = draft.value.items.filter((it) => it.id !== id);
    bump();
  }

  function duplicate(id: string) {
    if (!draft.value) return;
    const items = [...draft.value.items];
    const i = items.findIndex((it) => it.id === id);
    if (i < 0) return;
    const copy = { ...items[i]!, id: newItemId() } as ProgramItem;
    items.splice(i + 1, 0, copy);
    draft.value.items = items;
    bump();
  }

  function repair(id: string) {
    if (!draft.value) return;
    draft.value.items = draft.value.items.map((it) =>
      it.id === id && it.kind === "clip" ? repairClip(it) : it,
    );
    bump();
  }

  /** 提交草稿：存在错误级问题时拒绝；提交时若正在放映，尽量保持当前镜头不跳变 */
  function commit(): boolean {
    if (!draft.value) return false;
    const preview = buildTimeline(draft.value);
    if (preview.some((e) => hasBlocking(e.issues))) {
      flash("仍有无效片段，请先修正或删除后再提交");
      return false;
    }
    // 捕获正在放映的镜头，提交后在新时间轴上恢复，避免播放中的片段突然换内容
    let resume: ExploreReturn | null = null;
    const activeNow = currentEntry.value;
    if (active.value && activeNow && activeNow.item.kind === "clip") {
      const item = activeNow.item;
      resume = {
        index: activeNow.index,
        sourceTime: item.sourceStart + (time.value - activeNow.start),
        playing: playing.value,
      };
    }
    const next: ProgramDocument = {
      ...draft.value,
      updatedAt: Date.now(),
    };
    if (!persistProgram(next)) {
      storageError.value = "本地空间不足，编单未保存，请先导出文件";
      return false;
    }
    storageError.value = "";
    doc.value = next;
    draft.value = null;

    if (active.value && resume) {
      const remapped = entries.value[resume.index];
      if (remapped && isPlayable(remapped)) {
        const src = Math.min(
          Math.max(resume.sourceTime, remapped.item.sourceStart),
          remapped.item.sourceEnd,
        );
        currentIndex.value = remapped.index;
        time.value = remapped.start + (src - remapped.item.sourceStart);
        playing.value = resume.playing;
        manualPause.value = !resume.playing;
        driver.loadClip(remapped.item.chapterId, src, resume.playing);
        flash("编单已更新，并保持在当前镜头");
      } else {
        pause();
        currentIndex.value = null;
        flash("编单已更新，原位置条目已变化，放映已暂停");
      }
    }
    return true;
  }

  function replaceDocument(next: ProgramDocument) {
    doc.value = { ...next, updatedAt: Date.now() };
    persistProgram(doc.value);
    draft.value = null;
    if (active.value) {
      pause();
      currentIndex.value = null;
      time.value = 0;
    }
  }

  return {
    // 状态
    doc,
    draft,
    active,
    currentIndex,
    time,
    playing,
    manualPause,
    notice,
    storageError,
    // 派生
    entries,
    draftEntries,
    total,
    currentEntry,
    parkedStop,
    blockingCount,
    // 放映
    play,
    pause,
    toggle,
    seek,
    syncSourceTime,
    sourceEnded,
    continueAfterStop,
    enterExploreBranch,
    leaveExploreBranch,
    activate,
    deactivate,
    // 编辑
    openEditor,
    discardDraft,
    updateMeta,
    addClip,
    addDiscuss,
    addInterview,
    updateItem,
    move,
    remove,
    duplicate,
    repair,
    commit,
    replaceDocument,
    flash,
  };
}

export type Program = ReturnType<typeof createProgram>;
