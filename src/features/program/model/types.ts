/**
 * 主题编单数据模型。
 *
 * 编单只引用原片素材（章节 id、讲述者 id、源片时间区间），
 * 不持有、也不修改任何原片内容；同一片段可被多次引用并取不同镜头区间。
 */

/** 引用原片某章节的一段连续镜头 */
export interface ClipItem {
  id: string;
  kind: "clip";
  /** 编单内显示的字幕标题 */
  title: string;
  /** 指向原片章节，原片不会被复制或裁剪 */
  chapterId: string;
  /** 源片内入点（秒，含） */
  sourceStart: number;
  /** 源片内出点（秒，不含） */
  sourceEnd: number;
  /** 放映时随片段显示的字幕 */
  note: string;
}

/** 讨论停顿：不计时长的暂停点，供现场组织讨论 */
export interface DiscussStop {
  id: string;
  kind: "stop";
  stop: "discuss";
  title: string;
  note: string;
}

/** 人物访谈停顿：插入一段已有讲述者的口述支线 */
export interface InterviewStop {
  id: string;
  kind: "stop";
  stop: "interview";
  title: string;
  /** 指向人物资料，缺失时整条标记为无效，可重新指定 */
  personId: string;
  note: string;
}

export type ProgramItem = ClipItem | DiscussStop | InterviewStop;

export interface ProgramDocument {
  id: string;
  title: string;
  description: string;
  updatedAt: number;
  items: ProgramItem[];
}

export interface ItemIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

/** 编单时间线上的一个条目：放映时间轴位置完全由前面的条目推导 */
export interface TimelineEntry {
  item: ProgramItem;
  index: number;
  /** 在连续放映时间轴上的起点（秒） */
  start: number;
  /** 在连续放映时间轴上的终点（秒）；讨论停顿为 0 长度 */
  end: number;
  duration: number;
  issues: ItemIssue[];
}

/** 导入外部编单时发现的缺失素材引用（条目保留以便修正） */
export interface MissingRef {
  itemId: string;
  itemTitle: string;
  kind: "chapter" | "person";
  ref: string;
}
