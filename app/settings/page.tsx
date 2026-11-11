import { OctagonX } from "lucide-react";
import { RemoveOverride, StopToggle, TestAlertButton } from "@/components/buttons";
import { BudgetRow, OverrideForm, StopAllForm } from "@/components/settings-forms";
import { Card, Chip, Dot, KIND, ago } from "@/components/ui";
import { MessageSquare } from "lucide-react";
import { env, loadDashboard } from "@/lib/data";
import { UNASSIGNED } from "@/lib/projects";

export default async function Settings() {
  const d = await loadDashboard();
  const projects = d.projects.filter((p) => p.id !== UNASSIGNED);
  const stoppable = projects.filter((p) => p.resources.some((r) => r.kind === "worker"));
  const byKey = new Map(d.resources.map((r) => [r.key, r]));
  const canStop = !!env().CF_STOP_TOKEN;
  const hasWebhook = !!env().ALERT_WEBHOOK_URL;

  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-500">Budgets</h2>
        <Card flush>
          <div className="divide-y divide-black/[.06] dark:divide-white/10">
            <BudgetRow project="*" name="Whole account" monthly={d.accountBudget?.monthly ?? null} daily={d.accountBudget?.daily ?? null} autostop={false} canStop={false} />
            {projects.map((p) => (
              <BudgetRow
                key={p.id}
                project={p.id}
                name={p.name}
                monthly={p.budget?.monthly ?? null}
                daily={p.budget?.daily ?? null}
                autostop={!!p.budget?.autostop}
                canStop={canStop && p.resources.some((r) => r.kind === "worker")}
              />
            ))}
          </div>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-500">Alerts</h2>
        <Card className="flex items-center gap-3">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
            <MessageSquare className="size-4" aria-hidden />
          </span>
          <span className="flex-1 text-sm font-medium">Slack</span>
          {hasWebhook ? (
            <TestAlertButton />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
              <span className="size-2 rounded-full bg-neutral-400" aria-hidden /> Not connected
            </span>
          )}
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-500">Grouping</h2>
        <Card flush>
          <div className="divide-y divide-black/[.06] dark:divide-white/10">
            <OverrideForm
              resources={d.resources.filter((r) => r.kind !== "zone").map((r) => ({ key: r.key, label: `${KIND[r.kind].label} · ${r.name}` }))}
              projects={projects.map((p) => p.name)}
            />
            {Object.entries(d.overrides).map(([key, project]) => (
              <div key={key} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{byKey.get(key)?.name ?? key}</span>
                <Chip>{project}</Chip>
                <RemoveOverride resource={key} />
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section id="emergency" className="scroll-mt-24 space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-medium text-red-600">
          <OctagonX className="size-4" aria-hidden /> Emergency stop
        </h2>
        <Card className="space-y-5 border-red-500/20">
          {!canStop && <div className="text-sm text-neutral-500">Set CF_STOP_TOKEN to enable.</div>}
          {canStop && (
            <>
              <ul className="divide-y divide-black/[.06] dark:divide-white/10">
                {stoppable.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <Dot status={p.status} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    {p.stoppedAt && <span className="text-xs text-neutral-500">{ago(p.stoppedAt)}</span>}
                    <StopToggle project={p.id} name={p.name} stopped={p.status === "stopped"} />
                  </li>
                ))}
              </ul>
              <StopAllForm />
            </>
          )}
        </Card>
      </section>
    </div>
  );
}
