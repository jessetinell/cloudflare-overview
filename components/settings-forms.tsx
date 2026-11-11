"use client";

import { useActionState } from "react";
import { type ActionState, saveBudget, setOverride, stopAll } from "@/app/actions";
import { Feedback } from "./buttons";

const input =
  "w-full rounded-lg border border-black/[.08] bg-white px-2.5 py-1.5 text-sm tabular-nums outline-none focus:ring-2 focus:ring-orange-500/40 dark:border-white/10 dark:bg-neutral-900";

export function BudgetRow({ project, name, monthly, daily, autostop, canStop }: { project: string; name: string; monthly: number | null; daily: number | null; autostop: boolean; canStop: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveBudget, null);
  return (
    <form action={action} className="grid grid-cols-2 items-center gap-2 px-5 py-3 sm:grid-cols-[1fr_7rem_7rem_6rem_5rem]">
      <input type="hidden" name="project" value={project} />
      <div className="col-span-2 truncate text-sm font-medium sm:col-span-1">
        {name} <Feedback state={state} />
      </div>
      <label>
        <span className="sr-only">Monthly budget for {name}</span>
        <input name="monthly" type="number" min="0" step="1" defaultValue={monthly ?? ""} placeholder="$ / month" className={input} />
      </label>
      <label>
        <span className="sr-only">Daily cap for {name}</span>
        <input name="daily" type="number" min="0" step="0.5" defaultValue={daily ?? ""} placeholder="$ / day" className={input} />
      </label>
      <label className={`flex items-center gap-2 text-xs text-neutral-500 ${canStop ? "" : "invisible"}`} title="Stop automatically on spike or cap">
        <input name="autostop" type="checkbox" defaultChecked={autostop} className="size-4 accent-red-500" />
        Auto-stop
      </label>
      <button disabled={pending} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900">
        Save
      </button>
    </form>
  );
}

export function OverrideForm({ resources, projects }: { resources: { key: string; label: string }[]; projects: string[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setOverride, null);
  return (
    <form action={action} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
      <label className="flex-1">
        <span className="sr-only">Resource</span>
        <select name="resource" required className={input} defaultValue="">
          <option value="" disabled>
            Resource
          </option>
          {resources.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex-1">
        <span className="sr-only">Project</span>
        <input name="project" required list="project-names" placeholder="Project" maxLength={100} className={input} />
        <datalist id="project-names">
          {projects.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>
      <button disabled={pending} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
        Move
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function StopAllForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(stopAll, null);
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <label className="flex-1">
        <span className="sr-only">Type STOP to confirm</span>
        <input name="confirm" autoComplete="off" placeholder='Type "STOP"' className={input} />
      </label>
      <button disabled={pending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
        {pending ? "Stopping…" : "Stop everything"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
