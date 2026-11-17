import { chapters, people } from "../../../shared/content";
import type {
  InterviewStop,
  ProgramDocument,
  ProgramItem,
  TimelineEntry,
} from "../model/types";
import { findMissingRefs } from "./timeline";

export const PROGRAM_FORMAT = 1;

export interface ManifestRef {
  id: string;
  present: boolean;
}
export interface ProgramManifest {
  chapters: ManifestRef[];
  people: ManifestRef[];
}
export interface ProgramFile {
  format: "shoreline-program";
  version: number;
  /** 素材清单：另一台设备打开前即可预见缺失素材 */
  manifest: ProgramManifest;
  document: ProgramDocument;
}
export interface ImportReport {
  doc: ProgramDocument;
  missing: ReturnType<typeof findMissingRefs>;
  repaired: number;
}

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** 宽松但可预测地解析外部编单：无法识别的条目剔除，缺失素材保留并标记 */
export function parseProgram(raw: unknown): ImportReport {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const source =
    obj.document && typeof obj.document === "object"
      ? (obj.document as Record<string, unknown>)
      : obj;
  const rawItems = Array.isArray(source.items) ? source.items : [];
  const items: ProgramItem[] = [];
  let repaired = 0;

  for (const r of rawItems) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id : `imported-${items.length + 1}`;
    const title = typeof rec.title === "string" ? rec.title : "未命名条目";
    const note = typeof rec.note === "string" ? rec.note : "";
    if (rec.kind === "clip") {
      items.push({
        id,
        kind: "clip",
        title,
        note,
        chapterId: typeof rec.chapterId === "string" ? rec.chapterId : "",
        sourceStart: isNum(rec.sourceStart) ? rec.sourceStart : 0,
        sourceEnd: isNum(rec.sourceEnd) ? rec.sourceEnd : 0,
      });
    } else if (rec.kind === "stop" && rec.stop === "discuss") {
      items.push({ id, kind: "stop", stop: "discuss", title, note });
    } else if (rec.kind === "stop" && rec.stop === "interview") {
      items.push({
        id,
        kind: "stop",
        stop: "interview",
        title,
        note,
        personId: typeof rec.personId === "string" ? rec.personId : "",
      });
    }
    // 无法识别的条目直接跳过，保证另一台设备拿到的顺序仍是可放映的序列
  }

  // 重复 id 去重，避免键冲突
  const seen = new Set<string>();
  const deduped = items.map((it) => {
    if (!seen.has(it.id)) {
      seen.add(it.id);
      return it;
    }
    repaired += 1;
    return { ...it, id: `${it.id}-dup-${repaired}` };
  });

  const doc: ProgramDocument = {
    id: typeof source.id === "string" ? source.id : crypto.randomUUID(),
    title: typeof source.title === "string" ? source.title : "导入的主题编单",
    description: typeof source.description === "string" ? source.description : "",
    updatedAt: isNum(source.updatedAt) ? source.updatedAt : Date.now(),
    items: deduped,
  };
  return { doc, missing: findMissingRefs(doc.items), repaired };
}

function buildManifest(doc: ProgramDocument): ProgramManifest {
  const chapterIds = [
    ...new Set(
      doc.items
        .filter((i): i is Extract<ProgramItem, { kind: "clip" }> => i.kind === "clip")
        .map((i) => i.chapterId),
    ),
  ];
  const personIds = [
    ...new Set(
      doc.items
        .filter((i): i is InterviewStop => i.kind === "stop" && i.stop === "interview")
        .map((i) => i.personId),
    ),
  ];
  return {
    chapters: chapterIds.map((id) => ({ id, present: chapters.some((c) => c.id === id) })),
    people: personIds.map((id) => ({ id, present: people.some((p) => p.id === id) })),
  };
}

export function toProgramFile(doc: ProgramDocument, _entries: TimelineEntry[]): ProgramFile {
  return {
    format: "shoreline-program",
    version: PROGRAM_FORMAT,
    manifest: buildManifest(doc),
    document: { ...doc, updatedAt: Date.now() },
  };
}

export function downloadProgram(doc: ProgramDocument, entries: TimelineEntry[]) {
  const payload = JSON.stringify(toProgramFile(doc, entries), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${doc.title || "主题编单"}.shoreline-program.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
