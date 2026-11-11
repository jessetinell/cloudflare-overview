import { APP_KINDS, type Project, type Resource } from "./types";

export const UNASSIGNED = "unassigned";

/**
 * Groups apps (Workers/Pages) that are connected through service bindings or a shared
 * resource into one project. Resources nothing binds to land in "unassigned".
 * `overrides` (resource key → project name) win over everything.
 */
export function groupProjects(resources: Resource[], overrides: Record<string, string> = {}): Project[] {
  const apps = resources.filter((r) => APP_KINDS.includes(r.kind));
  const parent = new Map(apps.map((a) => [a.key, a.key]));
  const find = (k: string): string => {
    let p = parent.get(k)!;
    while (p !== parent.get(p)) p = parent.get(p)!;
    parent.set(k, p);
    return p;
  };
  const union = (a: string, b: string) => {
    if (overrides[a] || overrides[b]) return; // manually placed apps don't drag others along
    parent.set(find(a), find(b));
  };

  const firstUser = new Map<string, string>();
  for (const app of apps) {
    for (const k of app.uses ?? []) {
      if (parent.has(k)) union(app.key, k); // service binding to another app
      else if (k === "ai:workers-ai" || k.startsWith("other:")) continue; // account-wide / binding types, not resources
      else if (firstUser.has(k)) union(app.key, firstUser.get(k)!);
      else firstUser.set(k, app.key);
    }
  }

  const byName = new Map<string, Project>();
  const get = (name: string) => {
    if (!byName.has(name)) byName.set(name, { id: slug(name), name, apps: [], resources: [] });
    return byName.get(name)!;
  };

  const groups = new Map<string, Resource[]>();
  for (const a of apps) {
    const root = overrides[a.key] ? `o:${overrides[a.key]}` : find(a.key);
    groups.set(root, [...(groups.get(root) ?? []), a]);
  }
  const owner = new Map<string, string>();
  for (const [root, members] of groups) {
    const name = root.startsWith("o:") ? root.slice(2) : projectName(members.map((m) => m.name));
    const p = get(name);
    for (const m of members) {
      p.apps.push(m.key);
      p.resources.push(m.key);
      owner.set(m.key, name);
    }
    // shortcut: a resource shared by several projects (incl. Workers AI) is billed to the first one; move it in Settings if that's wrong.
    for (const m of members) for (const k of m.uses ?? []) if (!owner.has(k) && !parent.has(k)) owner.set(k, name);
  }

  for (const r of resources) {
    if (APP_KINDS.includes(r.kind) || r.kind === "zone") continue;
    const name = overrides[r.key] ?? owner.get(r.key) ?? UNASSIGNED;
    const p = get(name);
    if (!p.resources.includes(r.key)) p.resources.push(r.key);
  }

  return [...byName.values()].sort((a, b) => Number(a.id === UNASSIGNED) - Number(b.id === UNASSIGNED) || a.name.localeCompare(b.name));
}

/** "acme-api", "acme-web" → "acme". Falls back to the first name. */
export function projectName(names: string[]): string {
  const sorted = [...names].sort();
  if (sorted.length === 1) return sorted[0];
  const parts = sorted.map((n) => n.split(/[-_.]/));
  const common: string[] = [];
  for (let i = 0; parts.every((p) => i < p.length - 1 && p[i] === parts[0][i]); i++) common.push(parts[0][i]);
  return common.length ? common.join("-") : sorted[0];
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";

/** Service-binding cycles between apps (incl. self-bindings): the "A calls B calls A" loop risk. */
export function findCycles(resources: Resource[]): string[][] {
  const apps = new Map(resources.filter((r) => APP_KINDS.includes(r.kind)).map((r) => [r.key, r]));
  const edges = (k: string) => (apps.get(k)?.uses ?? []).filter((u) => apps.has(u));
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const state = new Map<string, "open" | "done">();
  const stack: string[] = [];

  const visit = (k: string) => {
    state.set(k, "open");
    stack.push(k);
    for (const n of edges(k)) {
      if (state.get(n) === "open") {
        const cycle = stack.slice(stack.indexOf(n));
        const id = [...cycle].sort().join(">");
        if (!seen.has(id)) {
          seen.add(id);
          cycles.push(cycle);
        }
      } else if (!state.has(n)) visit(n);
    }
    stack.pop();
    state.set(k, "done");
  };
  for (const k of apps.keys()) if (!state.has(k)) visit(k);
  return cycles;
}
