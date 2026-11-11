"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Kind } from "@/lib/types";
import { Card, Chip, DashLink, KIND, KindIcon } from "./ui";

export interface Item {
  key: string;
  kind: Kind;
  name: string;
  detail: string;
  project: { id: string; name: string } | null;
  href: string;
}

const ORDER = Object.keys(KIND) as Kind[];

export function InventoryList({ items }: { items: Item[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const counts = useMemo(() => items.reduce<Record<string, number>>((c, i) => ((c[i.kind] = (c[i.kind] ?? 0) + 1), c), {}), [items]);
  const shown = items.filter(
    (i) => (!kind || i.kind === kind) && (!q || `${i.name} ${i.detail} ${i.project?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );
  const groups = ORDER.map((k) => [k, shown.filter((i) => i.kind === k)] as const).filter(([, v]) => v.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <span className="sr-only">Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="w-full rounded-xl border border-black/[.08] bg-white py-2 pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-orange-500/40 dark:border-white/10 dark:bg-neutral-900"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ORDER.filter((k) => counts[k]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(kind === k ? null : k)}
              aria-pressed={kind === k}
              title={KIND[k].label}
              className={`inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-xs tabular-nums transition ${
                kind === k ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-black/[.04] hover:bg-black/[.08] dark:bg-white/10"
              }`}
            >
              <KindIcon kind={k} size="sm" />
              {counts[k]}
            </button>
          ))}
        </div>
      </div>

      {groups.map(([k, list]) => (
        <section key={k} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-medium text-neutral-500">
            {KIND[k].label} <span className="tabular-nums">{list.length}</span>
          </h2>
          <Card flush>
            <ul className="divide-y divide-black/[.06] dark:divide-white/10">
              {list.map((i) => (
                <li key={i.key} className="flex items-center gap-3 px-5 py-2.5">
                  <KindIcon kind={i.kind} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{i.name}</div>
                    {i.detail && <div className="truncate text-xs text-neutral-500">{i.detail}</div>}
                  </div>
                  {i.project ? (
                    <Link href={`/projects/${i.project.id}`} className="hidden sm:block">
                      <Chip>{i.project.id === "unassigned" ? "Unassigned" : i.project.name}</Chip>
                    </Link>
                  ) : null}
                  <DashLink href={i.href} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}
