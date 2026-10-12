// Basit TTL cache. Aynı anahtar için eşzamanlı istekleri tek GitHub çağrısında birleştirir
// ve isteğe bağlı olarak sonuçları diske yazar (sunucu yeniden başlasa da cache korunur).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(
    private ttlMs: number,
    private dir?: string,
    private now: () => number = Date.now,
  ) {
    if (dir) mkdirSync(dir, { recursive: true });
  }

  /** Cache'te varsa döner, yoksa loader'ı çalıştırır. `hit` sonucun cache'ten gelip gelmediğini söyler. */
  async get(key: string, loader: () => Promise<T>, { force = false } = {}): Promise<{ value: T; hit: boolean }> {
    if (!force) {
      const cached = this.read(key);
      if (cached) return { value: cached, hit: true };
      const pending = this.inflight.get(key);
      if (pending) return { value: await pending, hit: true };
    }

    const promise = loader();
    this.inflight.set(key, promise);
    try {
      const value = await promise;
      this.write(key, value);
      return { value, hit: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  private read(key: string): T | undefined {
    let entry = this.store.get(key);
    if (!entry && this.dir) {
      const file = this.file(key);
      if (existsSync(file)) {
        try {
          entry = JSON.parse(readFileSync(file, 'utf8')) as Entry<T>;
          this.store.set(key, entry);
        } catch {
          /* bozuk cache dosyası: yok say */
        }
      }
    }
    if (entry && entry.expiresAt > this.now()) return entry.value;
    return undefined;
  }

  private write(key: string, value: T) {
    const entry = { value, expiresAt: this.now() + this.ttlMs };
    this.store.set(key, entry);
    if (this.dir) writeFileSync(this.file(key), JSON.stringify(entry));
  }

  private file(key: string) {
    return join(this.dir!, `${key.replace(/[^a-z0-9_-]/gi, '_')}.json`);
  }
}
