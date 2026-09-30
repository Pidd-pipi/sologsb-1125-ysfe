import type { ConflictCandidate, ConflictEntityType, ConflictSource } from '../types/conflict';

/** 参与字段级合并的实体必须带版本号与逐字段修改时间 */
export interface VersionedEntity {
  id: string;
  revision: number;
  fieldUpdatedAt: Record<string, number>;
  /** 最近一次提交的来源页面（冲突时作为先保存方的来源） */
  lastSource?: ConflictSource;
  [key: string]: unknown;
}

export interface FieldChange {
  field: string;
  /** 编辑开始时该字段的基准值 */
  baseValue: unknown;
  /** 本次提交的新值 */
  value: unknown;
}

/** 一处并发提交的单个字段冲突信息（双方值 + 各自修改时间 + 基准值） */
export interface FieldConflictEvent extends FieldChange {
  entityType: ConflictEntityType;
  /** 实体中已落库的另一方值 */
  otherValue: unknown;
  /** 已落库值的修改时间 */
  otherUpdatedAt: number;
  /** 已落库值的提交来源页面（未知时为 other） */
  otherSource: ConflictSource;
  /** 本次提交值的修改时间 */
  incomingUpdatedAt: number;
  /** 本次提交的来源页面 */
  source: ConflictSource;
  savedAt: number;
}

export interface MergeResult {
  /** 可直接写入实体的字段（含无冲突快进与冲突后按时间兜底生效的字段） */
  patch: Record<string, unknown>;
  /** 各字段合并后的最近修改时间 */
  fieldUpdatedAt: Record<string, number>;
  /** 新的版本号 */
  revision: number;
  /** 本次提交产生的字段冲突 */
  conflicts: FieldConflictEvent[];
  /** 没有任何字段真正发生变化 */
  noop: boolean;
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // 空字符串与 undefined 视作相同（表单清空 vs 未填）
  if ((a === '' || a === undefined || a === null) && (b === '' || b === undefined || b === null)) {
    return true;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    // NaN 不影响业务字段，但保持全等语义的兜底
    return Number.isNaN(a) && Number.isNaN(b) ? true : a === b;
  }
  return false;
}

/** 计算本次提交相对基准快照真正改动的字段 */
export function diffChanges(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
  fields: readonly string[],
): FieldChange[] {
  return fields
    .map((field) => ({
      field,
      baseValue: base[field],
      value: next[field],
    }))
    .filter((c) => !sameValue(c.baseValue, c.value));
}

export function pickFields(
  entity: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f] = entity[f];
  return out;
}

/** 生成冲突双方候选：另一方（已落库）在前，本次提交在后 */
export function toConflictCandidates(event: FieldConflictEvent): ConflictCandidate[] {
  return [
    {
      value: event.otherValue,
      updatedAt: event.otherUpdatedAt,
      savedAt: event.otherUpdatedAt,
      source: event.otherSource,
    },
    {
      value: event.value,
      updatedAt: event.incomingUpdatedAt,
      savedAt: event.savedAt,
      source: event.source,
    },
  ];
}

/**
 * 字段级三路合并（3-way merge by field）。
 *
 * 页面提交时给出自己打开表单时的基准快照（baseRevision + 字段基准值）。
 * - 基准版本与当前版本一致：无并发，直接快进落库；
 * - 版本已前进：逐字段比对，只有当前方也改过的字段才参与合并；
 *   - 本字段另一方没动（本字段的逐字段时间戳未变）→ 快进；
 *   - 另一方也改成了相同值 → 双方一致，直接生效，不算冲突；
 *   - 另一方改成了不同值 → 记录冲突：双方值与修改时间都保留，
 *     实体字段先按修改时间更晚的一方兜底生效，等待编目员在详情页裁决。
 *
 * 纯函数，不触碰数据库，便于单测。
 */
export function mergeEntityFields(params: {
  entity: VersionedEntity;
  baseRevision: number;
  changes: FieldChange[];
  entityType: ConflictEntityType;
  source: ConflictSource;
  now?: number;
}): MergeResult {
  const { entity, baseRevision, changes, source, entityType } = params;
  const now = params.now ?? Date.now();
  const patch: Record<string, unknown> = {};
  const nextFieldUpdatedAt: Record<string, number> = { ...entity.fieldUpdatedAt };
  const conflicts: FieldConflictEvent[] = [];

  if (!changes.length) {
    return { patch, fieldUpdatedAt: nextFieldUpdatedAt, revision: entity.revision, conflicts, noop: true };
  }

  const concurrent = entity.revision > baseRevision;

  for (const change of changes) {
    const incomingUpdatedAt = now;
    const storedValue = entity[change.field];
    const fieldStamp = entity.fieldUpdatedAt[change.field] ?? 0;

    if (!concurrent) {
      // 自己是最新版本：直接落库
      patch[change.field] = change.value;
      nextFieldUpdatedAt[change.field] = incomingUpdatedAt;
      continue;
    }

    // 并发版本下做逐字段三路合并，判据是库中现值与本方基准值的关系
    // （版本号是计数器、字段时间戳是毫秒，二者不能直接比较）：
    // - 现值 === 本方基准值：另一方没动这个字段 → 快进本方修改；
    // - 现值 !== 基准值但与本方新值相同：双方改成一致 → 直接生效，不算冲突；
    // - 现值既不同于基准值也不同于本方新值：双方改成不同值 → 记录冲突。
    const otherChangedField = !sameValue(storedValue, change.baseValue);

    if (!otherChangedField || sameValue(storedValue, change.value)) {
      patch[change.field] = change.value;
      nextFieldUpdatedAt[change.field] = incomingUpdatedAt;
      continue;
    }

    // 真正冲突：双方都改了且值不同 —— 保留双方值与时间，
    // 实体先按修改时间更晚的一方兜底，等待人工裁决。
    const event: FieldConflictEvent = {
      field: change.field,
      baseValue: change.baseValue,
      value: change.value,
      otherValue: storedValue,
      otherUpdatedAt: fieldStamp,
      otherSource: entity.lastSource ?? 'other',
      incomingUpdatedAt,
      source,
      savedAt: now,
      entityType,
    };
    conflicts.push(event);
    patch[change.field] = fieldStamp > incomingUpdatedAt ? storedValue : change.value;
    nextFieldUpdatedAt[change.field] = Math.max(fieldStamp, incomingUpdatedAt);
  }

  const revisionBumped =
    Object.keys(patch).length > 0 || conflicts.length > 0 ? entity.revision + 1 : entity.revision;

  return {
    patch,
    fieldUpdatedAt: nextFieldUpdatedAt,
    revision: revisionBumped,
    conflicts,
    noop: revisionBumped === entity.revision,
  };
}

/**
 * 把一次提交的多个字段变更合并到已有实体的便捷入口：
 * 入参为基准快照对象与本次整表内容，内部先 diff 再走 mergeEntityFields。
 */
export function mergeEntityFromSnapshot(params: {
  entity: VersionedEntity;
  baseRevision: number;
  baseFields: Record<string, unknown>;
  nextFields: Record<string, unknown>;
  editableFields: readonly string[];
  entityType: ConflictEntityType;
  source: ConflictSource;
  now?: number;
}): MergeResult {
  const changes = diffChanges(params.baseFields, params.nextFields, params.editableFields);
  return mergeEntityFields({
    entity: params.entity,
    baseRevision: params.baseRevision,
    changes,
    entityType: params.entityType,
    source: params.source,
    now: params.now,
  });
}
