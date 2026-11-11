import {
  AppWindow,
  Archive,
  Box,
  Boxes,
  Database,
  ExternalLink,
  Gauge,
  Globe,
  KeyRound,
  ListOrdered,
  Router,
  Sparkles,
  TriangleAlert,
  Waypoints,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Status } from "@/lib/data";
import type { Kind, Severity } from "@/lib/types";

export const KIND: Record<Kind, { icon: LucideIcon; label: string; tint: string }> = {
  worker: { icon: Zap, label: "Worker", tint: "text-orange-500 bg-orange-500/10" },
  pages: { icon: AppWindow, label: "Pages", tint: "text-orange-500 bg-orange-500/10" },
  d1: { icon: Database, label: "D1", tint: "text-sky-500 bg-sky-500/10" },
  kv: { icon: KeyRound, label: "KV", tint: "text-emerald-500 bg-emerald-500/10" },
  r2: { icon: Archive, label: "R2", tint: "text-amber-500 bg-amber-500/10" },
  queue: { icon: ListOrdered, label: "Queue", tint: "text-violet-500 bg-violet-500/10" },
  do: { icon: Boxes, label: "Durable Object", tint: "text-indigo-500 bg-indigo-500/10" },
  vectorize: { icon: Waypoints, label: "Vectorize", tint: "text-pink-500 bg-pink-500/10" },
  hyperdrive: { icon: Gauge, label: "Hyperdrive", tint: "text-teal-500 bg-teal-500/10" },
  ai: { icon: Sparkles, label: "Workers AI", tint: "text-fuchsia-500 bg-fuchsia-500/10" },
  aigateway: { icon: Router, label: "AI Gateway", tint: "text-fuchsia-500 bg-fuchsia-500/10" },
  zone: { icon: Globe, label: "Domain", tint: "text-blue-500 bg-blue-500/10" },
  other: { icon: Box, label: "Other", tint: "text-neutral-500 bg-neutral-500/10" },
};

export function KindIcon({ kind, size = "md" }: { kind: Kind; size?: "sm" | "md" }) {
  const k = KIND[kind] ?? KIND.other;
  const Icon = k.icon;
  const box = size === "sm" ? "size-6 rounded-md" : "size-8 rounded-lg";
  return (
    <span title={k.label} className={`inline-flex shrink-0 items-center justify-center ${box} ${k.tint}`}>
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
      <span className="sr-only">{k.label}</span>
    </span>
  );
}

export function Card({ children, className = "", flush }: { children: React.ReactNode; className?: string; flush?: boolean }) {
  return <div className={`rounded-2xl border border-black/[.06] bg-white ${flush ? "overflow-hidden" : "p-5"} shadow-[0_1px_2px_rgba(0,0,0,.03)] dark:border-white/10 dark:bg-neutral-900 ${className}`}>{children}</div>;
}

export function Stat({ value, label, tone }: { value: React.ReactNode; label: string; tone?: "bad" | "warn" }) {
  const color = tone === "bad" ? "text-red-500" : tone === "warn" ? "text-amber-500" : "";
  return (
    <Card>
      <div className={`text-3xl font-semibold tracking-tight tabular-nums ${color}`}>{value}</div>
      <div className="mt-1 text-sm text-neutral-500">{label}</div>
    </Card>
  );
}

const STATUS: Record<Status, { dot: string; label: string }> = {
  ok: { dot: "bg-emerald-500", label: "Healthy" },
  warn: { dot: "bg-amber-500", label: "Attention" },
  over: { dot: "bg-red-500", label: "Over budget" },
  stopped: { dot: "bg-neutral-400", label: "Stopped" },
};

export function Dot({ status }: { status: Status }) {
  return (
    <span title={STATUS[status].label} className="relative inline-flex size-2.5">
      {status === "over" && <span className={`absolute inset-0 animate-ping rounded-full opacity-60 ${STATUS[status].dot}`} />}
      <span className={`relative size-2.5 rounded-full ${STATUS[status].dot}`} />
      <span className="sr-only">{STATUS[status].label}</span>
    </span>
  );
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[.04] px-2.5 py-1 text-xs font-medium dark:bg-white/10">
      <Dot status={status} />
      {STATUS[status].label}
    </span>
  );
}

const SEV: Record<Severity, string> = {
  high: "bg-red-500/10 text-red-600 dark:text-red-400",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "bg-neutral-500/10 text-neutral-500",
};

export function SeverityPill({ severity }: { severity: Severity }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SEV[severity]}`}>{severity}</span>;
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex max-w-full truncate rounded-md bg-black/[.04] px-2 py-0.5 text-xs text-neutral-600 dark:bg-white/10 dark:text-neutral-300">{children}</span>;
}

export function DashLink({ href, label = "Open in Cloudflare" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-black/5 hover:text-orange-500 dark:hover:bg-white/10"
    >
      <ExternalLink className="size-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </a>
  );
}

export function Bar({ value, max, tone }: { value: number; max: number; tone?: "auto" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = tone === "auto" ? (pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500") : "bg-orange-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[.06] dark:bg-white/10" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, max, children }: { value: number; max: number; children: React.ReactNode }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = pct >= 1 ? "stroke-red-500" : pct >= 0.8 ? "stroke-amber-500" : "stroke-emerald-500";
  return (
    <div className="relative size-36">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-black/[.06] dark:stroke-white/10" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className={color} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-8" />;
  const max = Math.max(...values, 0.0001);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - (v / max) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <polyline points={pts} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="stroke-orange-500" />
    </svg>
  );
}

export function Banner({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "bad" }) {
  const c = tone === "bad" ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return (
    <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm ${c}`}>
      <TriangleAlert className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

export function Empty({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-black/10 py-16 text-neutral-400 dark:border-white/10">
      <Icon className="size-8" aria-hidden />
      <span className="text-sm">{title}</span>
    </div>
  );
}

export const usd = (n: number) => (n >= 100 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`);

export const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
