// Cloudflare API client. Every call is bounded (COST_CAUTION.md rules 3, 4):
// max 2 attempts, one retry layer, hard stop on 401/403/429, and a per-run call budget.

const API = "https://api.cloudflare.com/client/v4";
export const MAX_CALLS_PER_RUN = 1000;
export const MAX_PAGES = 50;

export class CfError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** One client per run. The call budget is shared by everything that uses it. */
export function cfClient(token: string, budget = MAX_CALLS_PER_RUN) {
  let calls = 0;

  async function raw(path: string, init: RequestInit = {}): Promise<any> {
    for (let attempt = 1; ; attempt++) {
      if (++calls > budget) throw new CfError(0, `call budget of ${budget} exhausted`);
      const res = await fetch(API + path, {
        ...init,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
      });
      // Auth/rate-limit errors are final: never loop on them.
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        throw new CfError(res.status, `${init.method ?? "GET"} ${path} → ${res.status}`);
      }
      if (res.status >= 500 && attempt < 2) continue;
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) {
        const msg = body.errors?.[0]?.message ?? res.statusText;
        throw new CfError(res.status, `${init.method ?? "GET"} ${path} → ${res.status} ${msg}`);
      }
      return body;
    }
  }

  return {
    get calls() {
      return calls;
    },
    raw,
    async get<T = any>(path: string): Promise<T> {
      return (await raw(path)).result as T;
    },
    /** Follows page-based pagination with a hard page cap. */
    async list<T = any>(path: string, perPage = 100): Promise<T[]> {
      const out: T[] = [];
      const sep = path.includes("?") ? "&" : "?";
      for (let page = 1; page <= MAX_PAGES; page++) {
        const body = await raw(`${path}${sep}page=${page}&per_page=${perPage}`);
        const items: T[] = Array.isArray(body.result) ? body.result : (body.result?.buckets ?? []);
        out.push(...items);
        const info = body.result_info;
        if (!info || items.length < perPage || (info.total_pages && page >= info.total_pages)) break;
      }
      return out;
    },
    async send(method: string, path: string, data?: unknown) {
      return raw(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });
    },
    async graphql<T = any>(query: string, variables: Record<string, unknown>): Promise<T> {
      const body = await raw("/graphql", { method: "POST", body: JSON.stringify({ query, variables }) });
      if (body.errors?.length) throw new CfError(200, `graphql: ${body.errors[0].message}`);
      return body.data as T;
    },
  };
}

export type Cf = ReturnType<typeof cfClient>;

/** Run a call that may legitimately fail (missing permission, product not enabled). */
export async function soft<T>(p: Promise<T>, fallback: T, errors?: string[]): Promise<T> {
  try {
    return await p;
  } catch (e) {
    errors?.push(e instanceof Error ? e.message : String(e));
    if (e instanceof CfError && (e.status === 429 || e.status === 0)) throw e; // budget/rate limit: stop the run
    return fallback;
  }
}
