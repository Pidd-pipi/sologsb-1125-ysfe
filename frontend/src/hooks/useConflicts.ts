import { useMemo } from 'react';
import { useSampleStore } from '../stores/sampleStore';
import type { ConflictEntityType, FieldConflict } from '../types/conflict';

/** 全站未裁决冲突（总览提示、侧栏角标使用） */
export function useAllPendingConflicts(): FieldConflict[] {
  return useSampleStore((s) => s.conflicts);
}

/** 指定样本相关的未裁决冲突（详情页裁决面板使用） */
export function useSampleConflicts(sampleId: string): FieldConflict[] {
  const conflicts = useSampleStore((s) => s.conflicts);
  return useMemo(
    () => conflicts.filter((c) => c.sampleId === sampleId),
    [conflicts, sampleId],
  );
}

/**
 * 冲突字段映射：entityType+field → 冲突记录。
 * 用于在表单 / 摘要上标记「该字段有分歧待裁决」，
 * 裁决完成后所有页面自动不再标红并读到同一份内容。
 */
export function useConflictFieldSet(
  sampleId: string,
): Set<string> {
  const conflicts = useSampleConflicts(sampleId);
  return useMemo(() => {
    const set = new Set<string>();
    conflicts.forEach((c) => set.add(`${c.entityType}:${c.field}`));
    return set;
  }, [conflicts]);
}

export function conflictsByEntity(
  conflicts: FieldConflict[],
  entityType: ConflictEntityType,
): FieldConflict[] {
  return conflicts.filter((c) => c.entityType === entityType);
}
