import { create } from 'zustand';
import { db, makeId, seedIfEmpty } from '../db';
import type { AnalysisRecord } from '../types/analysis';
import type { FindRecord } from '../types/find';
import type { MeteoriteSample } from '../types/sample';
import type { ThinSection } from '../types/section';
import type { RecordConflict } from '../types/conflict';
import {
  FIND_FIELD_LABELS,
  SAMPLE_FIELD_LABELS,
  threeWayMerge,
} from '../utils/merge';

/** 一次提交的合并结果：调用方可据此提示「已合并 / 有冲突」 */
export interface MergeOutcome {
  mergedCount: number;
  conflicted: boolean;
  conflictId?: string;
}

export interface SampleState {
  samples: MeteoriteSample[];
  finds: FindRecord[];
  sections: ThinSection[];
  analysis: AnalysisRecord[];
  conflicts: RecordConflict[];
  loading: boolean;
  loaded: boolean;
  loadAll: () => Promise<void>;
  addSample: (input: Omit<MeteoriteSample, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  /** 三向合并更新样本：base 为页面打开时的快照，缺省退化为末位覆盖 */
  updateSample: (
    id: string,
    patch: Partial<MeteoriteSample>,
    base?: Partial<MeteoriteSample>,
  ) => Promise<MergeOutcome>;
  removeSample: (id: string) => Promise<void>;
  addFind: (input: Omit<FindRecord, 'id' | 'createdAt'>) => Promise<string>;
  /** 三向合并更新发现记录 */
  updateFind: (
    id: string,
    patch: Partial<FindRecord>,
    base?: Partial<FindRecord>,
  ) => Promise<MergeOutcome>;
  addSection: (input: Omit<ThinSection, 'id' | 'createdAt'>) => Promise<string>;
  updateSection: (id: string, patch: Partial<ThinSection>) => Promise<void>;
  addAnalysis: (input: Omit<AnalysisRecord, 'id' | 'createdAt'>) => Promise<string>;
  /** 在详情页为某个冲突字段选定最终值；选定后写入记录并清除该字段冲突 */
  resolveConflictField: (
    conflictId: string,
    field: string,
    chosenValue: unknown,
  ) => Promise<void>;
  nextSampleSeq: () => number;
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
    const [samples, finds, sections, analysis, conflicts] = await Promise.all([
      db.samples.toArray(),
      db.finds.toArray(),
      db.sections.toArray(),
      db.analysis.toArray(),
      db.conflicts.toArray(),
    ]);
    samples.sort((a, b) => b.createdAt - a.createdAt);
    finds.sort((a, b) => b.createdAt - a.createdAt);
    sections.sort((a, b) => b.createdAt - a.createdAt);
    analysis.sort((a, b) => b.createdAt - a.createdAt);
    conflicts.sort((a, b) => b.updatedAt - a.updatedAt);
    set({ samples, finds, sections, analysis, conflicts, loading: false, loaded: true });
  },

  addSample: async (input) => {
    const now = Date.now();
    const record: MeteoriteSample = { ...input, id: makeId('sample'), createdAt: now, updatedAt: now };
    await db.samples.add(record);
    set({ samples: [record, ...get().samples] });
    return record.id;
  },

  updateSample: async (id, patch, base) => {
    const now = Date.now();
    const current = await db.samples.get(id);
    if (!current) throw new Error('样本不存在或已被删除');

    const baseSnap = (base ?? current) as Record<string, unknown>;
    const { merged, conflicts } = threeWayMerge(
      baseSnap,
      current as unknown as Record<string, unknown>,
      patch as Record<string, unknown>,
      SAMPLE_FIELD_LABELS,
      now,
      current.updatedAt,
    );

    const mergedCount = Object.keys(merged).length;
    if (mergedCount > 0) {
      await db.samples.update(id, { ...merged, updatedAt: now });
    }

    let conflictId: string | undefined;
    if (conflicts.length > 0) {
      conflictId = makeId('conflict');
      const record: RecordConflict = {
        id: conflictId,
        table: 'samples',
        recordId: id,
        recordLabel: current.sampleNo,
        status: 'pending',
        fields: conflicts,
        createdAt: now,
        updatedAt: now,
      };
      await db.conflicts.add(record);
      set({ conflicts: [record, ...get().conflicts] });
    }

    const fresh = await db.samples.get(id);
    if (fresh) {
      set({ samples: get().samples.map((s) => (s.id === id ? fresh : s)) });
    }
    return { mergedCount, conflicted: conflicts.length > 0, conflictId };
  },

  removeSample: async (id) => {
    await db.transaction('rw', db.samples, db.finds, db.sections, db.analysis, db.conflicts, async () => {
      await db.samples.delete(id);
      await db.finds.where('sampleId').equals(id).delete();
      await db.sections.where('sampleId').equals(id).delete();
      await db.analysis.where('sampleId').equals(id).delete();
      await db.conflicts.where({ recordId: id }).delete();
    });
    set({
      samples: get().samples.filter((s) => s.id !== id),
      finds: get().finds.filter((f) => f.sampleId !== id),
      sections: get().sections.filter((s) => s.sampleId !== id),
      analysis: get().analysis.filter((a) => a.sampleId !== id),
      conflicts: get().conflicts.filter((c) => c.recordId !== id),
    });
  },

  addFind: async (input) => {
    const record: FindRecord = { ...input, id: makeId('find'), createdAt: Date.now() };
    await db.finds.add(record);
    set({ finds: [record, ...get().finds] });
    return record.id;
  },

  updateFind: async (id, patch, base) => {
    const now = Date.now();
    const current = await db.finds.get(id);
    if (!current) throw new Error('发现记录不存在或已被删除');

    const baseSnap = (base ?? current) as Record<string, unknown>;
    const { merged, conflicts } = threeWayMerge(
      baseSnap,
      current as unknown as Record<string, unknown>,
      patch as Record<string, unknown>,
      FIND_FIELD_LABELS,
      now,
      current.createdAt,
    );

    const mergedCount = Object.keys(merged).length;
    if (mergedCount > 0) {
      await db.finds.update(id, merged);
    }

    let conflictId: string | undefined;
    if (conflicts.length > 0) {
      conflictId = makeId('conflict');
      const record: RecordConflict = {
        id: conflictId,
        table: 'finds',
        recordId: id,
        recordLabel: current.placeName || current.region || id,
        status: 'pending',
        fields: conflicts,
        createdAt: now,
        updatedAt: now,
      };
      await db.conflicts.add(record);
      set({ conflicts: [record, ...get().conflicts] });
    }

    const fresh = await db.finds.get(id);
    if (fresh) {
      set({ finds: get().finds.map((f) => (f.id === id ? fresh : f)) });
    }
    return { mergedCount, conflicted: conflicts.length > 0, conflictId };
  },

  addSection: async (input) => {
    const record: ThinSection = { ...input, id: makeId('section'), createdAt: Date.now() };
    await db.sections.add(record);
    set({ sections: [record, ...get().sections] });
    return record.id;
  },

  updateSection: async (id, patch) => {
    await db.sections.update(id, patch);
    set({ sections: get().sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  },

  addAnalysis: async (input) => {
    const record: AnalysisRecord = { ...input, id: makeId('analysis'), createdAt: Date.now() };
    await db.analysis.add(record);
    set({ analysis: [record, ...get().analysis] });
    return record.id;
  },

  resolveConflictField: async (conflictId, field, chosenValue) => {
    const now = Date.now();
    const conflict = get().conflicts.find((c) => c.id === conflictId);
    if (!conflict) return;

    if (conflict.table === 'samples') {
      await db.samples.update(conflict.recordId, { [field]: chosenValue, updatedAt: now });
    } else if (conflict.table === 'finds') {
      await db.finds.update(conflict.recordId, { [field]: chosenValue });
    }

    const remaining = conflict.fields.filter((f) => f.field !== field);
    if (remaining.length === 0) {
      await db.conflicts.delete(conflictId);
      set({ conflicts: get().conflicts.filter((c) => c.id !== conflictId) });
    } else {
      await db.conflicts.update(conflictId, { fields: remaining, updatedAt: now });
      set({
        conflicts: get().conflicts.map((c) =>
          c.id === conflictId ? { ...c, fields: remaining, updatedAt: now } : c,
        ),
      });
    }

    if (conflict.table === 'samples') {
      const fresh = await db.samples.get(conflict.recordId);
      if (fresh) set({ samples: get().samples.map((s) => (s.id === conflict.recordId ? fresh : s)) });
    } else if (conflict.table === 'finds') {
      const fresh = await db.finds.get(conflict.recordId);
      if (fresh) set({ finds: get().finds.map((f) => (f.id === conflict.recordId ? fresh : f)) });
    }
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
