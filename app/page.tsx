import { CloudOff } from "lucide-react";
import Link from "next/link";
import { Banner, Card, Chip, Dot, Empty, KindIcon, Spark, Stat, ago, usd } from "@/components/ui";
import { loadDashboard, type ProjectView } from "@/lib/data";
import { UNASSIGNED } from "@/lib/projects";
import type { Kind } from "@/lib/types";

export default async function Overview() {
  const d = await loadDashboard();
  const projects = d.projects.filter((p) => p.id !== UNASSIGNED);
  const unassigned = d.projects.find((p) => p.id === UNASSIGNED);
  const high = d.findings.filter((f) => f.severity === "high").length;
  const budget = d.accountBudget?.monthly;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
        <span className="text-sm text-neutral-500">Synced {ago(d.syncedAt)}</span>
      </div>

      {d.errors.length > 0 && <Banner>{d.errors.length === 1 ? "1 check" : `${d.errors.length} checks`} skipped · token permissions</Banner>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={usd(d.total)} label="This month" />
        <Stat value={usd(d.projected)} label="Projected" tone={budget && d.projected >= budget ? "bad" : budget && d.projected >= budget * 0.8 ? "warn" : undefined} />
        <Stat value={projects.length} label="Projects" />
        <Stat value={high} label="Critical issues" tone={high ? "bad" : undefined} />
      </div>

      {!d.syncedAt ? (
        <Empty icon={CloudOff} title="No sync yet · press refresh" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
          {unassigned && unassigned.resources.length > 0 && <ProjectCard p={unassigned} muted />}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ p, muted }: { p: ProjectView; muted?: boolean }) {
  const kinds = [...new Set(p.resources.map((r) => r.kind))] as Kind[];
  const domain = p.resources.flatMap((r) => r.domains ?? [])[0];
  return (
    <Link href={`/projects/${p.id}`} className="group">
      <Card className={`flex h-full flex-col gap-4 transition group-hover:-translate-y-0.5 group-hover:shadow-md ${muted ? "border-dashed bg-transparent dark:bg-transparent" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {!muted && <Dot status={p.status} />}
              <span className="truncate font-medium">{muted ? "Unassigned" : p.name}</span>
            </div>
            {domain && <div className="mt-0.5 truncate text-sm text-neutral-500">{domain}</div>}
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">{usd(p.net)}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {kinds.map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <KindIcon kind={k} size="sm" />
            </span>
          ))}
          {muted && <Chip>{p.resources.length}</Chip>}
        </div>
        {!muted && <Spark values={p.spark} />}
      </Card>
    </Link>
  );
}
