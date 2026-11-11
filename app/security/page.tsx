import { ShieldCheck } from "lucide-react";
import { Card, DashLink, Empty, SeverityPill, Stat, ago } from "@/components/ui";
import { loadDashboard } from "@/lib/data";

export default async function Security() {
  const d = await loadDashboard();
  const f = d.findings.filter((x) => x.area === "security");
  const count = (s: string) => f.filter((x) => x.severity === s).length;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Security</h1>
        <span className="text-sm text-neutral-500">Checked {ago(d.inventoryAt)}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat value={count("high")} label="High" tone={count("high") ? "bad" : undefined} />
        <Stat value={count("medium")} label="Medium" tone={count("medium") ? "warn" : undefined} />
        <Stat value={count("low")} label="Low" />
      </div>
      {f.length ? (
        <Card flush>
          <ul className="divide-y divide-black/[.06] dark:divide-white/10">
            {f.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-5 py-3">
                <SeverityPill severity={x.severity} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{x.title}</div>
                  <div className="truncate text-xs text-neutral-500">{x.target}</div>
                </div>
                {x.link && <DashLink href={x.link} />}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Empty icon={ShieldCheck} title="All clear" />
      )}
    </div>
  );
}
