// 临时验证脚本：用 esbuild 把 TS 打包到临时目录后运行（不写入 src）
import { build } from "esbuild";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, ".verify-tmp");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const entry = resolve(outDir, "entry.ts");
writeFileSync(entry, `
import { buildTimeline, validateItem, entryAt, totalDuration, clipDuration, repairClip } from "${resolve(here, "../src/features/program/lib/timeline.ts").replaceAll("\\\\", "/")}";
import { parseProgram, toProgramFile } from "${resolve(here, "../src/features/program/lib/serialize.ts").replaceAll("\\\\", "/")}";
import { sampleProgram, newItemId } from "${resolve(here, "../src/features/program/lib/seed.ts").replaceAll("\\\\", "/")}";
import type { ProgramDocument, ClipItem } from "${resolve(here, "../src/features/program/model/types.ts").replaceAll("\\\\", "/")}";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log("PASS", name); }
  else { fail++; console.log("FAIL", name, detail); }
}
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// 1. 示例编单：时间轴连续、停顿不计时长
const doc = sampleProgram();
let entries = buildTimeline(doc);
check("示例编单全部条目有效", entries.every(e => !e.issues.some(i => i.severity === "error")));
// 片段时长：10 + 10 + 8 + 18 = 46；两个讨论 + 一个访谈停顿均为 0
check("总时长仅累加片段=46s", approx(totalDuration(entries), 46), "got " + totalDuration(entries));
check("停顿条目不占时长", entries.filter(e => e.item.kind === "stop").every(e => e.duration === 0 && e.end === e.start));

// 2. 同一章节重复使用、不同镜头区间
const craftClips = entries.filter(e => e.item.kind === "clip" && (e.item as ClipItem).chapterId === "craft");
check("craft 章节被引用两次", craftClips.length === 2);
check("两次引用镜头区间不同",
  (craftClips[0]!.item as ClipItem).sourceStart !== (craftClips[1]!.item as ClipItem).sourceStart);

// 3. 调整前段长度，后续停顿与字幕放映时间整体移动；原片源位置不变
const beforeSecondStop = entries[2]!.start; // 第二个片段的起点
const first = doc.items[0] as ClipItem;
const savedOriginalStart = first.sourceStart;
first.sourceEnd = 14; // 前段从 10s 拉长到 14s
entries = buildTimeline(doc);
check("后续条目放映时间随前段+4s移动", approx(entries[2]!.start, beforeSecondStop + 4), "got " + entries[2]!.start);
check("原片入点不随编单调整而改变", (doc.items[0] as ClipItem).sourceStart === savedOriginalStart);

// 4. 无效片段：出点<=入点、越界、缺失章节
const badDoc: ProgramDocument = { id: "x", title: "t", description: "", updatedAt: 0, items: [
  { id: newItemId(), kind: "clip", title: "零时长", chapterId: "dawn", sourceStart: 5, sourceEnd: 5, note: "" },
  { id: newItemId(), kind: "clip", title: "越界", chapterId: "dawn", sourceStart: 0, sourceEnd: 999, note: "" },
  { id: newItemId(), kind: "clip", title: "缺章", chapterId: "ghost", sourceStart: 0, sourceEnd: 4, note: "" },
  { id: newItemId(), kind: "stop", stop: "interview", title: "缺人", personId: "nobody", note: "" },
]};
const bad = buildTimeline(badDoc);
check("零时长被标错误", bad[0]!.issues.some(i => i.code === "empty-clip"));
check("越界被标错误", bad[1]!.issues.some(i => i.code === "out-of-range"));
check("缺失章节被标错误", bad[2]!.issues.some(i => i.code === "missing-chapter"));
check("缺失人物被标错误", bad[3]!.issues.some(i => i.code === "missing-person"));
check("无效片段时长按0处理不产生负时长", bad.every(e => e.duration >= 0));

// 5. 一键修正把片段拉回章节边界
const repaired = repairClip(bad[1]!.item as ClipItem);
check("修正后无越界错误", !validateItem(repaired).some(i => i.severity === "error"));
check("修正后时长为正", clipDuration(repaired) > 0);

// 6. entryAt 定位
entries = buildTimeline(sampleProgram());
const t = entries[1]!.start + 2; // 落在停顿之后的片段内部（停顿与下一片段起点相同）
check("entryAt 命中包含该时刻的片段", entryAt(entries, t)!.index === entries[2]!.index, "got " + entryAt(entries, t)!.index);
check("entryAt 精确命中停顿点", entryAt(entries, entries[1]!.start)!.index === 1);
check("entryAt 末尾时间不越界", entryAt(entries, totalDuration(entries)) !== undefined);

// 7. 导出/导入往返：顺序一致
const good = sampleProgram();
const file = toProgramFile(good, buildTimeline(good));
const round = parseProgram(JSON.parse(JSON.stringify(file)));
check("导入后条目数一致", round.doc.items.length === good.items.length);
check("导入后顺序与 id 一致", round.doc.items.every((it, i) => it.id === good.items[i]!.id));
check("清单标记素材均可用", file.manifest.chapters.every(c => c.present) && file.manifest.people.every(p => p.present));

// 8. 另一台设备缺素材：保留条目、标记缺失、可预测处理
const foreign = parseProgram({
  format: "shoreline-program", version: 1,
  document: { id: "f", title: "外来编单", description: "", updatedAt: 0, items: [
    { id: "a", kind: "clip", title: "本地缺失章节", chapterId: "missing-ch", sourceStart: 0, sourceEnd: 5, note: "" },
    { id: "b", kind: "stop", stop: "discuss", title: "讨论", note: "" },
    { id: "c", kind: "stop", stop: "interview", title: "访谈", personId: "missing-pp", note: "" },
    { kind: "unknown-garbage" },
  ]},
});
check("缺失素材被报告", foreign.missing.length === 2, "got " + foreign.missing.length);
const foreignTimeline = buildTimeline(foreign.doc);
check("缺失条目保留并标红", foreignTimeline[0]!.issues.some(i => i.code === "missing-chapter"));
check("无法识别条目被剔除、顺序保持", foreign.doc.items.map(i => i.id).join(",") === "a,b,c");
check("可识别条目仍构成相同顺序", foreign.doc.items[1]!.id === "b");

// 9. 宽松解析：坏数据不崩溃
const junk = parseProgram(null);
check("空输入安全降级为空编单", junk.doc.items.length === 0);

console.log("\\n结果: " + pass + " 通过, " + fail + " 失败");
if (fail) process.exit(1);
`);

await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: resolve(outDir, "out.mjs"),
  logLevel: "silent",
});

await import(resolve(outDir, "out.mjs"));
rmSync(outDir, { recursive: true, force: true });
