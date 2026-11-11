import { getCloudflareContext } from "@opennextjs/cloudflare";
import { type Budget, getBudgets, getKv, getOverrides, getStops } from "./db";
import { BASE_PLAN_USD, projectMonthEnd } from "./pricing";
import { groupProjects } from "./projects";
import type { UsageSnapshot } from "./sync";
import type { Finding, Inventory, Project, Resource } from "./types";

export type Status = "ok" | "warn" | "over" | "stopped";

export interface ProjectView extends Omit<Project, "resources"> {
  resources: Resource[];
  net: number;
  projected: number;
  status: Status;
  budget?: Budget;
  stoppedAt?: string;
  spark: number[];
  findings: number;
}

export const env = () => getCloudflareContext().env;

export async function loadDashboard() {
  const e = env();
  const db = e.DB;
  const [inv, usage, findings, budgets, overrides, stops, sparkRows] = await Promise.all([
    getKv<Inventory>(db, "inventory"),
    getKv<UsageSnapshot>(db, "usage"),
    getKv<Finding[]>(db, "findings"),
    getBudgets(db),
    getOverrides(db),
    getStops(db),
    // Daily max of month-to-date gross per project → daily spend for the sparkline.
    db
      .prepare("SELECT project, substr(at, 1, 10) AS day, MAX(gross) AS g FROM samples WHERE at >= ? GROUP BY project, day ORDER BY day")
      .bind(new Date(Date.now() - 15 * 86400_000).toISOString())
      .all<{ project: string; day: string; g: number }>(),
  ]);

  const resources = inv?.value.resources ?? [];
  const byKey = new Map(resources.map((r) => [r.key, r]));
  const net = usage?.value.net ?? {};
  const allFindings = findings?.value ?? [];

  const spark = (id: string) => {
    const rows = sparkRows.results.filter((r) => r.project === id);
    // MTD resets on the 1st: a drop means a new month, so that day's value is the spend.
    return rows.map((r, i) => (i === 0 ? 0 : Math.max(0, r.g >= rows[i - 1].g ? r.g - rows[i - 1].g : r.g)));
  };

  const projects: ProjectView[] = groupProjects(resources, overrides).map((p) => {
    const rs = p.resources.map((k) => byKey.get(k)).filter((r): r is Resource => !!r);
    const pNet = p.resources.reduce((t, k) => t + (net[k] ?? 0), 0);
    const projected = projectMonthEnd(pNet);
    const budget = budgets[p.id];
    const names = new Set(rs.map((r) => r.name));
    const findingCount = allFindings.filter((f) => f.severity === "high" && f.target.split(/[ ,→⇄]+/).some((t) => names.has(t))).length;
    const status: Status = stops[p.id]
      ? "stopped"
      : budget?.monthly && pNet >= budget.monthly
        ? "over"
        : (budget?.monthly && projected >= budget.monthly * 0.8) || findingCount
          ? "warn"
          : "ok";
    return { ...p, resources: rs, net: pNet, projected, status, budget, stoppedAt: stops[p.id]?.at, spark: spark(p.id), findings: findingCount };
  });

  // Account totals include the Workers Paid base fee; project totals don't.
  const usageTotal = Object.values(net).reduce((a, b) => a + b, 0);
  return {
    accountId: inv?.value.accountId ?? e.ACCOUNT_ID,
    syncedAt: usage?.at ?? null,
    inventoryAt: inv?.value.at ?? null,
    resources,
    projects,
    findings: allFindings,
    usage: usage?.value,
    total: usageTotal + BASE_PLAN_USD,
    projected: projectMonthEnd(usageTotal) + BASE_PLAN_USD,
    overrides,
    accountBudget: budgets["*"],
    errors: [...(inv?.value.errors ?? []), ...(usage?.value.errors ?? [])],
  };
}

export type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;
