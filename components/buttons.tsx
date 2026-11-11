"use client";

import { Play, RefreshCw, OctagonX, Send, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { type ActionState, refresh, removeOverride, resume, stop, testAlert } from "@/app/actions";

export function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <span role="status" className={`text-xs ${state.error ? "text-red-500" : "text-emerald-600"}`}>
      {state.error ?? state.ok}
    </span>
  );
}

export function RefreshButton() {
  const [state, action, pending] = useActionState(refresh, null);
  return (
    <form action={action} className="flex items-center gap-2">
      {state?.error && <Feedback state={state} />}
      <button
        disabled={pending}
        title="Refresh now"
        className="inline-flex size-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
        <span className="sr-only">Refresh now</span>
      </button>
    </form>
  );
}

export function TestAlertButton() {
  const [state, action, pending] = useActionState(testAlert, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <Feedback state={state} />
      <button
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        <Send className="size-3.5" aria-hidden />
        {pending ? "Sending…" : "Send test"}
      </button>
    </form>
  );
}

export function StopToggle({ project, stopped, name }: { project: string; stopped: boolean; name: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const onClick = () => {
    if (!stopped && !confirm(`Stop ${name}? Routes, domains, workers.dev and crons will be detached.`)) return;
    start(async () => setState(await (stopped ? resume(project) : stop(project))));
  };
  return (
    <div className="flex items-center gap-2">
      <Feedback state={state} />
      <button
        onClick={onClick}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
          stopped ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400" : "bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400"
        }`}
      >
        {stopped ? <Play className="size-3.5" aria-hidden /> : <OctagonX className="size-3.5" aria-hidden />}
        {stopped ? "Resume" : "Stop"}
      </button>
    </div>
  );
}

export function RemoveOverride({ resource }: { resource: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => void (await removeOverride(resource)))}
      disabled={pending}
      title="Reset to automatic"
      className="inline-flex size-7 items-center justify-center rounded-md text-neutral-400 hover:bg-black/5 hover:text-neutral-900 disabled:opacity-50 dark:hover:bg-white/10"
    >
      <X className="size-4" aria-hidden />
      <span className="sr-only">Reset to automatic</span>
    </button>
  );
}

