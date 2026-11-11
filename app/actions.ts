"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/access";
import { acquireLock } from "@/lib/db";
import { env, loadDashboard } from "@/lib/data";
import { resumeProject, stopProject } from "@/lib/stop";
import { notify, runSync } from "@/lib/sync";
import type { Inventory } from "@/lib/types";

export type ActionState = { ok?: string; error?: string } | null;

const num = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : null;
};

async function run(fn: () => Promise<string>): Promise<ActionState> {
  try {
    await requireAccess();
    const ok = await fn();
    revalidatePath("/", "layout");
    return { ok };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Manual refresh. At most once a minute (lock is left to expire, not released). */
export async function refresh(_: ActionState): Promise<ActionState> {
  return run(async () => {
    const e = env();
    if (!(await acquireLock(e.DB, "manual-refresh", 60_000))) throw new Error("Refreshed less than a minute ago");
    return runSync(e, { forceInventory: true });
  });
}

/** Sends one test message to the Slack webhook. At most once per 30 s (lock left to expire). */
export async function testAlert(_: ActionState): Promise<ActionState> {
  return run(async () => {
    const e = env();
    if (!e.ALERT_WEBHOOK_URL) throw new Error("ALERT_WEBHOOK_URL not set");
    if (!(await acquireLock(e.DB, "test-alert", 30_000))) throw new Error("Wait 30 seconds");
    if (!(await notify(e, "✅ Test alert from Cloudflare Overview", "*"))) throw new Error("Slack rejected the webhook");
    return "Sent";
  });
}

export async function saveBudget(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const project = String(form.get("project") ?? "");
    if (!project || project.length > 200) throw new Error("Invalid project");
    await env()
      .DB.prepare("INSERT INTO budgets (project, monthly, daily, autostop) VALUES (?, ?, ?, ?) ON CONFLICT(project) DO UPDATE SET monthly = excluded.monthly, daily = excluded.daily, autostop = excluded.autostop")
      .bind(project, num(form.get("monthly")), num(form.get("daily")), form.get("autostop") === "on" ? 1 : 0)
      .run();
    return "Saved";
  });
}

export async function setOverride(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const resource = String(form.get("resource") ?? "").trim();
    const project = String(form.get("project") ?? "").trim();
    if (!resource || !project || project.length > 100) throw new Error("Pick a resource and a project name");
    const inv = (await env().DB.prepare("SELECT value FROM kv WHERE key = 'inventory'").first<{ value: string }>())?.value;
    if (!inv || !(JSON.parse(inv) as Inventory).resources.some((r) => r.key === resource)) throw new Error("Unknown resource");
    await env().DB.prepare("INSERT OR REPLACE INTO overrides (resource, project) VALUES (?, ?)").bind(resource, project).run();
    return "Moved";
  });
}

export async function removeOverride(resource: string): Promise<ActionState> {
  return run(async () => {
    await env().DB.prepare("DELETE FROM overrides WHERE resource = ?").bind(resource).run();
    return "Reset";
  });
}

async function stopOne(projectId: string, reason: string) {
  const d = await loadDashboard();
  const p = d.projects.find((x) => x.id === projectId);
  if (!p) throw new Error("Unknown project");
  const inv = (await env().DB.prepare("SELECT value FROM kv WHERE key = 'inventory'").first<{ value: string }>())!.value;
  const scripts = p.resources.filter((r) => r.kind === "worker").map((r) => r.name);
  if (!scripts.length) throw new Error("No Workers to stop in this project");
  await stopProject(env(), JSON.parse(inv), p.id, scripts, reason);
}

export async function stop(projectId: string): Promise<ActionState> {
  return run(async () => {
    await stopOne(projectId, "manual");
    return "Stopped";
  });
}

export async function resume(projectId: string): Promise<ActionState> {
  return run(async () => {
    const e = env();
    await resumeProject(e, e.ACCOUNT_ID, projectId);
    return "Resumed";
  });
}

export async function stopAll(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    if (form.get("confirm") !== "STOP") throw new Error('Type "STOP" to confirm');
    const d = await loadDashboard();
    const targets = d.projects.filter((p) => p.status !== "stopped" && p.resources.some((r) => r.kind === "worker"));
    const failed: string[] = [];
    for (const p of targets) await stopOne(p.id, "stop-all").catch((e) => failed.push(`${p.name}: ${e.message}`));
    if (failed.length) throw new Error(failed.join("; "));
    return `Stopped ${targets.length} projects`;
  });
}
