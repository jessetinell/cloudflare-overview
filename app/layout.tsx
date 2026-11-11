import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RefreshButton } from "@/components/buttons";
import { Nav } from "@/components/nav";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = { title: "Cloudflare Overview", description: "Projects, costs and security for your Cloudflare account" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <header className="sticky top-0 z-10 border-b border-black/[.06] bg-neutral-50/80 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/80">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 font-semibold tracking-tight">
                <span className="size-6 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600" aria-hidden />
                Overview
              </div>
              <div className="sm:hidden">
                <RefreshButton />
              </div>
            </div>
            <Nav />
            <div className="hidden sm:block">
              <RefreshButton />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
