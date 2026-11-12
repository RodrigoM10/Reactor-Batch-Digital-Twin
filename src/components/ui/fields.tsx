"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn, fmt } from "@/lib/format";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border border-border bg-surface", className)}>{children}</div>;
}

export function Section({
  title,
  icon,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  badge?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold hover:bg-surface-2"
        aria-expanded={open}
      >
        <span className="text-accent">{icon}</span>
        <span className="flex-1">{title}</span>
        {badge}
        <ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </section>
  );
}

interface NumberFieldProps {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  unit?: ReactNode;
  hint?: string;
  slider?: { min: number; max: number; log?: boolean };
  min?: number;
  compact?: boolean;
}

/** Campo numérico que acepta notación científica (p. ej. 4.3e9) y, opcionalmente, un slider en vivo. */
export function NumberField({ label, value, onChange, unit, hint, slider, min, compact }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && !isValid(draft, min);

  return (
    <div className={cn(compact ? "space-y-0.5" : "space-y-1")}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-xs text-muted">
        <span>{label}</span>
        {unit && <span className="font-mono text-[11px]">{unit}</span>}
      </label>
      <input
        id={id}
        inputMode="decimal"
        className={cn(
          "num w-full rounded-md border bg-surface-2 px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-accent",
          invalid ? "border-danger" : "border-border",
        )}
        value={draft ?? fmt(value, 6)}
        onChange={(e) => {
          setDraft(e.target.value);
          if (isValid(e.target.value, min)) onChange(Number(e.target.value));
        }}
        onBlur={() => setDraft(null)}
        title={hint}
      />
      {slider && (
        <RangeInput
          {...slider}
          label={typeof label === "string" ? label : undefined}
          value={value}
          onChange={(v) => {
            setDraft(null);
            onChange(v);
          }}
        />
      )}
    </div>
  );
}

function RangeInput({
  min,
  max,
  log = false,
  label,
  value,
  onChange,
}: {
  min: number;
  max: number;
  log?: boolean;
  label?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const pos = log ? Math.log10(Math.min(Math.max(value, min), max)) : Math.min(Math.max(value, min), max);
  return (
    <input
      type="range"
      aria-label={label}
      className="w-full"
      min={log ? Math.log10(min) : min}
      max={log ? Math.log10(max) : max}
      step={log ? 0.01 : (max - min) / 200}
      value={pos}
      onChange={(e) => {
        const p = Number(e.target.value);
        onChange(log ? Number(Math.pow(10, p).toPrecision(4)) : Number(p.toPrecision(6)));
      }}
    />
  );
}

function isValid(s: string, min?: number) {
  if (s.trim() === "") return false;
  const n = Number(s);
  return Number.isFinite(n) && (min === undefined || n >= min);
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="space-y-1">
      {label && <div className="text-xs text-muted">{label}</div>}
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-40",
              value === o.value ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-text",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm" title={hint}>
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
    </label>
  );
}
