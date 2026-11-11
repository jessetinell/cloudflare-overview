export type Kind =
  | "worker"
  | "pages"
  | "d1"
  | "kv"
  | "r2"
  | "queue"
  | "do"
  | "vectorize"
  | "hyperdrive"
  | "ai"
  | "aigateway"
  | "zone"
  | "other";

export const APP_KINDS: Kind[] = ["worker", "pages"];

export interface Resource {
  /** `${kind}:${id}`. Stable across syncs. */
  key: string;
  kind: Kind;
  name: string;
  id: string;
  createdAt?: string;
  /** Apps only: resource keys this app binds to (incl. other apps via service bindings). */
  uses?: string[];
  /** Apps only: custom domains / routes. */
  domains?: string[];
  /** Apps only: env var names, and whether they're plain text. */
  vars?: { name: string; plain: boolean }[];
  workersDev?: boolean;
  crons?: string[];
  /** Kind-specific extras used by checks (queue producers/consumers, gateway limits, …). */
  meta?: Record<string, any>;
}

export interface Inventory {
  accountId: string;
  at: string;
  resources: Resource[];
  errors: string[];
}

export interface Project {
  id: string;
  name: string;
  apps: string[];
  resources: string[];
}

export type Severity = "high" | "medium" | "low";

export interface Finding {
  id: string;
  area: "security" | "cost";
  severity: Severity;
  title: string;
  target: string;
  link?: string;
}

/** Usage for one resource, month to date, in billing units (see lib/pricing.ts). */
export type Usage = Record<string, Partial<Record<string, number>>>;
