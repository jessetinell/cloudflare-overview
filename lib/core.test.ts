import { describe, expect, it } from "vitest";
import { estimateCosts, projectMonthEnd } from "./pricing";
import { findCycles, groupProjects } from "./projects";
import { selfScript } from "./stop";
import { detectSpike } from "./sync";
import type { Resource } from "./types";

const w = (name: string, uses: string[] = []): Resource => ({ key: `worker:${name}`, kind: "worker", name, id: name, uses });
const r = (key: string): Resource => ({ key, kind: key.split(":")[0] as Resource["kind"], name: key, id: key.split(":")[1] });

describe("estimateCosts", () => {
  it("splits the billable remainder over the included amount by usage share", () => {
    // 30M requests, 10M included → 20M billable × $0.30/M = $6, split 2:1
    const c = estimateCosts({ a: { workerRequests: 20e6 }, b: { workerRequests: 10e6 } });
    expect(c.a).toBeCloseTo(4);
    expect(c.b).toBeCloseTo(2);
  });
  it("is zero within the included amount", () => {
    expect(estimateCosts({ a: { workerRequests: 9e6 } }).a).toBe(0);
  });
});

describe("projectMonthEnd", () => {
  it("extrapolates linearly", () => {
    expect(projectMonthEnd(10, new Date("2026-11-16T00:00:00Z"))).toBeCloseTo(20);
  });
});

describe("groupProjects", () => {
  const resources = [w("acme-api", ["d1:db", "ai:workers-ai", "other:assets"]), w("acme-web", ["worker:acme-api"]), w("blog", ["ai:workers-ai", "other:assets"]), r("d1:db"), r("kv:lost"), r("ai:workers-ai")];
  it("joins apps via service bindings, not via account-wide AI or binding types, and parks orphans", () => {
    const p = groupProjects(resources);
    const acme = p.find((x) => x.name === "acme")!;
    expect(acme.apps.sort()).toEqual(["worker:acme-api", "worker:acme-web"]);
    expect(acme.resources).toContain("d1:db");
    expect(p.find((x) => x.name === "blog")!.apps).toEqual(["worker:blog"]);
    expect(p.find((x) => x.id === "unassigned")!.resources).toContain("kv:lost");
  });
  it("respects overrides", () => {
    const p = groupProjects(resources, { "kv:lost": "blog" });
    expect(p.find((x) => x.name === "blog")!.resources).toContain("kv:lost");
  });
});

describe("findCycles", () => {
  it("finds A → B → A and self-calls, once each", () => {
    const c = findCycles([w("a", ["worker:b"]), w("b", ["worker:a"]), w("c", ["worker:c"]), w("d", ["worker:a"])]);
    expect(c).toHaveLength(2);
  });
});

describe("detectSpike", () => {
  it("compares last hour to baseline", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const s = [
      { at: "2026-11-06T12:00:00Z", gross: 0 },
      { at: "2026-11-07T11:00:00Z", gross: 23 }, // ~$1/h for a day
      { at: "2026-11-07T12:00:00Z", gross: 73 }, // then $50 in one hour
    ];
    const r = detectSpike(s, now)!;
    expect(r.lastHour).toBeCloseTo(50);
    expect(r.baseline).toBeCloseTo(1);
  });
});

describe("cfClient limits", () => {
  it("never retries 429 and stops at the call budget", async () => {
    const { cfClient } = await import("./cf");
    let calls = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => (calls++, new Response("{}", { status: 429 }))) as typeof fetch;
    await expect(cfClient("t").get("/x")).rejects.toThrow("429");
    expect(calls).toBe(1);

    globalThis.fetch = (async () => (calls++, new Response("{}", { status: 503 }))) as typeof fetch;
    calls = 0;
    await expect(cfClient("t").get("/x")).rejects.toThrow("503");
    expect(calls).toBe(2); // one retry, then fail

    globalThis.fetch = (async () => new Response(JSON.stringify({ success: true, result: [] }))) as typeof fetch;
    const c = cfClient("t", 2);
    await c.get("/a");
    await c.get("/b");
    await expect(c.get("/c")).rejects.toThrow("budget");
    globalThis.fetch = realFetch;
  });
});

describe("selfScript", () => {
  it("protects the configured Worker name, defaulting to cf-overview", () => {
    expect(selfScript({ WORKER_NAME: "my-dash" })).toBe("my-dash");
    expect(selfScript({})).toBe("cf-overview");
  });
});
