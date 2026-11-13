"use client";

import { useMemo, useState } from "react";
import type { ReactorParams, SimOk, XTDiagram } from "@/engine";
import { cn, TIME_LABEL } from "@/lib/format";
import { Plot, type AxisSpec, type RefSpec, type SeriesSpec } from "./ui/plot";

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];

type TabId = "C" | "X" | "T" | "Q" | "XT" | "L";

interface Props {
  params: ReactorParams;
  sim: SimOk;
  xt: XTDiagram | null;
  lev: { X: number; inv: number }[];
  cursorT: number;
}

interface ChartSpec {
  u: AxisSpec;
  v: AxisSpec;
  series: SeriesSpec[];
  refs?: RefSpec[];
  footer?: string;
}

export function Charts({ params, sim, xt, lev, cursorT }: Props) {
  const nonIso = params.energy.mode !== "isothermal";
  const cooled = params.energy.mode === "icq" || params.energy.mode === "jacket";
  const tabs: { id: TabId; label: string; show: boolean }[] = [
    { id: "C", label: "Concentraciones", show: true },
    { id: "X", label: "Conversión", show: true },
    { id: "T", label: "Temperatura", show: nonIso },
    { id: "Q", label: "Calor", show: nonIso },
    { id: "XT", label: "Diagrama X–T", show: !!xt && (nonIso || params.reversible) },
    { id: "L", label: "Levenspiel", show: true },
  ];
  const visible = tabs.filter((t) => t.show);
  const [tab, setTab] = useState<TabId>("C");
  const active = visible.some((t) => t.id === tab) ? tab : "C";
  const tu = TIME_LABEL[params.timeUnit];

  const spec = useMemo((): ChartSpec => {
    const t = sim.series.t;
    const over = (ys: number[]) => t.map((u, i) => ({ u, v: ys[i] }));
    const time: AxisSpec = { label: `t [${tu}]`, name: "t", unit: tu, domain: [0, "dataMax"] };

    switch (active) {
      case "C":
        return {
          u: time,
          v: { label: "C [mol/L]", name: "C", unit: "mol/L" },
          series: params.species.map((s, i) => ({
            id: s.id,
            name: s.name ? `${s.id} · ${s.name}` : s.id,
            color: SERIES[i % SERIES.length],
            dashed: s.nu === 0,
            data: over(sim.series.C[s.id]),
          })),
        };
      case "X":
        return {
          u: time,
          v: { label: "X", name: "X", domain: [0, 1] },
          series: [
            { id: "X", name: `X_${params.keySpecies}`, color: SERIES[0], data: over(sim.series.X) },
            ...(sim.series.Xeq ? [{ id: "Xeq", name: "X de equilibrio", color: SERIES[2], dashed: true, data: over(sim.series.Xeq) }] : []),
          ],
          refs: [
            ...(params.stop.mode === "conversion"
              ? [{ axis: "v" as const, value: params.stop.X_target, color: "var(--warn)", dashed: true, label: "objetivo" }]
              : []),
          ],
        };
      case "T":
        return {
          u: time,
          v: { label: "T [K]", name: "T", unit: "K", digits: 4 },
          series: [
            { id: "T", name: "T reactor", color: "var(--heat)", data: over(sim.series.T) },
            ...(sim.series.T_cool_out
              ? [{ id: "Tco", name: "Salida refrigerante", color: "var(--cool)", dashed: true, data: over(sim.series.T_cool_out) }]
              : []),
          ],
          refs: [
            ...(cooled ? [{ axis: "v" as const, value: params.energy.T_cool, color: "var(--cool)", opacity: 0.6, label: "T refrigerante" }] : []),
          ],
        };
      case "Q":
        return {
          u: time,
          v: { label: `Q [cal/${tu}]`, name: "Q", unit: `cal/${tu}` },
          series: [
            { id: "Qg", name: "Calor generado", color: "var(--heat)", data: over(sim.series.Qg) },
            ...(cooled ? [{ id: "Qr", name: "Calor removido", color: "var(--cool)", data: over(sim.series.Qr) }] : []),
          ],
        };
      case "XT": {
        const pts = (a: { X: number; T: number }[]) => a.map((p) => ({ u: p.X, v: p.T }));
        return {
          u: { label: "X", name: "X", domain: [0, 1] },
          v: { label: "T [K]", name: "T", unit: "K", domain: [xt!.Tmin, xt!.Tmax], digits: 4 },
          series: [
            ...(xt!.equilibrium ? [{ id: "eq", name: "Equilibrio X_eq(T)", color: SERIES[2], data: pts(xt!.equilibrium) }] : []),
            ...(xt!.optimal && xt!.optimal.length > 1
              ? [{ id: "opt", name: "T óptima (máx. velocidad)", color: SERIES[3], dashed: true, data: pts(xt!.optimal) }]
              : []),
            ...(xt!.adiabatic && nonIso
              ? [{ id: "ad", name: "Recta adiabática", color: "var(--muted)", dashed: "3 3", width: 1.5, data: pts(xt!.adiabatic) }]
              : []),
            { id: "traj", name: "Trayectoria", color: "var(--heat)", width: 3, data: pts(xt!.trajectory) },
          ],
          footer:
            "Para una reacción reversible exotérmica, la velocidad máxima sigue la curva de T óptima: conviene arrancar caliente y enfriar a medida que avanza la conversión.",
        };
      }
      case "L":
        return {
          u: { label: "X", name: "X", domain: [0, "dataMax"] },
          v: { label: `C₀/(−r) [${tu}]`, name: "C₀/(−r)", unit: tu, log: true, digits: 2 },
          series: [{ id: "inv", name: "C₀ / (−r)", color: SERIES[0], data: lev.map((p) => ({ u: p.X, v: p.inv })) }],
          footer: "El área bajo la curva entre 0 y X es el tiempo de reacción del batch.",
        };
    }
  }, [active, sim, params, xt, lev, tu, nonIso, cooled]);

  // El cursor de reproducción va aparte para no rearmar las series en cada cuadro.
  const timeChart = active !== "XT" && active !== "L";
  const refs: RefSpec[] = [
    ...(spec.refs ?? []),
    ...(timeChart ? [{ axis: "u" as const, value: cursorT, color: "var(--text)", opacity: 0.35, dashed: true }] : []),
  ];

  const tablist = (
    <div role="tablist" className="flex gap-1 overflow-x-auto px-2">
      {visible.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => setTab(t.id)}
          className={cn(
            "-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
            active === t.id ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return <Plot {...spec} refs={refs} header={tablist} resetKey={active} />;
}
