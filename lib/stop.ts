import { cfClient, soft } from "./cf";
import type { Env } from "./db";
import type { Inventory } from "./types";

/** This dashboard's own Worker (wrangler.jsonc "name"). Never stopped, or you lose the resume button. */
export const selfScript = (env: Pick<Env, "WORKER_NAME">) => env.WORKER_NAME || "cf-overview";

interface WorkerSnapshot {
  script: string;
  workersDev: boolean;
  crons: string[];
  routes: { zoneId: string; pattern: string }[];
  domains: { hostname: string; zone_id: string; service: string; environment?: string }[];
}

/**
 * Emergency stop: cuts every way traffic or cron can reach a project's Workers
 * (workers.dev, routes, custom domains, cron triggers) and pauses delivery on queues they consume.
 * Nothing is deleted except those attachments, and they are saved first so resume() can put them back.
 * shortcut: Durable Object alarms and Pages projects keep running; stop those in the dashboard.
 */
export async function stopProject(env: Env, inv: Inventory, project: string, scripts: string[], reason: string) {
  if (!env.CF_STOP_TOKEN) throw new Error("CF_STOP_TOKEN not set");
  scripts = scripts.filter((s) => s !== selfScript(env));
  if (!scripts.length) return;
  const existing = await env.DB.prepare("SELECT 1 FROM stops WHERE project = ?").bind(project).first();
  if (existing) return; // idempotent: already stopped

  const cf = cfClient(env.CF_STOP_TOKEN, 300);
  const a = `/accounts/${inv.accountId}`;
  const zones = inv.resources.filter((r) => r.kind === "zone");

  // 1. Snapshot everything, and save it before touching anything.
  const allDomains = await cf.get<any[]>(`${a}/workers/domains`);
  const zoneRoutes: Record<string, any[]> = {};
  for (const z of zones) zoneRoutes[z.id] = await soft(cf.get<any[]>(`/zones/${z.id}/workers/routes`), []);

  const snaps: WorkerSnapshot[] = [];
  for (const script of scripts) {
    const sub = await soft(cf.get<any>(`${a}/workers/scripts/${script}/subdomain`), { enabled: false });
    const sched = await soft(cf.get<any>(`${a}/workers/scripts/${script}/schedules`), { schedules: [] });
    snaps.push({
      script,
      workersDev: !!sub?.enabled,
      crons: (sched?.schedules ?? []).map((s: any) => s.cron),
      routes: Object.entries(zoneRoutes).flatMap(([zoneId, rs]) =>
        rs.filter((r) => r.script === script).map((r) => ({ zoneId, pattern: r.pattern, id: r.id })),
      ),
      domains: allDomains.filter((d) => d.service === script),
    });
  }
  const queues = inv.resources
    .filter((r) => r.kind === "queue" && !r.meta?.paused && r.meta?.consumers?.some((c: any) => scripts.includes(c.script)))
    .map((r) => r.meta!.queueId as string);
  await env.DB.prepare("INSERT INTO stops (project, snapshot, at, reason) VALUES (?, ?, ?, ?)")
    .bind(project, JSON.stringify({ workers: snaps, queues }), new Date().toISOString(), reason)
    .run();

  // 2. Detach. Each step is independent so one failure doesn't leave the rest running.
  const errors: string[] = [];
  for (const s of snaps) {
    await soft(cf.send("POST", `${a}/workers/scripts/${s.script}/subdomain`, { enabled: false }), null, errors);
    if (s.crons.length) await soft(cf.send("PUT", `${a}/workers/scripts/${s.script}/schedules`, []), null, errors);
    for (const r of s.routes as any[]) await soft(cf.send("DELETE", `/zones/${r.zoneId}/workers/routes/${r.id}`), null, errors);
    for (const d of s.domains as any[]) await soft(cf.send("DELETE", `${a}/workers/domains/${d.id}`), null, errors);
  }
  for (const q of queues) await soft(cf.send("PATCH", `${a}/queues/${q}`, { settings: { delivery_paused: true } }), null, errors);
  if (errors.length) throw new Error(`Stopped with errors: ${errors.join("; ")}`);
}

export async function resumeProject(env: Env, accountId: string, project: string) {
  if (!env.CF_STOP_TOKEN) throw new Error("CF_STOP_TOKEN not set");
  const row = await env.DB.prepare("SELECT snapshot FROM stops WHERE project = ?").bind(project).first<{ snapshot: string }>();
  if (!row) return;
  const { workers: snaps, queues }: { workers: WorkerSnapshot[]; queues: string[] } = JSON.parse(row.snapshot);
  const cf = cfClient(env.CF_STOP_TOKEN, 300);
  const a = `/accounts/${accountId}`;
  const errors: string[] = [];

  for (const s of snaps) {
    if (s.workersDev) await soft(cf.send("POST", `${a}/workers/scripts/${s.script}/subdomain`, { enabled: true }), null, errors);
    if (s.crons.length) await soft(cf.send("PUT", `${a}/workers/scripts/${s.script}/schedules`, s.crons.map((cron) => ({ cron }))), null, errors);
    for (const r of s.routes) await soft(cf.send("POST", `/zones/${r.zoneId}/workers/routes`, { pattern: r.pattern, script: s.script }), null, errors);
    for (const d of s.domains)
      await soft(cf.send("PUT", `${a}/workers/domains`, { hostname: d.hostname, zone_id: d.zone_id, service: d.service, environment: d.environment ?? "production" }), null, errors);
  }
  for (const q of queues) await soft(cf.send("PATCH", `${a}/queues/${q}`, { settings: { delivery_paused: false } }), null, errors);
  // Keep the snapshot if anything failed, so resume can be retried by hand.
  if (errors.length) throw new Error(`Resume incomplete: ${errors.join("; ")}`);
  await env.DB.prepare("DELETE FROM stops WHERE project = ?").bind(project).run();
}
