import { type Cf, soft } from "./cf";
import { accountLinks, dashLink } from "./links";
import { findCycles } from "./projects";
import type { Finding, Inventory, Resource } from "./types";

const SECRETISH = /(KEY|SECRET|TOKEN|PASSWORD|PASS|PRIVATE|CREDENTIAL)/i;

/** Extra account/zone state the rules need. Fetched hourly together with the inventory. */
export interface SecurityState {
  tokens: any[];
  members: any[];
  zoneSettings: Record<string, Record<string, any>>;
  dnssec: Record<string, string>;
  publicBuckets: string[];
  billingAlerts: boolean | null;
}

export async function fetchSecurityState(cf: Cf, inv: Inventory): Promise<SecurityState> {
  const a = `/accounts/${inv.accountId}`;
  const errors = inv.errors;
  const zones = inv.resources.filter((r) => r.kind === "zone");
  const buckets = inv.resources.filter((r) => r.kind === "r2");

  const [tokens, members, policies] = await Promise.all([
    soft(cf.list(`${a}/tokens`, 50), [] as any[], errors),
    soft(cf.list(`${a}/members`, 50), [] as any[], errors),
    soft(cf.get<any[]>(`${a}/alerting/v3/policies`), null, errors),
  ]);

  const zoneSettings: SecurityState["zoneSettings"] = {};
  const dnssec: SecurityState["dnssec"] = {};
  for (const z of zones) {
    zoneSettings[z.id] = {};
    for (const id of ["ssl", "min_tls_version", "always_use_https"]) {
      zoneSettings[z.id][id] = (await soft(cf.get<any>(`/zones/${z.id}/settings/${id}`), null, errors))?.value;
    }
    dnssec[z.id] = (await soft(cf.get<any>(`/zones/${z.id}/dnssec`), null, errors))?.status ?? "unknown";
  }

  const publicBuckets: string[] = [];
  for (const b of buckets) {
    const m = await soft(cf.get<any>(`${a}/r2/buckets/${b.name}/domains/managed`), null, errors);
    if (m?.enabled) publicBuckets.push(b.name);
  }

  return {
    tokens,
    members,
    zoneSettings,
    dnssec,
    publicBuckets,
    billingAlerts: policies ? policies.some((p) => p.enabled !== false && p.alert_type === "billing_usage_alert") : null,
  };
}

/** Pure rules: inventory + state → findings. */
export function evaluate(inv: Inventory, s: SecurityState): Finding[] {
  const acct = inv.accountId;
  const links = accountLinks(acct);
  const out: Finding[] = [];
  const add = (f: Omit<Finding, "id">) => out.push({ ...f, id: `${f.area}:${f.title}:${f.target}` });
  const apps = inv.resources.filter((r) => r.kind === "worker" || r.kind === "pages");
  const link = (r: Resource) => dashLink(acct, r);

  // --- Cost risk (COST_CAUTION.md loop patterns) ---
  if (s.billingAlerts === false) add({ area: "cost", severity: "high", title: "No billing alert set", target: "Account", link: links.notifications });

  for (const cycle of findCycles(inv.resources)) {
    const names = cycle.map((k) => k.split(":")[1]);
    // A self-binding is normal (e.g. OpenNext's WORKER_SELF_REFERENCE); a loop between Workers is not.
    if (names.length === 1) add({ area: "cost", severity: "low", title: "Worker binds to itself", target: names[0] });
    else add({ area: "cost", severity: "high", title: "Service binding loop", target: [...names, names[0]].join(" → ") });
  }

  for (const q of inv.resources.filter((r) => r.kind === "queue")) {
    const producers: string[] = q.meta?.producers ?? [];
    for (const c of q.meta?.consumers ?? []) {
      if (c.script && producers.includes(c.script)) add({ area: "cost", severity: "high", title: "Queue feeds itself", target: `${c.script} ⇄ ${q.name}`, link: link(q) });
      if (!c.dlq) add({ area: "cost", severity: "low", title: "Queue without dead-letter queue", target: q.name, link: link(q) });
      if (c.maxRetries === undefined || c.maxRetries > 3) add({ area: "cost", severity: "medium", title: "Queue retries above 3", target: q.name, link: link(q) });
    }
  }

  for (const g of inv.resources.filter((r) => r.kind === "aigateway")) {
    if (!g.meta?.rateLimit) add({ area: "cost", severity: "medium", title: "AI Gateway without rate limit", target: g.name, link: link(g) });
  }
  const aiUsers = apps.filter((a) => a.uses?.includes("ai:workers-ai"));
  if (aiUsers.length && !inv.resources.some((r) => r.kind === "aigateway" && r.meta?.rateLimit)) {
    add({ area: "cost", severity: "medium", title: "Workers AI without a rate-limited gateway", target: aiUsers.map((a) => a.name).join(", "), link: links.aiGateway });
  }

  // --- Security ---
  for (const t of s.tokens) {
    if (t.status !== "active") continue;
    if (!t.expires_on) add({ area: "security", severity: "medium", title: "API token never expires", target: t.name, link: links.accountTokens });
    if (!t.condition?.request_ip?.in?.length) add({ area: "security", severity: "low", title: "API token not IP-restricted", target: t.name, link: links.accountTokens });
  }

  for (const m of s.members) {
    const u = m.user ?? {};
    if (u.two_factor_authentication_enabled === false) add({ area: "security", severity: "high", title: "Member without 2FA", target: u.email ?? m.id, link: links.members });
  }

  for (const z of inv.resources.filter((r) => r.kind === "zone")) {
    const st = s.zoneSettings[z.id] ?? {};
    const l = link(z);
    if (st.ssl && st.ssl !== "strict") add({ area: "security", severity: st.ssl === "full" ? "medium" : "high", title: `SSL mode "${st.ssl}"`, target: z.name, link: l });
    if (st.min_tls_version && st.min_tls_version < "1.2") add({ area: "security", severity: "medium", title: `Min TLS ${st.min_tls_version}`, target: z.name, link: l });
    if (st.always_use_https === "off") add({ area: "security", severity: "medium", title: "Always HTTPS off", target: z.name, link: l });
    if (s.dnssec[z.id] && s.dnssec[z.id] !== "active") add({ area: "security", severity: "low", title: "DNSSEC off", target: z.name, link: l });
  }

  for (const b of s.publicBuckets) add({ area: "security", severity: "high", title: "Public r2.dev bucket", target: b, link: dashLink(acct, { kind: "r2", id: b, name: b }) });

  for (const a of apps) {
    for (const v of a.vars ?? []) if (v.plain && SECRETISH.test(v.name)) add({ area: "security", severity: "high", title: `Secret in plain text: ${v.name}`, target: a.name, link: link(a) });
    for (const k of a.uses ?? []) {
      if (!k.startsWith("other:") && !k.startsWith("ai:") && !inv.resources.some((r) => r.key === k))
        add({ area: "security", severity: "low", title: "Bound to missing resource", target: `${a.name} → ${k}`, link: link(a) });
    }
    if (a.kind === "worker" && a.workersDev) add({ area: "security", severity: "low", title: "Public on workers.dev", target: a.name, link: link(a) });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((x, y) => rank[x.severity] - rank[y.severity]);
}
