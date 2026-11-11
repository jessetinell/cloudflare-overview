import { cfClient } from "./cf";
import { acquireLock, type Env, getBudgets, getKv, getOverrides, getStops, releaseLock, setKv } from "./db";
import { evaluate, fetchSecurityState } from "./findings";
import { fetchInventory } from "./inventory";
import { BASE_PLAN_USD, estimateCosts, grossCost, projectMonthEnd } from "./pricing";
import { groupProjects } from "./projects";
import { stopProject } from "./stop";
import type { Finding, Inventory, Usage } from "./types";
import { fetchUsage } from "./usage";

export const SPIKE_MULTIPLIER = 10;
export const SPIKE_MIN_USD_PER_HOUR = 5;
export const MAX_ALERTS_PER_RUN = 20;
const INVENTORY_MAX_AGE_MS = 55 * 60_000;
const LOCK_TTL_MS = 10 * 60_000;

export interface UsageSnapshot {
  at: string;
  usage: Usage;
  net: Record<string, number>;
  gross: Record<string, number>;
  errors: string[];
}

/** Spend over the last hour vs the average hourly spend before it (this month, up to 7 days back). */
export function detectSpike(samples: { at: string; gross: number }[], now: Date): { lastHour: number; baseline: number } | null {
  if (samples.length < 2) return null;
  const sorted = [...samples].sort((a, b) => a.at.localeCompare(b.at));
  const latest = sorted[sorted.length - 1];
  const hourAgo = [...sorted].reverse().find((s) => now.getTime() - Date.parse(s.at) >= 3600_000);
  if (!hourAgo) return null;
  const first = sorted[0];
  const lastHour = Math.max(0, latest.gross - hourAgo.gross) / ((Date.parse(latest.at) - Date.parse(hourAgo.at)) / 3600_000);
  // Baseline excludes the last hour, so a sustained runaway doesn't raise its own bar.
  const hours = (Date.parse(hourAgo.at) - Date.parse(first.at)) / 3600_000;
  const baseline = hours > 0 ? Math.max(0, hourAgo.gross - first.gross) / hours : 0;
  return { lastHour, baseline };
}

/**
 * The one scheduled job. Reads Cloudflare, writes D1, sends alerts, and (only if opted in)
 * stops a project. It never schedules or triggers itself; the cron is the only caller,
 * plus the rate-limited manual refresh.
 */
export async function runSync(env: Env, opts: { forceInventory?: boolean } = {}): Promise<string> {
  if (!env.CF_READ_TOKEN) return "skipped: CF_READ_TOKEN not set";
  if (!(await acquireLock(env.DB, "sync", LOCK_TTL_MS))) return "skipped: already running";
  try {
    const cf = cfClient(env.CF_READ_TOKEN);
    const now = new Date();

    let inv = (await getKv<Inventory>(env.DB, "inventory"))?.value;
    const invAge = inv ? now.getTime() - Date.parse(inv.at) : Infinity;
    if (!inv || opts.forceInventory || invAge > INVENTORY_MAX_AGE_MS) {
      inv = await fetchInventory(cf, env.ACCOUNT_ID);
      const sec = await fetchSecurityState(cf, inv);
      await setKv(env.DB, "inventory", inv);
      await setKv(env.DB, "findings", evaluate(inv, sec) satisfies Finding[]);
    }

    const { usage, errors } = await fetchUsage(cf, inv);
    const net = estimateCosts(usage);
    const gross = Object.fromEntries(Object.entries(usage).map(([k, u]) => [k, grossCost(u)]));
    await setKv(env.DB, "usage", { at: now.toISOString(), usage, net, gross, errors } satisfies UsageSnapshot);

    // Per-project totals → samples.
    const projects = groupProjects(inv.resources, await getOverrides(env.DB));
    const sum = (m: Record<string, number>, keys: string[]) => keys.reduce((t, k) => t + (m[k] ?? 0), 0);
    const totals = projects.map((p) => ({ p, gross: sum(gross, p.resources), net: sum(net, p.resources) }));
    totals.push({ p: { id: "*", name: "Account", apps: [], resources: [] }, gross: sum(gross, Object.keys(gross)), net: sum(net, Object.keys(net)) + BASE_PLAN_USD });

    const at = now.toISOString();
    await env.DB.batch([
      ...totals.map((t) => env.DB.prepare("INSERT OR REPLACE INTO samples (at, project, gross, net) VALUES (?, ?, ?, ?)").bind(at, t.p.id, t.gross, t.net)),
      env.DB.prepare("DELETE FROM samples WHERE at < ?").bind(new Date(now.getTime() - 35 * 86400_000).toISOString()),
    ]);

    // Checks.
    const budgets = await getBudgets(env.DB);
    const stops = await getStops(env.DB);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
    const dayStart = at.slice(0, 10);
    let alerts = 0;

    for (const { p, gross: g, net: n } of totals) {
      const { results: samples } = await env.DB.prepare("SELECT at, gross FROM samples WHERE project = ? AND at >= ? ORDER BY at")
        .bind(p.id, weekAgo > monthStart ? weekAgo : monthStart)
        .all<{ at: string; gross: number }>();
      const b = budgets[p.id];
      const breaches: { kind: string; msg: string; stop: boolean }[] = [];

      const spike = detectSpike(samples, now);
      if (spike && spike.lastHour >= SPIKE_MIN_USD_PER_HOUR && spike.lastHour >= SPIKE_MULTIPLIER * Math.max(spike.baseline, 0.01)) {
        breaches.push({ kind: "spike", msg: `🚨 ${p.name}: $${spike.lastHour.toFixed(2)}/h, ${Math.round(spike.lastHour / Math.max(spike.baseline, 0.01))}× normal`, stop: true });
      }
      if (b?.daily) {
        const startOfDay = samples.find((s) => s.at >= dayStart);
        const today = startOfDay ? g - startOfDay.gross : 0;
        if (today >= b.daily) breaches.push({ kind: "daily", msg: `🚨 ${p.name}: $${today.toFixed(2)} today, cap $${b.daily}`, stop: true });
      }
      if (b?.monthly) {
        const proj = p.id === "*" ? projectMonthEnd(n - BASE_PLAN_USD, now) + BASE_PLAN_USD : projectMonthEnd(n, now);
        if (n >= b.monthly) breaches.push({ kind: "monthly100", msg: `🚨 ${p.name}: $${n.toFixed(2)} this month, budget $${b.monthly}`, stop: true });
        else if (proj >= b.monthly * 0.8) breaches.push({ kind: "monthly80", msg: `⚠️ ${p.name}: heading for $${proj.toFixed(2)}, budget $${b.monthly}`, stop: false });
      }

      for (const br of breaches) {
        if (alerts >= MAX_ALERTS_PER_RUN) break;
        const fresh = await env.DB.prepare("INSERT OR IGNORE INTO alerts (key, at, message) VALUES (?, ?, ?)")
          .bind(`${p.id}:${br.kind}:${dayStart}`, at, br.msg)
          .run();
        if (fresh.meta.changes !== 1) continue; // already alerted today
        alerts++;
        let msg = br.msg;
        if (br.stop && b?.autostop && p.id !== "*" && !stops[p.id]) {
          const scripts = p.apps.filter((k) => k.startsWith("worker:")).map((k) => k.slice(7));
          try {
            await stopProject(env, inv, p.id, scripts, br.kind);
            msg += " · auto-stopped";
          } catch (e) {
            msg += ` · auto-stop failed: ${e instanceof Error ? e.message : e}`;
          }
        }
        await notify(env, msg, p.id);
      }
    }
    return `ok: ${cf.calls} API calls, ${alerts} alerts`;
  } finally {
    await releaseLock(env.DB, "sync");
  }
}

/**
 * Slack-compatible webhook. One attempt, no retry: a missed alert is still in D1 and on the dashboard.
 * Links to the page with the Stop button; the link itself never stops anything (Slack prefetches links).
 */
export async function notify(env: Env, text: string, project: string): Promise<boolean> {
  if (!env.ALERT_WEBHOOK_URL) return false;
  const url = env.APP_URL && (project === "*" ? `${env.APP_URL}/settings#emergency` : `${env.APP_URL}/projects/${project}`);
  const body = url ? `${text}\n<${url}|Open dashboard · Stop>` : text;
  const res = await fetch(env.ALERT_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: body }) }).catch(() => null);
  return !!res?.ok;
}
