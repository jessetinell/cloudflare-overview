import { Layers } from "lucide-react";
import { InventoryList } from "@/components/inventory-list";
import { Empty } from "@/components/ui";
import { loadDashboard } from "@/lib/data";
import { dashLink } from "@/lib/links";

export default async function Inventory() {
  const d = await loadDashboard();
  const owner = new Map(d.projects.flatMap((p) => p.resources.map((r) => [r.key, { id: p.id, name: p.name }] as const)));
  const items = d.resources.map((r) => ({
    key: r.key,
    kind: r.kind,
    name: r.name,
    detail: r.domains?.[0] ?? r.createdAt?.slice(0, 10) ?? "",
    project: owner.get(r.key) ?? null,
    href: dashLink(d.accountId, r),
  }));
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
        <span className="text-sm text-neutral-500 tabular-nums">{items.length} resources</span>
      </div>
      {items.length ? <InventoryList items={items} /> : <Empty icon={Layers} title="Nothing synced yet" />}
    </div>
  );
}
