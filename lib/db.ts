export type Env = CloudflareEnv;

export async function getKv<T>(db: D1Database, key: string): Promise<{ value: T; at: string } | null> {
  const row = await db.prepare("SELECT value, updated_at FROM kv WHERE key = ?").bind(key).first<{ value: string; updated_at: string }>();
  return row ? { value: JSON.parse(row.value) as T, at: row.updated_at } : null;
}

export async function setKv(db: D1Database, key: string, value: unknown) {
  await db
    .prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(key, JSON.stringify(value), new Date().toISOString())
    .run();
}

/**
 * Atomic single-run lock (COST_CAUTION.md rule 6, "cron pile-up"). One statement:
 * inserts, or takes over only an expired lock. Returns false if someone else holds it.
 */
export async function acquireLock(db: D1Database, name: string, ttlMs: number): Promise<boolean> {
  const now = Date.now();
  const r = await db
    .prepare("INSERT INTO locks (name, until) VALUES (?1, ?2) ON CONFLICT(name) DO UPDATE SET until = ?2 WHERE locks.until < ?3")
    .bind(name, now + ttlMs, now)
    .run();
  return r.meta.changes === 1;
}

export async function releaseLock(db: D1Database, name: string) {
  await db.prepare("DELETE FROM locks WHERE name = ?").bind(name).run();
}

export interface Budget {
  project: string;
  monthly: number | null;
  daily: number | null;
  autostop: number;
}

export async function getBudgets(db: D1Database): Promise<Record<string, Budget>> {
  const { results } = await db.prepare("SELECT * FROM budgets").all<Budget>();
  return Object.fromEntries(results.map((b) => [b.project, b]));
}

export async function getOverrides(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare("SELECT resource, project FROM overrides").all<{ resource: string; project: string }>();
  return Object.fromEntries(results.map((o) => [o.resource, o.project]));
}

export async function getStops(db: D1Database): Promise<Record<string, { at: string; reason: string }>> {
  const { results } = await db.prepare("SELECT project, at, reason FROM stops").all<{ project: string; at: string; reason: string }>();
  return Object.fromEntries(results.map((s) => [s.project, s]));
}
