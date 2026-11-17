import type { ProgramDocument, ProgramItem } from "../model/types";

let seq = 0;
export function newItemId(): string {
  seq += 1;
  return `pg-${Date.now().toString(36)}-${seq}`;
}

export function makeClip(partial: Omit<ProgramItem & { kind: "clip" }, "id">): ProgramItem {
  return { id: newItemId(), ...partial };
}

/** 校园放映示例编单：同一章节被两次引用、取不同镜头区间 */
export function sampleProgram(): ProgramDocument {
  const items: ProgramItem[] = [
    {
      id: newItemId(),
      kind: "clip",
      title: "序章 · 码头的清晨",
      chapterId: "dawn",
      sourceStart: 0,
      sourceEnd: 10,
      note: "字幕：天还没亮，第一艘船靠岸了",
    },
    {
      id: newItemId(),
      kind: "stop",
      stop: "discuss",
      title: "讨论：你所在的城镇，清晨是什么声音？",
      note: "建议停顿 3 分钟，邀请同学分享",
    },
    {
      id: newItemId(),
      kind: "clip",
      title: "匠人的手 · 第一段",
      chapterId: "craft",
      sourceStart: 2,
      sourceEnd: 12,
      note: "字幕：每一块木头都有自己的脾气",
    },
    {
      id: newItemId(),
      kind: "stop",
      stop: "interview",
      title: "访谈：造船人林有木",
      personId: "lin",
      note: "听完口述再回到编单",
    },
    {
      id: newItemId(),
      kind: "clip",
      title: "再看作坊 · 工具的刻度",
      chapterId: "craft",
      sourceStart: 12,
      sourceEnd: 20,
      note: "字幕：工具磨损的位置，记得每一双手",
    },
    {
      id: newItemId(),
      kind: "clip",
      title: "灯塔与归航",
      chapterId: "night",
      sourceStart: 4,
      sourceEnd: 22,
      note: "字幕：岸上的一束光，是海上的一个家",
    },
    {
      id: newItemId(),
      kind: "stop",
      stop: "discuss",
      title: "讨论：谁在为你的生活「守灯」？",
      note: "放映结束前的集体讨论",
    },
  ];
  return {
    id: crypto.randomUUID(),
    title: "校园放映 · 守望与归来",
    description: "面向中学放映的主题编单，穿插讨论与人物访谈，约 9 分钟。",
    updatedAt: Date.now(),
    items,
  };
}
