import { useCallback, useEffect, useRef, useState } from 'react';

const KEY_PREFIX = 'gbmeteorite:draft:';

/**
 * 草稿信封：除表单内容外，还记录
 * - status：上次保存是否失败（失败草稿必须原样保留，等重试）
 * - error：失败原因
 * - scrollY：上次提交时的页面滚动位置，重试成功后回到该处
 * - meta：页面自定义上下文（如编辑表单的基准版本号）
 */
export interface DraftEnvelope<T> {
  v: 2;
  value: T;
  status: 'editing' | 'failed';
  error?: string;
  scrollY?: number;
  meta?: Record<string, unknown>;
  updatedAt: number;
}

function readEnvelope<T>(storageKey: string): DraftEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.v === 2 && 'value' in parsed) return parsed as DraftEnvelope<T>;
    // 兼容旧版裸内容草稿（v4 之前直接存表单 JSON）
    return { v: 2, value: parsed as T, status: 'editing', updatedAt: Date.now() };
  } catch {
    return null;
  }
}

function writeEnvelope<T>(storageKey: string, envelope: DraftEnvelope<T>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(envelope));
  } catch {
    /* 隐私模式下写入失败时静默降级 */
  }
}

export interface UseLocalDraftResult<T> {
  value: T;
  setValue: (updater: T | ((prev: T) => T)) => void;
  patch: (p: Partial<T>) => void;
  reset: () => void;
  clear: () => void;
  restored: boolean;
  /** 草稿是否带着上次保存失败的状态恢复（需要展示重试入口） */
  failed: boolean;
  error: string | null;
  /** 标记一次保存失败：草稿与滚动位置都保留 */
  markFailed: (error: string) => void;
  /** 保存成功后清理草稿，并返回上次滚动位置用于回到原处 */
  succeed: () => number | undefined;
  /** 继续编辑时把失败标记改回编辑中（重试按钮直接调用提交动作即可，无需先清除） */
  clearFailure: () => void;
  meta: Record<string, unknown> | undefined;
  setMeta: (meta: Record<string, unknown> | undefined) => void;
  storageKey: string;
}

/**
 * 表单草稿落 localStorage、切页 / 重开页面恢复、提交后清理。
 * 保存失败时草稿原样保留并记录滚动位置，可从上次位置重试。
 * 被 /samples/new、/analysis 与详情页就地编辑表单消费。
 */
export function useLocalDraft<T extends object>(draftKey: string, initialValue: T): UseLocalDraftResult<T> {
  const storageKey = KEY_PREFIX + draftKey;
  const initialRef = useRef(initialValue);
  initialRef.current = initialValue;

  const [envelope, setEnvelope] = useState<DraftEnvelope<T>>(() => {
    const restored = readEnvelope<T>(storageKey);
    return restored ?? { v: 2, value: initialValue, status: 'editing', updatedAt: Date.now() };
  });
  const [restored, setRestored] = useState<boolean>(() => readEnvelope<T>(storageKey) !== null);

  useEffect(() => {
    writeEnvelope(storageKey, envelope);
  }, [storageKey, envelope]);

  const setValue = useCallback((updater: T | ((prev: T) => T)) => {
    setEnvelope((prev) => ({
      ...prev,
      value: typeof updater === 'function' ? (updater as (p: T) => T)(prev.value) : updater,
      status: 'editing',
      error: undefined,
      updatedAt: Date.now(),
    }));
  }, []);

  const patch = useCallback((p: Partial<T>) => {
    setEnvelope((prev) => ({
      ...prev,
      value: { ...prev.value, ...p },
      status: 'editing',
      error: undefined,
      updatedAt: Date.now(),
    }));
    setRestored(false);
  }, []);

  const reset = useCallback(() => {
    setEnvelope({ v: 2, value: initialRef.current, status: 'editing', updatedAt: Date.now() });
    setRestored(false);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const markFailed = useCallback((error: string) => {
    setEnvelope((prev) => ({
      ...prev,
      status: 'failed',
      error,
      scrollY: window.scrollY,
      updatedAt: Date.now(),
    }));
  }, []);

  const clearFailure = useCallback(() => {
    setEnvelope((prev) =>
      prev.status === 'failed'
        ? { ...prev, status: 'editing', error: undefined, updatedAt: Date.now() }
        : prev,
    );
  }, []);

  const succeed = useCallback(() => {
    const y = envelope.scrollY;
    clear();
    setEnvelope({ v: 2, value: initialRef.current, status: 'editing', updatedAt: Date.now() });
    setRestored(false);
    return y;
  }, [clear, envelope.scrollY]);

  const setMeta = useCallback((meta: Record<string, unknown> | undefined) => {
    setEnvelope((prev) => ({ ...prev, meta, updatedAt: Date.now() }));
  }, []);

  return {
    value: envelope.value,
    setValue,
    patch,
    reset,
    clear,
    restored,
    failed: envelope.status === 'failed',
    error: envelope.status === 'failed' ? (envelope.error ?? '保存失败') : null,
    markFailed,
    succeed,
    clearFailure,
    meta: envelope.meta,
    setMeta,
    storageKey,
  };
}

export function readDraft<T>(storageKey: string): T | null {
  const envelope = readEnvelope<T>(
    storageKey.startsWith(KEY_PREFIX) ? storageKey : KEY_PREFIX + storageKey,
  );
  return envelope ? envelope.value : null;
}

export function clearDraft(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}
