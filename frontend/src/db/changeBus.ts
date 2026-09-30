/**
 * 跨标签页数据变更通知。
 *
 * 编目员常同时打开「样本详情」与「分析检测」两个页面：一边保存后，
 * 另一边的 zustand 内存快照不会自动更新。这里通过 BroadcastChannel
 * 广播变更（隐私模式不支持时用 localStorage storage 事件兜底），
 * 收到通知的页面静默从 IndexedDB 重新拉取，保证两处读同一份内容。
 */

export type ChangeTable = 'samples' | 'finds' | 'sections' | 'analysis' | 'conflicts' | 'all';

export interface DataChangeMessage {
  channel: 'gbmeteorite-data-change';
  tables: ChangeTable[];
  /** 发起方 id，用于不回声给自己 */
  origin: string;
  at: number;
}

const CHANNEL_NAME = 'gbmeteorite-data-change';
const FALLBACK_KEY = 'gbmeteorite:change-ping';

function makeOrigin(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class ChangeBus {
  readonly origin = makeOrigin();
  private bc: BroadcastChannel | null = null;
  private listeners = new Set<(msg: DataChangeMessage) => void>();

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.bc = new BroadcastChannel(CHANNEL_NAME);
      this.bc.onmessage = (event: MessageEvent<DataChangeMessage>) => {
        const msg = event.data;
        if (msg?.channel !== 'gbmeteorite-data-change' || msg.origin === this.origin) return;
        this.listeners.forEach((fn) => fn(msg));
      };
    } else if (typeof window !== 'undefined' && window.addEventListener) {
      // 兜底：其他标签页写 localStorage 时本页收到 storage 事件
      window.addEventListener('storage', (event) => {
        if (event.key !== FALLBACK_KEY || !event.newValue) return;
        try {
          const msg = JSON.parse(event.newValue) as DataChangeMessage;
          if (msg?.channel !== 'gbmeteorite-data-change' || msg.origin === this.origin) return;
          this.listeners.forEach((fn) => fn(msg));
        } catch {
          /* ignore malformed ping */
        }
      });
    }
  }

  post(tables: ChangeTable[]): void {
    const msg: DataChangeMessage = {
      channel: 'gbmeteorite-data-change',
      tables,
      origin: this.origin,
      at: Date.now(),
    };
    if (this.bc) {
      this.bc.postMessage(msg);
    } else {
      try {
        localStorage.setItem(FALLBACK_KEY, JSON.stringify(msg));
      } catch {
        /* ignore */
      }
    }
  }

  subscribe(fn: (msg: DataChangeMessage) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const changeBus =
  typeof window !== 'undefined' ? new ChangeBus() : null;
