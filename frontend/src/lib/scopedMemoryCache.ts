/** Short-lived, memory-only cache. Never read without a resolved access scope. */
export class ScopedMemoryCache<T> {
  private entries = new Map<string, { at: number; value: T }>();
  constructor(private ttlMs = 60_000) {}
  get(scope: string, now = Date.now()): T | undefined {
    if (!scope) return undefined;
    const entry = this.entries.get(scope);
    if (!entry || now - entry.at >= this.ttlMs) { this.entries.delete(scope); return undefined; }
    return entry.value;
  }
  set(scope: string, value: T, now = Date.now()) {
    if (!scope) return;
    if (this.entries.size >= 20) this.entries.clear();
    this.entries.set(scope, { at: now, value });
  }
  clear() { this.entries.clear(); }
}
