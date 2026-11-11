import type { Usage } from "./types";

// shortcut: static Workers Paid list prices; re-check against developers.cloudflare.com
// pricing pages when PRICING_AS_OF is older than a quarter, or switch if CF ships a per-resource billing API.
export const PRICING_AS_OF = "2026-11";
export const BASE_PLAN_USD = 5;

/** metric → [included per month, USD per unit above that]. Units are in the metric name. */
export const PRICES: Record<string, { included: number; perUnit: number; label: string }> = {
  workerRequests: { included: 10e6, perUnit: 0.3 / 1e6, label: "requests" },
  workerCpuMs: { included: 30e6, perUnit: 0.02 / 1e6, label: "CPU ms" },
  d1RowsRead: { included: 25e9, perUnit: 0.001 / 1e6, label: "rows read" },
  d1RowsWritten: { included: 50e6, perUnit: 1 / 1e6, label: "rows written" },
  d1StorageGb: { included: 5, perUnit: 0.75, label: "GB stored" },
  r2StorageGb: { included: 10, perUnit: 0.015, label: "GB stored" },
  r2ClassA: { included: 1e6, perUnit: 4.5 / 1e6, label: "class A ops" },
  r2ClassB: { included: 10e6, perUnit: 0.36 / 1e6, label: "class B ops" },
  kvReads: { included: 10e6, perUnit: 0.5 / 1e6, label: "reads" },
  kvWrites: { included: 1e6, perUnit: 5 / 1e6, label: "writes" },
  kvStorageGb: { included: 1, perUnit: 0.5, label: "GB stored" },
  // shortcut: the 10k neurons/day allowance is approximated as 30 days' worth per month.
  aiNeurons: { included: 10_000 * 30, perUnit: 0.011 / 1000, label: "neurons" },
  doRequests: { included: 1e6, perUnit: 0.15 / 1e6, label: "requests" },
  doGbSeconds: { included: 400_000, perUnit: 12.5 / 1e6, label: "GB-s" },
  queueOps: { included: 1e6, perUnit: 0.4 / 1e6, label: "operations" },
};

/** Gross cost for one resource: list price with no allowance. Used for spike detection. */
export function grossCost(u: Partial<Record<string, number>>): number {
  let usd = 0;
  for (const [m, v] of Object.entries(u)) if (PRICES[m] && v) usd += v * PRICES[m].perUnit;
  return usd;
}

/**
 * Net month-to-date cost per resource. The plan's included amount for each metric is
 * account-wide, so the billable remainder is split across resources in proportion to usage.
 */
export function estimateCosts(usage: Usage): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const u of Object.values(usage)) for (const [m, v] of Object.entries(u)) totals[m] = (totals[m] ?? 0) + (v ?? 0);

  const out: Record<string, number> = {};
  for (const [key, u] of Object.entries(usage)) {
    let usd = 0;
    for (const [m, v] of Object.entries(u)) {
      const p = PRICES[m];
      if (!p || !v || !totals[m]) continue;
      const billable = Math.max(0, totals[m] - p.included) * p.perUnit;
      usd += billable * (v / totals[m]);
    }
    out[key] = usd;
  }
  return out;
}

/** Straight-line projection of a month-to-date figure to month end. */
export function projectMonthEnd(mtd: number, now = new Date()): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const elapsed = Math.max(now.getTime() - start, 3600_000); // avoid wild projections in hour one
  return (mtd * (end - start)) / elapsed;
}
