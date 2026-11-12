"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactorParams, SimOk, XTDiagram } from "@/engine";
import { cn, fmt, TIME_LABEL } from "@/lib/format";

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];

type TabId = "C" | "X" | "T" | "Q" | "XT" | "L";

interface Props {
  params: ReactorParams;
  sim: SimOk;
  xt: XTDiagram | null;
  lev: { X: number; inv: number }[];
  cursorT: number;
}

const axisProps = {
  stroke: "var(--muted)",
  tick: { fill: "var(--muted)", fontSize: 11 },
  tickLine: false,
} as const;

const tooltipProps = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--text)",
  },
  labelStyle: { color: "var(--muted)" },
  formatter: (v: unknown) => fmt(v as number),
} as const;

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

  const rows = useMemo(
    () =>
      sim.series.t.map((t, i) => {
        const row: Record<string, number> = {
          t,
          X: sim.series.X[i],
          T: sim.series.T[i],
          Qg: sim.series.Qg[i],
          Qr: sim.series.Qr[i],
        };
        if (sim.series.Xeq) row.Xeq = sim.series.Xeq[i];
        if (sim.series.T_cool_out) row.Tco = sim.series.T_cool_out[i];
        for (const id of Object.keys(sim.series.C)) row[`C_${id}`] = sim.series.C[id][i];
        return row;
      }),
    [sim],
  );

  const timeAxis = (
    <XAxis
      {...axisProps}
      dataKey="t"
      type="number"
      domain={[0, "dataMax"]}
      tickFormatter={(v) => fmt(v, 3)}
      label={{ value: `t [${tu}]`, position: "insideBottomRight", offset: -4, fill: "var(--muted)", fontSize: 11 }}
    />
  );
  const cursor = <ReferenceLine x={cursorT} stroke="var(--text)" strokeOpacity={0.35} strokeDasharray="4 4" />;
  const grid = <CartesianGrid stroke="var(--grid)" vertical={false} />;
  const line = (key: string, name: string, color: string, dashed = false) => (
    <Line
      key={key}
      dataKey={key}
      name={name}
      stroke={color}
      strokeWidth={2}
      strokeDasharray={dashed ? "6 4" : undefined}
      dot={false}
      isAnimationActive={false}
    />
  );

  let chart: React.ReactElement;
  switch (active) {
    case "C":
      chart = (
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
          {grid}
          {timeAxis}
          <YAxis {...axisProps} tickFormatter={(v) => fmt(v, 3)} label={{ value: "C [mol/L]", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip {...tooltipProps} labelFormatter={(v) => `t = ${fmt(v as number)} ${tu}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {params.species.map((s, i) => line(`C_${s.id}`, s.name ? `${s.id} · ${s.name}` : s.id, SERIES[i % SERIES.length], s.nu === 0))}
          {cursor}
        </LineChart>
      );
      break;
    case "X":
      chart = (
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
          {grid}
          {timeAxis}
          <YAxis {...axisProps} domain={[0, 1]} label={{ value: "X", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip {...tooltipProps} labelFormatter={(v) => `t = ${fmt(v as number)} ${tu}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {line("X", `X_${params.keySpecies}`, SERIES[0])}
          {sim.series.Xeq && line("Xeq", "X de equilibrio", SERIES[2], true)}
          {params.stop.mode === "conversion" && (
            <ReferenceLine y={params.stop.X_target} stroke="var(--warn)" strokeDasharray="3 3" label={{ value: "objetivo", fill: "var(--warn)", fontSize: 11 }} />
          )}
          {cursor}
        </LineChart>
      );
      break;
    case "T":
      chart = (
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 16, left: 8 }}>
          {grid}
          {timeAxis}
          <YAxis {...axisProps} domain={["auto", "auto"]} tickFormatter={(v) => fmt(v, 4)} label={{ value: "T [K]", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip {...tooltipProps} labelFormatter={(v) => `t = ${fmt(v as number)} ${tu}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {line("T", "T reactor", "var(--heat)")}
          {sim.series.T_cool_out && line("Tco", "Salida refrigerante", "var(--cool)", true)}
          {cooled && (
            <ReferenceLine y={params.energy.T_cool} stroke="var(--cool)" strokeOpacity={0.6} label={{ value: "T refrigerante", fill: "var(--cool)", fontSize: 11 }} />
          )}
          {cursor}
        </LineChart>
      );
      break;
    case "Q":
      chart = (
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 16, left: 8 }}>
          {grid}
          {timeAxis}
          <YAxis {...axisProps} tickFormatter={(v) => fmt(v, 3)} label={{ value: `Q [cal/${tu}]`, angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip {...tooltipProps} labelFormatter={(v) => `t = ${fmt(v as number)} ${tu}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {line("Qg", "Calor generado", "var(--heat)")}
          {cooled && line("Qr", "Calor removido", "var(--cool)")}
          {cursor}
        </LineChart>
      );
      break;
    case "XT":
      chart = (
        <LineChart margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis {...axisProps} dataKey="T" type="number" domain={[xt!.Tmin, xt!.Tmax]} allowDuplicatedCategory={false} tickFormatter={(v) => fmt(v, 4)} label={{ value: "T [K]", position: "insideBottomRight", offset: -4, fill: "var(--muted)", fontSize: 11 }} />
          <YAxis {...axisProps} dataKey="X" domain={[0, 1]} label={{ value: "X", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip {...tooltipProps} labelFormatter={(v) => `T = ${fmt(v as number)} K`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {xt!.equilibrium && <Line data={xt!.equilibrium} dataKey="X" name="Equilibrio X_eq(T)" stroke={SERIES[2]} strokeWidth={2} dot={false} isAnimationActive={false} />}
          {xt!.optimal && xt!.optimal.length > 1 && <Line data={xt!.optimal} dataKey="X" name="T óptima (máx. velocidad)" stroke={SERIES[3]} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />}
          {xt!.adiabatic && nonIso && <Line data={xt!.adiabatic} dataKey="X" name="Recta adiabática" stroke="var(--muted)" strokeDasharray="3 3" dot={false} isAnimationActive={false} />}
          <Line data={xt!.trajectory} dataKey="X" name="Trayectoria" stroke="var(--heat)" strokeWidth={3} dot={false} isAnimationActive={false} />
        </LineChart>
      );
      break;
    case "L":
      chart = (
        <LineChart data={lev} margin={{ top: 8, right: 16, bottom: 16, left: 8 }}>
          {grid}
          <XAxis {...axisProps} dataKey="X" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => fmt(v, 3)} label={{ value: "X", position: "insideBottomRight", offset: -4, fill: "var(--muted)", fontSize: 11 }} />
          <YAxis {...axisProps} scale="log" domain={["auto", "auto"]} allowDataOverflow tickFormatter={(v) => fmt(v, 2)} label={{ value: `C₀/(−r) [${tu}]`, angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip {...tooltipProps} labelFormatter={(v) => `X = ${fmt(v as number)}`} />
          {line("inv", "C₀ / (−r)", SERIES[0])}
        </LineChart>
      );
      break;
  }

  return (
    <div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border px-2">
        {visible.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
              active === t.id ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="h-[340px] p-2">
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
      {active === "L" && (
        <p className="px-4 pb-3 text-xs text-muted">El área bajo la curva entre 0 y X es el tiempo de reacción del batch.</p>
      )}
      {active === "XT" && (
        <p className="px-4 pb-3 text-xs text-muted">
          Para una reacción reversible exotérmica, la velocidad máxima sigue la curva de T óptima: conviene arrancar caliente y enfriar a medida que avanza la conversión.
        </p>
      )}
    </div>
  );
}
