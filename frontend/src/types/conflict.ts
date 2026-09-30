/** 冲突候选值：某一方在某时刻写入的字段值 */
export interface FieldCandidate {
  value: unknown;
  /** 该值的写入时间（ms 时间戳） */
  updatedAt: number;
  /** 来源标记，如「本页」「另一方」 */
  source?: string;
}

/** 单字段冲突：双方改成了不同的值，两个值都保留 */
export interface FieldConflict {
  /** 字段键名 */
  field: string;
  /** 字段显示名 */
  label: string;
  /** 分歧前的共同基线值 */
  baseValue: unknown;
  /** 竞争候选值（通常 2 个），各自带修改时间 */
  candidates: FieldCandidate[];
}

export type ConflictStatus = 'pending' | 'resolved';

/** 记录级冲突：同一条记录上若干字段的冲突集合 */
export interface RecordConflict {
  id: string;
  /** 冲突所在的表 */
  table: 'samples' | 'finds' | 'sections' | 'analysis';
  /** 冲突记录的 id */
  recordId: string;
  /** 记录显示名（如样本编号），便于在列表里辨认 */
  recordLabel: string;
  status: ConflictStatus;
  fields: FieldConflict[];
  createdAt: number;
  updatedAt: number;
}
