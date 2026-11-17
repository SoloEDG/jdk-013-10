import { chapters, people } from "../../../shared/content";
import { clamp } from "../../../shared/format";
import type {
  ClipItem,
  ItemIssue,
  MissingRef,
  ProgramDocument,
  ProgramItem,
  TimelineEntry,
} from "../model/types";

const chapterById = (id: string) => chapters.find((c) => c.id === id);
const personById = (id: string) => people.find((p) => p.id === id);

/** 单条目校验。片段时长非正为错误（无法放映）；越界自动给出修正建议。 */
export function validateItem(item: ProgramItem): ItemIssue[] {
  const issues: ItemIssue[] = [];
  if (!item.title.trim())
    issues.push({ severity: "warning", code: "no-title", message: "缺少字幕标题" });

  if (item.kind === "clip") {
    const chapter = chapterById(item.chapterId);
    if (!chapter) {
      issues.push({
        severity: "error",
        code: "missing-chapter",
        message: `引用的章节已缺失（${item.chapterId}），请重新选择素材`,
      });
      return issues;
    }
    if (!Number.isFinite(item.sourceStart) || !Number.isFinite(item.sourceEnd)) {
      issues.push({ severity: "error", code: "bad-time", message: "时间点无效" });
      return issues;
    }
    if (item.sourceEnd <= item.sourceStart) {
      issues.push({
        severity: "error",
        code: "empty-clip",
        message: "片段时长为 0，出点必须晚于入点",
      });
    }
    if (item.sourceStart < 0 || item.sourceEnd > chapter.duration) {
      issues.push({
        severity: "error",
        code: "out-of-range",
        message: `超出本章范围（0–${chapter.duration} 秒），可一键修正到边界内`,
      });
    }
  } else if (item.stop === "interview") {
    if (!personById(item.personId)) {
      issues.push({
        severity: "error",
        code: "missing-person",
        message: `讲述者已缺失（${item.personId}），请重新指定人物`,
      });
    }
  }
  return issues;
}

export function hasBlocking(issues: ItemIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** 片段在源片中的有效时长（受章节边界约束） */
export function clipDuration(item: ClipItem): number {
  const chapter = chapterById(item.chapterId);
  if (!chapter || !Number.isFinite(item.sourceStart) || !Number.isFinite(item.sourceEnd))
    return 0;
  const start = clamp(item.sourceStart, 0, chapter.duration);
  const end = clamp(item.sourceEnd, 0, chapter.duration);
  return Math.max(0, end - start);
}

/**
 * 构造连续放映时间轴。
 * 片段按顺序拼接，讨论/访谈停顿本身不计入连续时长；
 * 后续条目的 start/end 完全由前面的条目推导，
 * 因此调整前段长度后，后面的停顿与字幕位置自动随之移动。
 */
export function buildTimeline(doc: Pick<ProgramDocument, "items">): TimelineEntry[] {
  let cursor = 0;
  return doc.items.map((item, index) => {
    const issues = validateItem(item);
    const duration = item.kind === "clip" ? clipDuration(item) : 0;
    const start = cursor;
    const end = cursor + duration;
    cursor = end;
    return { item, index, start, end, duration, issues };
  });
}

export function totalDuration(entries: TimelineEntry[]): number {
  return entries.reduce((sum, e) => sum + e.duration, 0);
}

/** 找到连续放映时间 t 所在条目；优先返回包含 t 的片段，停顿仅在精确时刻命中 */
export function entryAt(entries: TimelineEntry[], t: number): TimelineEntry | undefined {
  const time = Math.max(0, t);
  let boundary: TimelineEntry | undefined;
  for (const e of entries) {
    if (time > e.start && time < e.end) return e;
    // 仅记录起点精确命中的条目（含零长度停顿），在没有包含区间时才使用
    if (time === e.start && boundary === undefined) boundary = e;
  }
  if (boundary) return boundary;
  return entries[entries.length - 1];
}

/** 收集缺失素材引用，用于导入时给出可预见的缺失处理 */
export function findMissingRefs(items: ProgramItem[]): MissingRef[] {
  const refs: MissingRef[] = [];
  for (const item of items) {
    if (item.kind === "clip" && !chapterById(item.chapterId)) {
      refs.push({ itemId: item.id, itemTitle: item.title, kind: "chapter", ref: item.chapterId });
    }
    if (item.kind === "stop" && item.stop === "interview" && !personById(item.personId)) {
      refs.push({ itemId: item.id, itemTitle: item.title, kind: "person", ref: item.personId });
    }
  }
  return refs;
}

/** 将片段时间点修正到章节边界内（保留可修正语义，不静默丢数据） */
export function repairClip(item: ClipItem): ClipItem {
  const chapter = chapterById(item.chapterId);
  if (!chapter) return item;
  const start = clamp(item.sourceStart, 0, chapter.duration);
  let end = clamp(item.sourceEnd, 0, chapter.duration);
  if (end <= start) end = Math.min(chapter.duration, start + 1);
  return { ...item, sourceStart: start, sourceEnd: end };
}
