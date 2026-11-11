import { type Cf, soft } from "./cf";
import { kvId } from "./inventory";
import type { Inventory, Usage } from "./types";

// Month-to-date usage per resource from the GraphQL Analytics API. One query per product,
// each allowed to fail on its own (product not enabled, dataset/field drift), so the
// dashboard degrades to "usage n/a" instead of breaking.
// shortcut: field names below come from docs + a schema mirror; verify with introspection if a product shows n/a.

const GB = 1024 ** 3;

const wrap = (body: string) => `query($a: String!, $s: Time!, $e: Time!, $sd: Date!, $ed: Date!) {
  viewer { accounts(filter: { accountTag: $a }) { ${body} } } }`;

export async function fetchUsage(cf: Cf, inv: Inventory): Promise<{ usage: Usage; errors: string[] }> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const vars = { a: inv.accountId, s: start.toISOString(), e: now.toISOString(), sd: start.toISOString().slice(0, 10), ed: now.toISOString().slice(0, 10) };
  const errors: string[] = [];
  const usage: Usage = {};
  const put = (key: string, metric: string, v: number) => {
    if (!v || metric === "r2Free" || /:(__unknown__)?$/.test(key)) return; // unattributed rows
    usage[key] ??= {};
    usage[key][metric] = (usage[key][metric] ?? 0) + v;
  };
  const q = async (body: string) => (await soft(cf.graphql<any>(wrap(body), vars), null, errors))?.viewer?.accounts?.[0];

  const byId = (kind: string, field: "id" | "queueId") =>
    new Map(inv.resources.filter((r) => r.kind === kind).map((r) => [field === "id" ? r.id : r.meta?.queueId, r.key]));
  const doIds = byId("do", "id");
  const queueIds = byId("queue", "queueId");

  const [workers, d1, d1s, r2, r2s, kv, kvs, ai, dos, queues] = await Promise.all([
    // sum.cpuTimeUs is not in the official tutorial; fall back to p50 × requests if it's rejected.
    q(`w: workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $s, datetime_leq: $e }) { sum { requests cpuTimeUs } dimensions { scriptName } }`).then(
      (r) => r ?? q(`w: workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $s, datetime_leq: $e }) { sum { requests } quantiles { cpuTimeP50 } dimensions { scriptName } }`),
    ),
    q(`d: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $sd, date_leq: $ed }) { sum { rowsRead rowsWritten } dimensions { databaseId } }`),
    q(`d: d1StorageAdaptiveGroups(limit: 10000, filter: { date_geq: $sd, date_leq: $ed }) { max { databaseSizeBytes } dimensions { databaseId } }`),
    q(`r: r2OperationsAdaptiveGroups(limit: 10000, filter: { datetime_geq: $s, datetime_leq: $e }) { sum { requests } dimensions { bucketName actionType } }`),
    q(`r: r2StorageAdaptiveGroups(limit: 10000, filter: { datetime_geq: $s, datetime_leq: $e }) { max { payloadSize metadataSize } dimensions { bucketName } }`),
    q(`k: kvOperationsAdaptiveGroups(limit: 10000, filter: { date_geq: $sd, date_leq: $ed }) { sum { requests } dimensions { namespaceId actionType } }`),
    q(`k: kvStorageAdaptiveGroups(limit: 10000, filter: { date_geq: $sd, date_leq: $ed }) { max { byteCount } dimensions { namespaceId } }`),
    q(`a: aiInferenceAdaptiveGroups(limit: 10000, filter: { date_geq: $sd, date_leq: $ed }) { sum { totalNeurons } }`),
    q(`o: durableObjectsInvocationsAdaptiveGroups(limit: 10000, filter: { date_geq: $sd, date_leq: $ed }) { sum { requests } dimensions { namespaceId } }`),
    q(`q: queueMessageOperationsAdaptiveGroups(limit: 10000, filter: { datetime_geq: $s, datetime_leq: $e }) { sum { billableOperations } dimensions { queueId } }`),
  ]);

  for (const g of workers?.w ?? []) {
    const key = `worker:${g.dimensions.scriptName}`;
    put(key, "workerRequests", g.sum.requests);
    // shortcut: when only the p50 is available, CPU ms ≈ requests × p50 (µs). Understates heavy tails.
    put(key, "workerCpuMs", g.sum.cpuTimeUs != null ? g.sum.cpuTimeUs / 1000 : (g.sum.requests * (g.quantiles?.cpuTimeP50 ?? 0)) / 1000);
  }
  for (const g of d1?.d ?? []) {
    put(`d1:${g.dimensions.databaseId}`, "d1RowsRead", g.sum.rowsRead);
    put(`d1:${g.dimensions.databaseId}`, "d1RowsWritten", g.sum.rowsWritten);
  }
  // shortcut: storage is billed as average GB-month; we use the month's max size (slight overestimate).
  for (const g of d1s?.d ?? []) put(`d1:${g.dimensions.databaseId}`, "d1StorageGb", g.max.databaseSizeBytes / GB);
  for (const g of r2?.r ?? []) put(`r2:${g.dimensions.bucketName}`, r2Class(g.dimensions.actionType), g.sum.requests);
  for (const g of r2s?.r ?? []) put(`r2:${g.dimensions.bucketName}`, "r2StorageGb", (g.max.payloadSize + g.max.metadataSize) / GB);
  for (const g of kv?.k ?? []) put(`kv:${kvId(g.dimensions.namespaceId)}`, g.dimensions.actionType === "read" ? "kvReads" : "kvWrites", g.sum.requests);
  for (const g of kvs?.k ?? []) put(`kv:${kvId(g.dimensions.namespaceId)}`, "kvStorageGb", g.max.byteCount / GB);
  // Workers AI has no per-script dimension: it is one account-wide line.
  for (const g of ai?.a ?? []) put("ai:workers-ai", "aiNeurons", g.sum.totalNeurons);
  // shortcut: DO duration (GB-s) is not fetched; only requests. Add durableObjectsPeriodicGroups once its fields are verified.
  for (const g of dos?.o ?? []) put(doIds.get(g.dimensions.namespaceId) ?? `do:${g.dimensions.namespaceId}`, "doRequests", g.sum.requests);
  for (const g of queues?.q ?? []) put(queueIds.get(g.dimensions.queueId) ?? `queue:${g.dimensions.queueId}`, "queueOps", g.sum.billableOperations);

  return { usage, errors };
}

/** R2 action → pricing class. Deletes are free. */
export function r2Class(action: string): "r2ClassA" | "r2ClassB" | "r2Free" {
  if (/^Delete|^AbortMultipartUpload/.test(action)) return "r2Free";
  if (/^(Get|Head)|UsageSummary/.test(action)) return "r2ClassB";
  return "r2ClassA";
}
