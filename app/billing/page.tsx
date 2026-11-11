import { Check, X } from "lucide-react";
import { Bar, Card, DashLink, KIND, KindIcon, Ring, SeverityPill, Stat, usd } from "@/components/ui";
import { loadDashboard } from "@/lib/data";
import { accountLinks } from "@/lib/links";
import { BASE_PLAN_USD, PRICING_AS_OF } from "@/lib/pricing";
import { UNASSIGNED } from "@/lib/projects";
import type { Kind } from "@/lib/types";

export default async function Billing() {
  const d = await loadDashboard();
  const budget = d.accountBudget?.monthly ?? 0;
  const links = accountLinks(d.accountId);
  const net = d.usage?.net ?? {};

  const byKind: Partial<Record<Kind, number>> = {};
  for (const r of d.resources) if (net[r.key]) byKind[r.kind] = (byKind[r.kind] ?? 0) + net[r.key];
  const kinds = Object.entries(byKind).sort((a, b) => b[1] - a[1]) as [Kind, number][];
  const top = [...d.projects].sort((a, b) => b.net - a.net).filter((p) => p.net > 0).slice(0, 6);
  const risks = d.findings.filter((f) => f.area === "cost");
  const hasGatewayLimit = d.resources.some((r) => r.kind === "aigateway" && r.meta?.rateLimit);
  const noBillingAlert = risks.some((f) => f.title === "No billing alert set");

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
        <span className="text-xs text-neutral-400">Estimates · prices {PRICING_AS_OF}</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[auto_1fr]">
        <Card className="flex flex-col items-center justify-center gap-2 px-10">
          <Ring value={d.projected} max={budget}>
            <div className="text-2xl font-semibold tabular-nums">{usd(d.projected)}</div>
            {budget > 0 && <div className="text-xs text-neutral-500 tabular-nums">of {usd(budget)}</div>}
          </Ring>
          <div className="text-sm text-neutral-500">Projected</div>
        </Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat value={usd(d.total)} label="This month" />
          <Stat value={usd(BASE_PLAN_USD)} label="Base plan" />
          <Stat value={risks.length} label="Cost risks" tone={risks.some((r) => r.severity === "high") ? "bad" : risks.length ? "warn" : undefined} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-500">Top projects</h2>
          <Card className="space-y-4">
            {top.length ? (
              top.map((p) => (
                <div key={p.id} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="truncate">{p.id === UNASSIGNED ? "Unassigned" : p.name}</span>
                    <span className="tabular-nums">{usd(p.net)}</span>
                  </div>
                  <Bar value={p.net} max={top[0].net} />
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-sm text-neutral-400">Within included usage</div>
            )}
          </Card>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-500">By service</h2>
          <Card className="space-y-3">
            {kinds.length ? (
              kinds.map(([k, v]) => (
                <div key={k} className="flex items-center gap-3">
                  <KindIcon kind={k} size="sm" />
                  <span className="flex-1 text-sm">{KIND[k].label}</span>
                  <span className="text-sm tabular-nums">{usd(v)}</span>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-sm text-neutral-400">Within included usage</div>
            )}
          </Card>
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-500">Hard limits</h2>
        <Card flush>
          <ul className="divide-y divide-black/[.06] dark:divide-white/10">
            <Limit ok={!noBillingAlert} label="Billing alert in Cloudflare" href={links.notifications} />
            <Limit ok={hasGatewayLimit} label="AI Gateway rate limit" href={links.aiGateway} />
            <Limit ok={!!budget} label="Account budget here" href="/settings" />
          </ul>
        </Card>
      </section>

      {risks.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-500">Runaway risks</h2>
          <Card flush>
            <ul className="divide-y divide-black/[.06] dark:divide-white/10">
              {risks.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-5 py-3">
                  <SeverityPill severity={f.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{f.title}</div>
                    <div className="truncate text-xs text-neutral-500">{f.target}</div>
                  </div>
                  {f.link && <DashLink href={f.link} />}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}

function Limit({ ok, label, href }: { ok: boolean; label: string; href: string }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span className={`inline-flex size-6 items-center justify-center rounded-full ${ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"}`}>
        {ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
        <span className="sr-only">{ok ? "Set" : "Missing"}</span>
      </span>
      <span className="flex-1 text-sm">{label}</span>
      {href.startsWith("http") ? <DashLink href={href} /> : <a href={href} className="text-sm text-orange-600 hover:underline">Set</a>}
    </li>
  );
}
