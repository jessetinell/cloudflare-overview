import type { Resource } from "./types";

// shortcut: dashboard URLs are not a stable API; if one 404s, the product list page is one click away.
const DASH = "https://dash.cloudflare.com";

export function dashLink(account: string, r: Pick<Resource, "kind" | "id" | "name" | "meta">): string {
  const a = `${DASH}/${account}`;
  const e = encodeURIComponent;
  switch (r.kind) {
    case "worker":
      return `${a}/workers/services/view/${e(r.name)}/production`;
    case "pages":
      return `${a}/pages/view/${e(r.name)}`;
    case "d1":
      return `${a}/workers/d1/databases/${e(r.id)}`;
    case "kv":
      return `${a}/workers/kv/namespaces/${e(r.id)}`;
    case "r2":
      return `${a}/r2/default/buckets/${e(r.name)}`;
    case "queue":
      return `${a}/workers/queues/view/${e(r.meta?.queueId ?? r.id)}`;
    case "do":
      return `${a}/workers/durable-objects`;
    case "vectorize":
      return `${a}/ai/vectorize/${e(r.name)}`;
    case "hyperdrive":
      return `${a}/workers/hyperdrive/${e(r.id)}`;
    case "ai":
      return `${a}/ai/workers-ai`;
    case "aigateway":
      return `${a}/ai/ai-gateway/${e(r.id)}`;
    case "zone":
      return `${a}/${e(r.name)}`;
    default:
      return `${a}/workers-and-pages`;
  }
}

export const accountLinks = (account: string) => ({
  billing: `${DASH}/${account}/billing`,
  notifications: `${DASH}/${account}/notifications`,
  tokens: `${DASH}/profile/api-tokens`,
  accountTokens: `${DASH}/${account}/api-tokens`,
  members: `${DASH}/${account}/members`,
  aiGateway: `${DASH}/${account}/ai/ai-gateway`,
});
