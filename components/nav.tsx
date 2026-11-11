"use client";

import { Layers, LayoutGrid, Settings, Shield, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Projects", icon: LayoutGrid },
  { href: "/inventory", label: "Inventory", icon: Layers },
  { href: "/billing", label: "Billing", icon: Wallet },
  { href: "/security", label: "Security", icon: Shield },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" || path.startsWith("/projects") : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition ${
              active ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900 dark:hover:bg-white/10 dark:hover:text-white"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
