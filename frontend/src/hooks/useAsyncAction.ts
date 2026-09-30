import { useCallback, useState } from 'react';

/**
 * 封装「保存 → 成功 / 失败」流程：
 *  - 失败时保留原草稿（不清空），并记录错误，供页面展示「重试」按钮
 *  - 重试即重新调用提交处理函数，使用仍保留的最新草稿，从上次中断处继续
 */
export function useAsyncAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e ?? '保存失败'));
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { pending, error, run, clearError };
}
