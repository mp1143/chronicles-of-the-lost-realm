/**
 * Storage adapter — the only place that knows which platform we are on.
 *
 * Web uses IndexedDB (localStorage caps out around 5MB and blocks the main
 * thread). Capacitor builds use the same IndexedDB inside the WebView, which is
 * persistent on both Android and iOS; the native Filesystem plugin is only
 * needed for user-visible export, which is a later feature.
 */

export interface StorageAdapter {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const DB_NAME = 'chronicles';
const STORE = 'saves';

class IndexedDbStorage implements StorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const v = await this.tx<unknown>('readonly', (s) => s.get(key) as IDBRequest<unknown>);
    if (!v) return null;
    return v instanceof Uint8Array ? v : new Uint8Array(v as ArrayBuffer);
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    await this.tx('readwrite', (s) => s.put(value, key) as IDBRequest<IDBValidKey>);
  }

  async delete(key: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(key) as IDBRequest<undefined>);
  }

  async keys(): Promise<string[]> {
    const keys = await this.tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
    return keys.map(String);
  }
}

/** In-memory fallback: tests, SSR, and private-mode browsers that block IDB. */
export class MemoryStorage implements StorageAdapter {
  private map = new Map<string, Uint8Array>();
  async get(key: string): Promise<Uint8Array | null> {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: Uint8Array): Promise<void> {
    this.map.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }
}

export function createStorage(): StorageAdapter {
  if (typeof indexedDB !== 'undefined') {
    try {
      return new IndexedDbStorage();
    } catch {
      // Private browsing can throw on open; memory is better than a crash.
    }
  }
  return new MemoryStorage();
}
