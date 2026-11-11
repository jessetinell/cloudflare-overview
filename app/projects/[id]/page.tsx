import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bar, Card, Chip, DashLink, KindIcon, KIND, StatusPill, Stat, usd } from "@/components/ui";
import { StopToggle } from "@/components/buttons";
import { env, loadDashboard } from "@/lib/data";
import { dashLink } from "@/lib/links";
import { PRICES } from "@/lib/pricing";
import { UNASSIGNED } from "@/lib/projects";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const d = await loadDashboard();
  const p = d.projects.find((x) => x.id === id);
  if (!p) notFound();
  const canStop = !!env().CF_STOP_TOKEN && p.id !== UNASSIGNED && p.resources.some((r) => r.kind === "worker");

  const usage = d.usage?.usage ?? {};
  const net = d.usage?.net ?? {};
  const domains = [...new Set(p.resources.flatMap((r) => r.domains ?? []))];
  const rows = [...p.resources].sort((a, b) => (net[b.key] ?? 0) - (net[a.key] ?? 0) || a.kind.localeCompare(b.kind));

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
          <ArrowLeft className="size-4" aria-hidden /> Projects
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{p.id === UNASSIGNED ? "Unassigned" : p.name}</h1>
          {p.id !== UNASSIGNED && <StatusPill status={p.status} />}
          {canStop && (
            <div className="ml-auto">
              <StopToggle project={p.id} name={p.name} stopped={p.status === "stopped"} />
            </div>
          )}
        </div>
        {domains.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {domains.map((x) => (
              <a key={x} href={`https://${x}`} target="_blank" rel="noreferrer">
                <Chip>{x}</Chip>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={usd(p.net)} label="This month" />
        <Stat value={usd(p.projected)} label="Projected" />
        <Stat value={p.resources.length} label="Services" />
        <Card>
          <div className="text-3xl font-semibold tracking-tight tabular-nums">{p.budget?.monthly ? usd(p.budget.monthly) : "—"}</div>
          <div className="mt-1 mb-3 text-sm text-neutral-500">Budget</div>
          {p.budget?.monthly ? <Bar value={p.projected} max={p.budget.monthly} tone="auto" /> : null}
        </Card>
      </div>

      <Card flush>
        <ul className="divide-y divide-black/[.06] dark:divide-white/10">
          {rows.map((r) => {
            const u = usage[r.key] ?? {};
            const top = Object.entries(u).sort((a, b) => (b[1] ?? 0) * (PRICES[b[0]]?.perUnit ?? 0) - (a[1] ?? 0) * (PRICES[a[0]]?.perUnit ?? 0))[0];
            return (
              <li key={r.key} className="flex items-center gap-3 px-5 py-3">
                <KindIcon kind={r.kind} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="truncate text-sm text-neutral-500">
                    {KIND[r.kind].label}
                    {top && top[1] ? ` · ${compact.format(top[1])} ${PRICES[top[0]]?.label ?? top[0]}` : ""}
                  </div>
                </div>
                <div className="text-right text-sm font-medium tabular-nums">{net[r.key] ? usd(net[r.key]) : <span className="text-neutral-400">$0</span>}</div>
                <DashLink href={dashLink(d.accountId, r)} />
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
