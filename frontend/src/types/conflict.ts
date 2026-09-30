import {
  CATEGORY_LABELS,
  CHEMICAL_GROUP_LABELS,
  FALL_OR_FIND_LABELS,
  STORAGE_LABELS,
  WEATHERING_LABELS,
} from './sample';
import { COORDINATE_SOURCE_LABELS, FIND_ENVIRONMENT_LABELS } from './find';
import { formatWeight } from '../utils/format';

/** 可并发编辑、需要按字段合并的实体类型 */
export type ConflictEntityType = 'sample' | 'find';

/** 保存来源页面：另一处已落库、但当前页面无法确知来源时标记为 other */
export type ConflictSource = 'detail' | 'analysis' | 'new' | 'other';

export type ConflictStatus = 'pending' | 'resolved';

/** 冲突字段的一方候选值：值 + 该值的修改时间 */
export interface ConflictCandidate {
  value: unknown;
  /** 该方保存时，字段的修改时间 */
  updatedAt: number;
  /** 提交动作发生时间（与 updatedAt 同一时刻，用于同值候选去重） */
  savedAt: number;
  source: ConflictSource;
}

/**
 * 字段冲突记录：同一实体同一字段被两处并发改成不同值。
 * 未裁决时实体字段按 candidates 中修改时间最晚者兜底生效，
 * 双方值与时间始终保留，裁决后写入 chosenValue。
 */
export interface FieldConflict {
  id: string;
  entityType: ConflictEntityType;
  entityId: string;
  /** 冗余样本 id：find 冲突取其所属样本，便于按样本聚合展示 */
  sampleId: string;
  field: string;
  /** 双方共同的基准值（编辑开始时的值） */
  baseValue: unknown;
  candidates: ConflictCandidate[];
  status: ConflictStatus;
  /** 当前生效值（未裁决前=修改时间最晚的候选） */
  activeValue: unknown;
  /** 编目员最终选定值 */
  chosenValue?: unknown;
  resolvedAt?: number;
  createdAt: number;
}

export const CONFLICT_ENTITY_LABELS: Record<ConflictEntityType, string> = {
  sample: '样本信息',
  find: '发现地',
};

export const CONFLICT_SOURCE_LABELS: Record<ConflictSource, string> = {
  detail: '样本详情页',
  analysis: '分析检测页',
  new: '样本登记页',
  other: '另一处保存',
};

/** 样本可编辑字段（其余字段不参与字段级合并） */
export const SAMPLE_EDIT_FIELDS = [
  'sampleNo',
  'totalWeight',
  'category',
  'chemicalGroup',
  'weathering',
  'fallOrFind',
  'storage',
  'note',
] as const;

/** 发现地可编辑字段 */
export const FIND_EDIT_FIELDS = [
  'placeName',
  'region',
  'longitude',
  'latitude',
  'coordinateSource',
  'environment',
  'finder',
] as const;

const FIELD_LABELS: Record<ConflictEntityType, Record<string, string>> = {
  sample: {
    sampleNo: '样本编号',
    totalWeight: '总重量',
    category: '分类',
    chemicalGroup: '化学群',
    weathering: '风化等级',
    fallOrFind: '发现 / 坠落',
    storage: '存放位置',
    note: '备注',
  },
  find: {
    placeName: '发现地名',
    region: '国家 / 地区',
    longitude: '经度',
    latitude: '纬度',
    coordinateSource: '坐标来源',
    environment: '发现环境',
    finder: '发现者',
  },
};

export function fieldLabel(entityType: ConflictEntityType, field: string): string {
  return FIELD_LABELS[entityType][field] ?? field;
}

/** 冲突候选值的展示文本：枚举走中文标签，重量/坐标走统一格式化 */
export function formatConflictValue(
  entityType: ConflictEntityType,
  field: string,
  value: unknown,
): string {
  if (value === undefined || value === null || value === '') return '（空）';
  if (entityType === 'sample') {
    switch (field) {
      case 'category':
        return CATEGORY_LABELS[value as keyof typeof CATEGORY_LABELS] ?? String(value);
      case 'chemicalGroup':
        return CHEMICAL_GROUP_LABELS[value as keyof typeof CHEMICAL_GROUP_LABELS] ?? String(value);
      case 'weathering':
        return WEATHERING_LABELS[value as keyof typeof WEATHERING_LABELS] ?? String(value);
      case 'fallOrFind':
        return FALL_OR_FIND_LABELS[value as keyof typeof FALL_OR_FIND_LABELS] ?? String(value);
      case 'storage':
        return STORAGE_LABELS[value as keyof typeof STORAGE_LABELS] ?? String(value);
      case 'totalWeight':
        return formatWeight(Number(value));
      default:
        return String(value);
    }
  }
  switch (field) {
    case 'coordinateSource':
      return COORDINATE_SOURCE_LABELS[value as keyof typeof COORDINATE_SOURCE_LABELS] ?? String(value);
    case 'environment':
      return FIND_ENVIRONMENT_LABELS[value as keyof typeof FIND_ENVIRONMENT_LABELS] ?? String(value);
    case 'longitude':
      return `${Number(value).toFixed(2)}°`;
    case 'latitude':
      return `${Number(value).toFixed(2)}°`;
    default:
      return String(value);
  }
}
