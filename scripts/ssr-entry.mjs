// 组件 SSR 冒烟测试入口（由 verify-components.mjs 经 vite ssrBuild 打包后运行）
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import { createProgram } from "../src/features/program/model/program";
import ProgramPanel from "../src/features/program/ui/ProgramPanel.vue";
import ProgramBuilder from "../src/features/program/ui/ProgramBuilder.vue";
import ProgramStrip from "../src/features/program/ui/ProgramStrip.vue";
import ProgramTransport from "../src/features/program/ui/ProgramTransport.vue";
import ProgramCaption from "../src/features/program/ui/ProgramCaption.vue";

let pass = 0,
  fail = 0;
const check = (n, c, d = "") =>
  c ? (pass++, console.log("PASS", n)) : (fail++, console.log("FAIL", n, d));

const driver = { loadClip() {}, pause() {}, resume() {} };
const program = createProgram(driver);
const render = (comp, props) =>
  renderToString(createSSRApp({ render: () => h(comp, props) }));

const html = await render(ProgramPanel, { program });
check("ProgramPanel 渲染编单标题", html.includes(program.doc.value.title));
check("ProgramPanel 渲染条目", html.includes("序章"));

const builderHtml = await render(ProgramBuilder, { program });
check("ProgramBuilder 渲染连续时间预览", builderHtml.includes("连续放映时间预览"));
check("ProgramBuilder 显示片段编辑字段", builderHtml.includes("引用章节"));

program.openEditor();
const draftHtml = await render(ProgramBuilder, { program });
check("草稿态渲染提交按钮", draftHtml.includes("提交编单"));
program.discardDraft();

program.activate();
program.play();
const stripHtml = await render(ProgramStrip, { program });
check("ProgramStrip 渲染放映条带", stripHtml.includes("主题编单放映"));
const transportHtml = await render(ProgramTransport, {
  program,
  sourceChapterId: "dawn",
  sourceTime: 0,
});
check(
  "ProgramTransport 同时显示编单时间与原片位置",
  transportHtml.includes("编单连续时间轴") && transportHtml.includes("原片位置"),
);

const stopIndex = program.entries.value.findIndex((e) => e.item.kind === "stop");
program.seek(program.entries.value[stopIndex].start);
const captionHtml = await render(ProgramCaption, { program });
check("停顿点字幕提供回到编单的继续按钮", captionHtml.includes("继续放映"));
check(
  "停顿点展示讨论/访谈标题",
  captionHtml.includes(program.entries.value[stopIndex].item.title),
);

/* ---------- 引擎行为：提交边界、草稿隔离、支线返回 ---------- */
const calls = [];
const recDriver = {
  loadClip: (c, t, p) => calls.push({ op: "load", c, t, p }),
  pause: () => calls.push({ op: "pause" }),
  resume: () => calls.push({ op: "resume" }),
};
const eng = createProgram(recDriver);

// 草稿编辑不影响已发布编单
const publishedTitle = eng.doc.value.title;
eng.openEditor();
eng.updateMeta("title", "草稿临时标题");
check("草稿修改不影响已发布编单", eng.doc.value.title === publishedTitle);
check("提交前存在独立草稿", eng.draft.value !== null);
eng.discardDraft();
check("放弃草稿后恢复", eng.draft.value === null && eng.doc.value.title === publishedTitle);

// 无效片段阻止提交
eng.openEditor();
const first = eng.draft.value.items[0];
eng.updateItem(first.id, { sourceStart: 20, sourceEnd: 10 });
check("含无效片段时提交被拒绝", eng.commit() === false);
check("被拒绝后草稿仍保留以便修正", eng.draft.value !== null);
eng.repair(first.id);
check("一键修正后片段恢复有效", !eng.draftEntries.value[0].issues.some((i) => i.severity === "error"));
check("修正后可以提交", eng.commit() === true);
check("提交后草稿清空", eng.draft.value === null);

// 放映 + 临时支线：返回编单对应位置而非原片开头
eng.activate();
eng.play(); // 进入第一个片段（dawn 0 起）
const clipEntry = eng.entries.value.find((e) => e.item.kind === "clip");
eng.seek(clipEntry.start + 3); // 编单连续时间 +3s
eng.enterExploreBranch();
check("进入支线时放映暂停", eng.playing.value === false);
const before = { idx: eng.currentIndex.value };
eng.leaveExploreBranch();
check("支线结束回到编单同一条目", eng.currentIndex.value === before.idx);
check("支线结束恢复到离开时的编单时间", Math.abs(eng.time.value - (clipEntry.start + 3)) < 1e-9);

// 自动推进：第一个片段播完后应载入下一片段或在停顿点暂停
{
  const e2 = createProgram(recDriver);
  e2.activate();
  e2.play();
  const firstClip = e2.entries.value.find((x) => x.item.kind === "clip");
  // 模拟源片播到该片段出点
  e2.syncSourceTime(firstClip.item.sourceEnd);
  const next = e2.currentEntry.value;
  check("片段播完自动推进到下一条目", next.index === firstClip.index + 1);
}

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
if (fail) process.exit(1);
