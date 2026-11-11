import { type Cf, soft } from "./cf";
import type { Inventory, Resource } from "./types";

// Hard cap on everything we enumerate (COST_CAUTION.md rule 4).
export const MAX_RESOURCES = 500;

/** KV ids come with and without dashes depending on the API; normalize to no dashes. */
export const kvId = (id: string) => String(id).replace(/-/g, "");

const doKey = (script: string, cls: string) => `do:${script}/${cls}`;

/** Maps one Workers binding to the resource key it points at. `self` = the script's own name. */
export function bindingKey(b: any, self: string): string | null {
  switch (b.type) {
    case "d1":
      return `d1:${b.id ?? b.database_id}`;
    case "kv_namespace":
      return `kv:${kvId(b.namespace_id)}`;
    case "r2_bucket":
      return `r2:${b.bucket_name}`;
    case "queue":
      return `queue:${b.queue_name}`;
    case "durable_object_namespace":
      return doKey(b.script_name || self, b.class_name);
    case "vectorize":
      return `vectorize:${b.index_name}`;
    case "hyperdrive":
      return `hyperdrive:${b.id}`;
    case "ai":
      return "ai:workers-ai";
    case "service":
      return `worker:${b.service}`;
    case "plain_text":
    case "secret_text":
    case "json":
    case "secret_key":
      return null;
    default:
      return b.type ? `other:${b.type}` : null;
  }
}

/** Same mapping for a Pages project's production deployment config. */
export function pagesBindingKeys(cfg: any): string[] {
  if (!cfg) return [];
  const keys: string[] = [];
  const each = (o: any, f: (v: any) => string | null) =>
    Object.values(o ?? {}).forEach((v) => {
      const k = f(v);
      if (k) keys.push(k);
    });
  each(cfg.d1_databases, (v) => `d1:${v.id}`);
  each(cfg.kv_namespaces, (v) => `kv:${kvId(v.namespace_id)}`);
  each(cfg.r2_buckets, (v) => `r2:${v.name}`);
  each(cfg.queue_producers, (v) => `queue:${v.name}`);
  each(cfg.services, (v) => `worker:${v.service}`);
  each(cfg.vectorize_bindings, (v) => `vectorize:${v.index_name}`);
  each(cfg.hyperdrive_bindings, (v) => `hyperdrive:${v.id}`);
  // Pages DO bindings only carry the namespace id; resolved to a do: key in fetchInventory.
  each(cfg.durable_object_namespaces, (v) => (v.namespace_id ? `doid:${v.namespace_id}` : null));
  if (cfg.ai_bindings && Object.keys(cfg.ai_bindings).length) keys.push("ai:workers-ai");
  return keys;
}

export async function fetchInventory(cf: Cf, accountId: string): Promise<Inventory> {
  const errors: string[] = [];
  const a = `/accounts/${accountId}`;
  const s = <T>(p: Promise<T[]>) => soft(p, [] as T[], errors);

  const [scripts, pages, d1, kv, r2, queues, dos, vec, hyper, gateways, zones, domains] = await Promise.all([
    s(cf.get<any[]>(`${a}/workers/scripts`)),
    s(cf.list(`${a}/pages/projects`, 10)),
    s(cf.list(`${a}/d1/database`)),
    s(cf.list(`${a}/storage/kv/namespaces`)),
    // shortcut: first 1000 buckets only (cursor pagination not followed).
    s<any>(cf.get<any>(`${a}/r2/buckets?per_page=1000`).then((r) => r?.buckets ?? [])),
    s(cf.list(`${a}/queues`)),
    s(cf.list(`${a}/workers/durable_objects/namespaces`)),
    s(cf.list(`${a}/vectorize/v2/indexes`)),
    s(cf.list(`${a}/hyperdrive/configs`)),
    s(cf.list(`${a}/ai-gateway/gateways`, 50)),
    s(cf.list(`/zones?account.id=${accountId}`, 50)),
    s(cf.get<any[]>(`${a}/workers/domains`)),
  ]);

  const res: Resource[] = [];
  const add = (r: Resource) => {
    if (res.length < MAX_RESOURCES) res.push(r);
    else if (!errors.includes("resource cap reached")) errors.push("resource cap reached");
  };

  // Workers: one settings + subdomain + schedules call each. Sequential to stay gentle on rate limits.
  for (const w of scripts.slice(0, MAX_RESOURCES)) {
    const name: string = w.id;
    const settings = await soft(cf.get<any>(`${a}/workers/scripts/${name}/settings`), null, errors);
    const sub = await soft(cf.get<any>(`${a}/workers/scripts/${name}/subdomain`), null, errors);
    const sched = await soft(cf.get<any>(`${a}/workers/scripts/${name}/schedules`), null, errors);
    const bindings: any[] = settings?.bindings ?? [];
    add({
      key: `worker:${name}`,
      kind: "worker",
      name,
      id: name,
      createdAt: w.created_on,
      uses: [...new Set(bindings.map((b) => bindingKey(b, name)).filter((k): k is string => !!k))],
      vars: bindings
        .filter((b) => b.type === "plain_text" || b.type === "secret_text")
        .map((b) => ({ name: b.name, plain: b.type === "plain_text" })),
      domains: [...new Set([...domains.filter((d) => d.service === name).map((d) => d.hostname), ...(w.routes ?? []).map((r: any) => String(r.pattern).replace(/\/\*$/, ""))])],
      workersDev: sub?.enabled ?? undefined,
      crons: (sched?.schedules ?? []).map((x: any) => x.cron),
      meta: { modified: w.modified_on, usageModel: w.usage_model },
    });
  }

  for (const p of pages) {
    const cfg = p.deployment_configs?.production;
    add({
      key: `pages:${p.name}`,
      kind: "pages",
      name: p.name,
      id: p.id ?? p.name,
      createdAt: p.created_on,
      uses: [...new Set(pagesBindingKeys(cfg))],
      vars: Object.entries(cfg?.env_vars ?? {}).map(([n, v]: [string, any]) => ({
        name: n,
        plain: v?.type !== "secret_text",
      })),
      domains: [p.subdomain, ...(p.domains ?? [])].filter(Boolean),
    });
  }

  d1.forEach((x) => add({ key: `d1:${x.uuid}`, kind: "d1", name: x.name, id: x.uuid, createdAt: x.created_at }));
  kv.forEach((x) => add({ key: `kv:${kvId(x.id)}`, kind: "kv", name: x.title, id: x.id }));
  r2.forEach((x) => add({ key: `r2:${x.name}`, kind: "r2", name: x.name, id: x.name, createdAt: x.creation_date }));
  queues.forEach((x) =>
    add({
      key: `queue:${x.queue_name}`,
      kind: "queue",
      name: x.queue_name,
      id: x.queue_name,
      createdAt: x.created_on,
      meta: {
        queueId: x.queue_id,
        paused: !!x.settings?.delivery_paused,
        producers: (x.producers ?? []).map((p: any) => p.script).filter(Boolean),
        consumers: (x.consumers ?? []).map((c: any) => ({
          script: c.script_name ?? c.script,
          maxRetries: c.settings?.max_retries,
          dlq: c.dead_letter_queue || null,
        })),
      },
    }),
  );
  dos.forEach((x) =>
    add({ key: doKey(x.script, x.class), kind: "do", name: x.class ?? x.name, id: x.id, meta: { script: x.script } }),
  );
  vec.forEach((x) => add({ key: `vectorize:${x.name}`, kind: "vectorize", name: x.name, id: x.name, createdAt: x.created_on }));
  hyper.forEach((x) => add({ key: `hyperdrive:${x.id}`, kind: "hyperdrive", name: x.name, id: x.id }));
  gateways.forEach((x) =>
    add({
      key: `aigateway:${x.id}`,
      kind: "aigateway",
      name: x.id,
      id: x.id,
      createdAt: x.created_at,
      meta: { rateLimit: x.rate_limiting_limit ?? null },
    }),
  );
  zones.forEach((x) =>
    add({ key: `zone:${x.id}`, kind: "zone", name: x.name, id: x.id, meta: { plan: x.plan?.name, status: x.status } }),
  );

  // Resolve Pages DO bindings (namespace id) to the DO resource key.
  const doById = new Map(res.filter((r) => r.kind === "do").map((r) => [r.id, r.key]));
  for (const r of res) if (r.uses) r.uses = r.uses.map((k) => (k.startsWith("doid:") ? (doById.get(k.slice(5)) ?? k) : k));

  // Workers AI has no list endpoint; it exists if anything binds it.
  if (res.some((r) => r.uses?.includes("ai:workers-ai"))) {
    add({ key: "ai:workers-ai", kind: "ai", name: "Workers AI", id: "workers-ai" });
  }

  return { accountId, at: new Date().toISOString(), resources: res, errors };
}
