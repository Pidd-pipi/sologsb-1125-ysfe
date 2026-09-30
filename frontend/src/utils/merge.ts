import type { FieldConflict } from '../types/conflict';
import type { FindRecord, CoordinateSource, FindEnvironment } from '../types/find';
import { COORDINATE_SOURCE_LABELS, FIND_ENVIRONMENT_LABELS } from '../types/find';
import type { MeteoriteSample, SampleCategory, ChemicalGroup, WeatheringGrade, FallOrFind, StorageLocation } from '../types/sample';
import {
  CATEGORY_LABELS,
  CHEMICAL_GROUP_LABELS,
  FALL_OR_FIND_LABELS,
  STORAGE_LABELS,
  WEATHERING_LABELS,
} from '../types/sample';

/** 样本字段显示名（用于冲突展示） */
export const SAMPLE_FIELD_LABELS: Record<string, string> = {
  sampleNo: '样本编号',
  totalWeight: '总重量',
  category: '分类',
  chemicalGroup: '化学群',
  weathering: '风化等级',
  fallOrFind: '发现 / 坠落',
  storage: '存放位置',
  note: '备注',
};

/** 发现地字段显示名（用于冲突展示） */
export const FIND_FIELD_LABELS: Record<string, string> = {
  placeName: '发现地名',
  region: '国家 / 地区',
  longitude: '经度',
  latitude: '纬度',
  coordinateSource: '坐标来源',
  environment: '发现环境',
  finder: '发现者',
};

/** 深比较：支持原始值、数组与普通对象 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return a === b;
  }
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr || bIsArr) {
    if (!aIsArr || !bIsArr || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export interface MergeResult<T> {
  /** 可安全写入的字段（本页改动且库中未被另一方改过） */
  merged: Partial<T>;
  /** 冲突字段（双方都改了且不一致），保留双方值与时间戳 */
  conflicts: FieldConflict[];
}

/**
 * 三向字段合并：
 * @param base    页面打开 / 开始编辑时的快照
 * @param current  从数据库读到的最新值
 * @param incoming 页面本次提交的新值（只含本页实际改动的字段）
 * @param fieldLabels 字段键名 → 显示名
 * @param now     本次写入时间戳
 * @param currentUpdatedAt 库中当前值的修改时间（用于候选值展示）
 *
 * 规则（逐字段）：
 *  - 本页新值与库当前值一致 → 无需写入
 *  - 库当前值相对基线未变 → 应用本页值（无冲突）
 *  - 库当前值也被另一方改过、且与本页值不同 → 记为冲突，双方值都保留
 */
export function threeWayMerge<T extends Record<string, unknown>>(
  base: T,
  current: T,
  incoming: Partial<T>,
  fieldLabels: Record<string, string>,
  now: number,
  currentUpdatedAt?: number,
): MergeResult<T> {
  const merged: Partial<T> = {};
  const conflicts: FieldConflict[] = [];

  for (const key of Object.keys(incoming) as (keyof T)[]) {
    const inc = incoming[key];
    const cur = current[key];
    const bas = base[key];

    if (deepEqual(inc, cur)) continue;
    if (deepEqual(cur, bas)) {
      merged[key] = inc;
    } else {
      conflicts.push({
        field: String(key),
        label: fieldLabels[String(key)] ?? String(key),
        baseValue: bas,
        candidates: [
          { value: inc, updatedAt: now, source: '本页' },
          { value: cur, updatedAt: currentUpdatedAt ?? now, source: '另一方' },
        ],
      });
    }
  }

  return { merged, conflicts };
}

/** 从样本对象中抽取可编辑字段（用于生成基线快照与 diff） */
export function sampleEditableFields(s: MeteoriteSample): Record<string, unknown> {
  return {
    sampleNo: s.sampleNo,
    totalWeight: s.totalWeight,
    category: s.category,
    chemicalGroup: s.chemicalGroup,
    weathering: s.weathering,
    fallOrFind: s.fallOrFind,
    storage: s.storage,
    note: s.note ?? '',
  };
}

/** 从发现记录中抽取可编辑字段 */
export function findEditableFields(f: FindRecord): Record<string, unknown> {
  return {
    placeName: f.placeName,
    region: f.region,
    longitude: f.longitude,
    latitude: f.latitude,
    coordinateSource: f.coordinateSource,
    environment: f.environment,
    finder: f.finder,
  };
}

/** 计算两个可编辑字段对象之间的差异（只返回发生变化的字段） */
export function diffFields(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (!deepEqual(base[key], next[key])) out[key] = next[key];
  }
  return out;
}

/** 通用标量格式化（用于冲突候选值展示） */
export function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string') return value === '' ? '（空）' : value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** 按字段把候选值转成可读文本（枚举字段映射为中文标签） */
export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  switch (field) {
    case 'category':
      return CATEGORY_LABELS[value as SampleCategory] ?? formatScalar(value);
    case 'chemicalGroup':
      return CHEMICAL_GROUP_LABELS[value as ChemicalGroup] ?? formatScalar(value);
    case 'weathering':
      return WEATHERING_LABELS[value as WeatheringGrade] ?? formatScalar(value);
    case 'fallOrFind':
      return FALL_OR_FIND_LABELS[value as FallOrFind] ?? formatScalar(value);
    case 'storage':
      return STORAGE_LABELS[value as StorageLocation] ?? formatScalar(value);
    case 'coordinateSource':
      return COORDINATE_SOURCE_LABELS[value as CoordinateSource] ?? formatScalar(value);
    case 'environment':
      return FIND_ENVIRONMENT_LABELS[value as FindEnvironment] ?? formatScalar(value);
    case 'totalWeight':
      return `${formatScalar(value)} g`;
    case 'longitude':
    case 'latitude':
      return `${formatScalar(value)}°`;
    default:
      return formatScalar(value);
  }
}
