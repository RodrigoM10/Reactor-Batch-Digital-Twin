export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Formato compacto para campos y tooltips: notación científica solo cuando hace falta. */
export function fmt(v: number | null | undefined, digits = 4): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(Math.max(digits - 2, 1)).replace("e+", "e");
  return Number(v.toPrecision(digits)).toString();
}

export const TIME_LABEL = { s: "s", min: "min", h: "h" } as const;
