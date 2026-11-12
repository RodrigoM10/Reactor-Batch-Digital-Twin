"use client";

import { Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { V1_URL } from "@/lib/site";

export const MODULES = [
  { href: "/simulador", label: "Simular" },
  { href: "/calibrar", label: "Calibrar" },
];

export function SiteHeader({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const toggleTheme = () => {
    const root = document.documentElement;
    const current =
      root.dataset.theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* almacenamiento no disponible */
    }
  };

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Logo />
          <span className="hidden sm:inline">Reactor Batch</span>
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold text-accent">2.0</span>
        </Link>
        <nav className="flex items-center gap-0.5 overflow-x-auto">
          {MODULES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
                pathname === m.href ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-text",
              )}
            >
              {m.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {children}
          <a
            href={V1_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-md px-2 py-1.5 text-sm text-muted hover:text-text md:block"
          >
            Versión tesis
          </a>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Cambiar tema"
            className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
          >
            <Sun className="hidden size-4 dark:block" />
            <Moon className="size-4 dark:hidden" />
          </button>
        </div>
      </div>
    </header>
  );
}

export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="7" y="6" width="18" height="21" rx="6" fill="none" stroke="var(--accent)" strokeWidth="2.2" />
      <path d="M8.5 16 h15 v5 a4.5 4.5 0 0 1 -4.5 4.5 h-6 a4.5 4.5 0 0 1 -4.5 -4.5 z" fill="var(--heat)" opacity="0.85" />
      <line x1="16" y1="2" x2="16" y2="21" stroke="var(--text)" strokeWidth="1.8" />
      <line x1="11.5" y1="21" x2="20.5" y2="21" stroke="var(--text)" strokeWidth="1.8" />
    </svg>
  );
}
