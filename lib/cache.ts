// Cache trong bo nho voi TTL (giam tre + tranh rate limit). Theo tung instance.
type Entry = { at: number; value: any };
const store = new Map<string, Entry>();
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await loader();
  store.set(key, { at: Date.now(), value });
  return value;
}
