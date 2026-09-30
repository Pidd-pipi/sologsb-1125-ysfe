import { create } from 'zustand';
import { db, makeId, seedIfEmpty, stampRevision, SAMPLE_STAMP_FIELDS, FIND_STAMP_FIELDS } from '../db';
import { changeBus, type ChangeTable } from '../db/changeBus';
import {
  mergeEntityFields,
  sameValue,
  type FieldConflictEvent,
  type VersionedEntity,
} from '../utils/merge';
import type { AnalysisRecord } from '../types/analysis';
import type { FindRecord } from '../types/find';
import type { MeteoriteSample } from '../types/sample';
import type { ThinSection } from '../types/section';
import type {
  ConflictEntityType,
  ConflictSource,
  FieldConflict,
} from '../types/conflict';

/** 字段级合并提交入参 */
export interface CommitFieldsInput {
  id: string;
  /** 打开编辑表单时看到的版本号 */
  baseRevision: number;
  /** 打开编辑表单时的字段基准值 */
  base: Record<string, unknown>;
  /** 本次表单内容 */
  next: Record<string, unknown>;
  fields: readonly string[];
  source: ConflictSource;
}

export interface CommitResult {
  conflictCount: number;
}

export interface SampleState {
  samples: MeteoriteSample[];
  finds: FindRecord[];
  sections: ThinSection[];
  analysis: AnalysisRecord[];
  conflicts: FieldConflict[];
  loading: boolean;
  loaded: boolean;
  loadAll: () => Promise<void>;
  refresh: (tables?: ChangeTable[]) => Promise<void>;
  addSample: (input: Omit<MeteoriteSample, 'id' | 'createdAt' | 'updatedAt' | 'revision' | 'fieldUpdatedAt'>) => Promise<string>;
  /** 字段级合并更新样本（替代旧的整记录覆盖） */
  commitSampleFields: (input: CommitFieldsInput) => Promise<CommitResult>;
  removeSample: (id: string) => Promise<void>;
  addFind: (input: Omit<FindRecord, 'id' | 'createdAt' | 'revision' | 'fieldUpdatedAt'>) => Promise<string>;
  /** 字段级合并更新发现地 */
  commitFindFields: (input: CommitFieldsInput) => Promise<CommitResult>;
  addSection: (input: Omit<ThinSection, 'id' | 'createdAt'>) => Promise<string>;
  updateSection: (id: string, patch: Partial<ThinSection>) => Promise<void>;
  addAnalysis: (input: Omit<AnalysisRecord, 'id' | 'createdAt'>) => Promise<string>;
  /** 在详情页为冲突字段选定最终内容 */
  resolveConflict: (conflictId: string, chosenValue: unknown) => Promise<void>;
  nextSampleSeq: () => number;
}

function sortByCreatedDesc<T extends { createdAt: number }>(list: T[]): T[] {
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

/** 合并冲突双方候选：同值+同修改时间去重，仍处于分歧中的值全部保留 */
function mergeCandidates(
  existing: FieldConflict['candidates'] | undefined,
  event: FieldConflictEvent,
): FieldConflict['candidates'] {
  const merged: FieldConflict['candidates'] = existing ? [...existing] : [
    {
      value: event.otherValue,
      updatedAt: event.otherUpdatedAt,
      savedAt: event.otherUpdatedAt,
      source: event.otherSource,
    },
  ];
  const incoming = {
    value: event.value,
    updatedAt: event.incomingUpdatedAt,
    savedAt: event.savedAt,
    source: event.source,
  };
  const dup = merged.some(
    (c) => c.updatedAt === incoming.updatedAt && c.value === incoming.value,
  );
  if (!dup) merged.push(incoming);
  return merged.sort((a, b) => a.updatedAt - b.updatedAt);
}

/** 从候选中取修改时间最晚的值作为未裁决时的兜底生效值 */
function activeOf(candidates: FieldConflict['candidates']): unknown {
  return candidates.reduce((latest, c) => (c.updatedAt > latest.updatedAt ? c : latest), candidates[0])
    .value;
}

/** 写库后同步内存并通知其他标签页（单一数据来源：始终以库为准） */
async function persistAndSync(
  set: (partial: Partial<SampleState>) => void,
  get: () => SampleState,
  tables: ChangeTable[],
) {
  const next = await loadCollections(tables, get());
  set(next);
  changeBus?.post(tables);
}

async function loadCollections(
  tables: ChangeTable[],
  prev: SampleState,
): Promise<Partial<SampleState>> {
  const wantAll = tables.includes('all');
  const out: Partial<SampleState> = {};
  if (wantAll || tables.includes('samples')) {
    out.samples = sortByCreatedDesc(await db.samples.toArray());
  } else {
    out.samples = prev.samples;
  }
  if (wantAll || tables.includes('finds')) {
    out.finds = sortByCreatedDesc(await db.finds.toArray());
  } else {
    out.finds = prev.finds;
  }
  if (wantAll || tables.includes('sections')) {
    out.sections = sortByCreatedDesc(await db.sections.toArray());
  } else {
    out.sections = prev.sections;
  }
  if (wantAll || tables.includes('analysis')) {
    out.analysis = sortByCreatedDesc(await db.analysis.toArray());
  } else {
    out.analysis = prev.analysis;
  }
  if (wantAll || tables.includes('conflicts')) {
    const all = await db.conflicts.toArray();
    out.conflicts = all
      .filter((c) => c.status === 'pending')
      .sort((a, b) => b.createdAt - a.createdAt);
  } else {
    out.conflicts = prev.conflicts;
  }
  return out;
}

export const useSampleStore = create<SampleState>((set, get) => ({
  samples: [],
  finds: [],
  sections: [],
  analysis: [],
  conflicts: [],
  loading: false,
  loaded: false,

  loadAll: async () => {
    set({ loading: true });
    await seedIfEmpty();
    const next = await loadCollections(['all'], get());
    set({ ...next, loading: false, loaded: true });
  },

  refresh: async (tables = ['all']) => {
    if (!get().loaded) return;
    const next = await loadCollections(tables, get());
    set(next);
  },

  addSample: async (input) => {
    const now = Date.now();
    const record = stampRevision(
      { ...input, id: makeId('sample'), createdAt: now, updatedAt: now },
      SAMPLE_STAMP_FIELDS,
      now,
    );
    await db.samples.add(record);
    await persistAndSync(set, get, ['samples']);
    return record.id;
  },

  commitSampleFields: async (input) => {
    return commitFields(set, get, 'sample', input);
  },

  removeSample: async (id) => {
    await db.transaction(
      'rw',
      db.samples,
      db.finds,
      db.sections,
      db.analysis,
      db.conflicts,
      async () => {
        await db.samples.delete(id);
        await db.finds.where('sampleId').equals(id).delete();
        await db.sections.where('sampleId').equals(id).delete();
        await db.analysis.where('sampleId').equals(id).delete();
        await db.conflicts.where('sampleId').equals(id).delete();
      },
    );
    await persistAndSync(set, get, ['all']);
  },

  addFind: async (input) => {
    const now = Date.now();
    const record = stampRevision(
      { ...input, id: makeId('find'), createdAt: now },
      FIND_STAMP_FIELDS,
      now,
    );
    await db.finds.add(record);
    await persistAndSync(set, get, ['finds']);
    return record.id;
  },

  commitFindFields: async (input) => {
    return commitFields(set, get, 'find', input);
  },

  addSection: async (input) => {
    const record: ThinSection = { ...input, id: makeId('section'), createdAt: Date.now() };
    await db.sections.add(record);
    await persistAndSync(set, get, ['sections']);
    return record.id;
  },

  updateSection: async (id, patch) => {
    await db.sections.update(id, patch);
    await persistAndSync(set, get, ['sections']);
  },

  addAnalysis: async (input) => {
    const record: AnalysisRecord = { ...input, id: makeId('analysis'), createdAt: Date.now() };
    await db.analysis.add(record);
    await persistAndSync(set, get, ['analysis']);
    return record.id;
  },

  resolveConflict: async (conflictId, chosenValue) => {
    const conflict = await db.conflicts.get(conflictId);
    if (!conflict || conflict.status !== 'pending') return;
    const now = Date.now();

    await db.transaction('rw', db.conflicts, db.samples, db.finds, async () => {
      const table = db.table<VersionedEntity, string>(
        conflict.entityType === 'sample' ? 'samples' : 'finds',
      );
      const entity = await table.get(conflict.entityId);

      await db.conflicts.update(conflictId, {
        status: 'resolved',
        chosenValue,
        resolvedAt: now,
      });

      if (entity) {
        await table.update(conflict.entityId, {
          [conflict.field]: chosenValue,
          revision: entity.revision + 1,
          updatedAt: now,
          fieldUpdatedAt: { ...entity.fieldUpdatedAt, [conflict.field]: now },
        });
      }
    });

    await persistAndSync(set, get, ['conflicts', conflict.entityType === 'sample' ? 'samples' : 'finds']);
  },

  nextSampleSeq: () => {
    const year = new Date().getFullYear();
    const prefix = `MET-${year}-`;
    const used = get()
      .samples.map((s) => s.sampleNo)
      .filter((no) => no.startsWith(prefix))
      .map((no) => Number(no.slice(prefix.length)))
      .filter((n) => Number.isFinite(n));
    const max = used.length ? Math.max(...used) : 0;
    return max + 1;
  },
}));

/**
 * 字段级合并落库的统一实现：
 * 在事务内重读实体 → 纯函数合并 → 写实体 + upsert 冲突记录。
 * samples 与 finds 结构一致，仅表不同。
 */
async function commitFields(
  set: (partial: Partial<SampleState>) => void,
  get: () => SampleState,
  entityType: ConflictEntityType,
  input: CommitFieldsInput,
): Promise<CommitResult> {
  const tableName = entityType === 'sample' ? 'samples' : 'finds';
  const { id, baseRevision, base, next, fields, source } = input;

  const result = await db.transaction(
    'rw',
    entityType === 'sample' ? [db.samples, db.conflicts] : [db.finds, db.conflicts],
    async () => {
      const table = db.table<VersionedEntity, string>(tableName);
      const entity = await table.get(id);
      if (!entity) throw new Error('记录不存在或已被删除，无法保存');

      const changes = fields
        .map((field) => ({ field, baseValue: base[field], value: next[field] }))
        .filter((c) => !sameValue(c.baseValue, c.value));

      const merged = mergeEntityFields({
        entity,
        baseRevision,
        changes,
        entityType,
        source,
      });

      if (merged.noop) return { merged, entity, conflictCount: 0 };

      const sampleId =
        entityType === 'sample'
          ? entity.id
          : ((entity as unknown as FindRecord).sampleId ?? entity.id);

      for (const event of merged.conflicts) {
        const sameEntity = await db.conflicts.where('entityId').equals(id).toArray();
        const existing = sameEntity.find(
          (c) => c.entityType === entityType && c.field === event.field && c.status === 'pending',
        );

        const candidates = mergeCandidates(existing?.candidates, event);
        const conflictId = existing?.id ?? makeId('conflict');

        const record: FieldConflict = {
          id: conflictId,
          entityType,
          entityId: id,
          sampleId: String(sampleId),
          field: event.field,
          baseValue: event.baseValue,
          candidates,
          status: 'pending',
          activeValue: activeOf(candidates),
          createdAt: existing?.createdAt ?? Date.now(),
        };
        await db.conflicts.put(record);
      }

      await table.update(id, {
        ...merged.patch,
        revision: merged.revision,
        updatedAt: Date.now(),
        fieldUpdatedAt: merged.fieldUpdatedAt,
        lastSource: source,
      });

      return { merged, entity, conflictCount: merged.conflicts.length };
    },
  );

  await persistAndSync(set, get, [
    'conflicts',
    entityType === 'sample' ? 'samples' : 'finds',
  ]);
  return { conflictCount: result.conflictCount };
}
