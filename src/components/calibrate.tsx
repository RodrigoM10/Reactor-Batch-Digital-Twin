"use client";

import { AlertTriangle, CheckCircle2, FileUp, Loader2, Play, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SimResult } from "@/engine";
import { parseMeasurementsCsv, type FitParam, type FitResult, type Measurements } from "@/engine/fit";
import { cn, fmt, TIME_LABEL } from "@/lib/format";
import { useReactorStore } from "@/lib/store";
import { useEngineWorker } from "@/lib/use-engine";
import { reactionEquation } from "./params-panel";
import { SiteHeader } from "./site-header";
import { Card, NumberField } from "./ui/fields";

const DEMO_RUNS = [
  { file: "corrida-icq-ideal.csv", label: "Planta ideal", hint: "Solo parámetros distintos y ruido: el modelo puede explicarla." },
  { file: "corrida-icq-1.csv", label: "Planta realista 1", hint: "Con ΔCp, desactivación y pérdidas al ambiente." },
  { file: "corrida-icq-2.csv", label: "Planta realista 2", hint: "Otra realización de la planta realista." },
];

const PARAM_OPTIONS: { id: FitParam; label: string; needsCooling?: boolean; needsNonIso?: boolean }[] = [
  { id: "k", label: "k(T₀)" },
  { id: "E", label: "E", needsNonIso: true },
  { id: "deltaH", label: "ΔH", needsNonIso: true },
  { id: "UA", label: "U·A", needsCooling: true },
];

interface Truth {
  true_params: { kinetics: { A: number; E: number }; deltaH: number; energy: { UA: number; T0: number } };
}

export function Calibrate() {
  const params = useReactorStore((s) => s.params);
  const loadPreset = useReactorStore((s) => s.loadPreset);
  const replace = useReactorStore((s) => s.replace);
  const api = useEngineWorker();
  const fileRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<Measurements | null>(null);
  const [source, setSource] = useState<string>("");
  const [truth, setTruth] = useState<Truth | null>(null);
  const [selected, setSelected] = useState<FitParam[]>(["k", "E", "UA"]);
  const [sigmaT, setSigmaT] = useState(0.3);
  const [sigmaX, setSigmaX] = useState(0.02);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fit, setFit] = useState<FitResult | null>(null);
  const [curves, setCurves] = useState<{ before: SimResult; after: SimResult | null } | null>(null);

  const nonIso = params.energy.mode !== "isothermal";
  const cooled = params.energy.mode === "icq" || params.energy.mode === "jacket";
  const available = PARAM_OPTIONS.filter((o) => (!o.needsNonIso || nonIso) && (!o.needsCooling || cooled));
  const active = selected.filter((s) => available.some((a) => a.id === s));
  const tu = TIME_LABEL[params.timeUnit];

  const denseTimes = (d: Measurements) => {
    const tEnd = Math.max(...d.t);
    return Array.from({ length: 200 }, (_, i) => (tEnd * i) / 199);
  };

  const loadData = async (d: Measurements, label: string, t: Truth | null) => {
    setData(d);
    setSource(label);
    setTruth(t);
    setFit(null);
    setError(null);
    const before = await api.current?.simulateAt(params, denseTimes(d));
    if (before) setCurves({ before, after: null });
  };

  const loadDemo = async (file: string, label: string) => {
    // Las corridas de ejemplo salen del caso "Camisa ICQ": se usa ese modelo nominal.
    loadPreset("runaway");
    const [csv, tr] = await Promise.all([
      fetch(`/data/plant/${file}`).then((r) => r.text()),
      fetch(`/data/plant/${file.replace(".csv", ".truth.json")}`).then((r) => (r.ok ? r.json() : null)),
    ]);
    const d = parseMeasurementsCsv(csv);
    const p = useReactorStore.getState().params;
    setData(d);
    setSource(label);
    setTruth(tr);
    setFit(null);
    setError(null);
    const before = await api.current?.simulateAt(p, denseTimes(d));
    if (before) setCurves({ before, after: null });
  };

  const runFit = async () => {
    if (!data || !api.current) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.current.fit(params, data, { params: active, sigmaT, sigmaX });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setFit(r);
      const [before, after] = await Promise.all([
        api.current.simulateAt(params, denseTimes(data)),
        api.current.simulateAt(r.params, denseTimes(data)),
      ]);
      setCurves({ before, after });
    } finally {
      setBusy(false);
    }
  };

  const chartData = useMemo(() => {
    if (!data) return null;
    const points = data.t.map((t, i) => ({ t, T: data.T?.[i] ?? null, X: data.X?.[i] ?? null }));
    const line = (s: SimResult | null | undefined, key: "T" | "X") =>
      s && s.ok ? s.series.t.map((t, i) => ({ t, v: s.series[key][i] })) : [];
    return {
      measT: points.filter((p) => p.T !== null),
      measX: points.filter((p) => p.X !== null),
      beforeT: line(curves?.before, "T"),
      afterT: line(curves?.after, "T"),
      beforeX: line(curves?.before, "X"),
      afterX: line(curves?.after, "X"),
    };
  }, [data, curves]);

  const truthValue = (id: FitParam): number | null => {
    if (!truth) return null;
    const tp = truth.true_params;
    switch (id) {
      case "k":
        return tp.kinetics.A * Math.exp(-tp.kinetics.E / (1.987 * tp.energy.T0));
      case "E":
        return tp.kinetics.E;
      case "deltaH":
        return tp.deltaH;
      case "UA":
        return tp.energy.UA;
    }
  };

  const nominalValue = (id: FitParam): number => {
    switch (id) {
      case "k":
        return params.kinetics.mode === "direct"
          ? params.kinetics.k
          : params.kinetics.A * Math.exp(-params.kinetics.E / (1.987 * params.energy.T0));
      case "E":
        return params.kinetics.E;
      case "deltaH":
        return params.deltaH;
      case "UA":
        return params.energy.UA;
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">1 · Datos medidos</h2>
            <p className="text-xs text-muted">
              CSV con columnas <code className="font-mono">t</code>, <code className="font-mono">T</code> y/o{" "}
              <code className="font-mono">X</code>. Mientras no haya datos de laboratorio, probá con corridas de la{" "}
              <strong>planta virtual</strong>: un reactor simulado con parámetros ocultos y efectos que el modelo no
              incluye.
            </p>
            <div className="grid gap-2">
              {DEMO_RUNS.map((d) => (
                <button
                  key={d.file}
                  type="button"
                  onClick={() => loadDemo(d.file, d.label)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-accent",
                    source === d.label ? "border-accent bg-accent-soft" : "border-border",
                  )}
                >
                  <div className="font-medium">{d.label}</div>
                  <div className="text-xs text-muted">{d.hint}</div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted hover:border-accent hover:text-accent"
              >
                <Upload className="size-4" /> Subir CSV propio
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    await loadData(parseMeasurementsCsv(await f.text()), f.name, null);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              />
            </div>
            {data && (
              <p className="flex items-center gap-1.5 text-xs text-ok">
                <CheckCircle2 className="size-3.5" /> {source}: {data.t.length} filas
              </p>
            )}
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">2 · Modelo y parámetros a ajustar</h2>
            <p className="rounded-md bg-surface-2 px-3 py-2 font-mono text-xs">
              {reactionEquation(params)} · {params.energy.mode}
            </p>
            <p className="text-xs text-muted">
              Se parte del modelo cargado en <strong>Simular</strong>. Elegí qué parámetros liberar:
            </p>
            <div className="flex flex-wrap gap-2">
              {available.map((o) => (
                <label
                  key={o.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm",
                    active.includes(o.id) ? "border-accent text-accent" : "border-border text-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={active.includes(o.id)}
                    onChange={(e) =>
                      setSelected((s) => (e.target.checked ? [...s, o.id] : s.filter((x) => x !== o.id)))
                    }
                  />
                  {o.label}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="σ del termómetro" unit="K" min={0} value={sigmaT} onChange={setSigmaT} />
              <NumberField label="σ de X" min={0} value={sigmaX} onChange={setSigmaX} />
            </div>
            <button
              type="button"
              disabled={!data || busy || active.length === 0}
              onClick={runFit}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-40 dark:text-bg"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {busy ? "Ajustando…" : "Ajustar"}
            </button>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" /> {error}
            </div>
          )}

          {!data && (
            <Card className="grid min-h-[360px] place-items-center p-8 text-center text-sm text-muted">
              <div>
                <FileUp className="mx-auto mb-3 size-8 text-accent" />
                Cargá una corrida para comparar el modelo con las mediciones.
              </div>
            </Card>
          )}

          {chartData && (
            <Card className="p-2">
              <div className="px-3 pt-2 text-sm font-semibold">
                {chartData.measT.length && nonIso ? "Temperatura" : "Conversión"}: medición vs. modelo
              </div>
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart margin={{ top: 8, right: 16, bottom: 16, left: 8 }}>
                    <CartesianGrid stroke="var(--grid)" vertical={false} />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={[0, "dataMax"]}
                      stroke="var(--muted)"
                      tick={{ fill: "var(--muted)", fontSize: 11 }}
                      tickFormatter={(v) => fmt(v, 3)}
                      allowDuplicatedCategory={false}
                      label={{ value: `t [${tu}]`, position: "insideBottomRight", offset: -4, fill: "var(--muted)", fontSize: 11 }}
                    />
                    {chartData.measT.length > 0 && nonIso ? (
                      <>
                        <YAxis dataKey="T" domain={["auto", "auto"]} stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={(v) => fmt(v, 4)} />
                        <Scatter data={chartData.measT} dataKey="T" name="Medición" fill="var(--muted)" shape="circle" isAnimationActive={false} />
                        <Line data={chartData.beforeT} dataKey="v" name="Modelo nominal" stroke="var(--series-3)" strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                        {chartData.afterT.length > 0 && (
                          <Line data={chartData.afterT} dataKey="v" name="Modelo ajustado" stroke="var(--heat)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                        )}
                      </>
                    ) : (
                      <>
                        <YAxis dataKey="X" domain={[0, 1]} stroke="var(--muted)" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                        <Scatter data={chartData.measX} dataKey="X" name="Medición" fill="var(--muted)" isAnimationActive={false} />
                        <Line data={chartData.beforeX} dataKey="v" name="Modelo nominal" stroke="var(--series-3)" strokeDasharray="6 4" dot={false} isAnimationActive={false} />
                        {chartData.afterX.length > 0 && (
                          <Line data={chartData.afterX} dataKey="v" name="Modelo ajustado" stroke="var(--accent)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                        )}
                      </>
                    )}
                    <Tooltip
                      contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: unknown) => fmt(v as number)}
                      labelFormatter={(v) => `t = ${fmt(v as number)} ${tu}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {fit && (
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border px-4 py-3 text-sm">
                <span className="font-semibold">Resultado del ajuste</span>
                <span className="text-muted">
                  χ²<sub>red</sub> = <span className={cn("num font-mono", fit.chi2red > 3 ? "text-warn" : "text-text")}>{fmt(fit.chi2red, 3)}</span>
                </span>
                {fit.rmseT !== null && (
                  <span className="text-muted">
                    RMSE T = <span className="num font-mono text-text">{fmt(fit.rmseT, 3)} K</span>
                  </span>
                )}
                {fit.rmseX !== null && (
                  <span className="text-muted">
                    RMSE X = <span className="num font-mono text-text">{fmt(fit.rmseX, 3)}</span>
                  </span>
                )}
                <span className="text-muted">
                  {fit.nPoints} datos · {fit.iterations} iteraciones
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-surface-2 text-left text-xs text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Parámetro</th>
                      <th className="px-4 py-2 font-medium">Nominal</th>
                      <th className="px-4 py-2 font-medium">Ajustado ± σ</th>
                      {truth && <th className="px-4 py-2 font-medium">Verdad oculta de la planta</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {fit.estimates.map((e) => {
                      const tv = truthValue(e.name);
                      const z = tv !== null ? Math.abs(e.value - tv) / e.stdErr : null;
                      return (
                        <tr key={e.name} className="border-t border-border">
                          <td className="px-4 py-2 font-medium">{e.label}</td>
                          <td className="num px-4 py-2 font-mono text-muted">{fmt(nominalValue(e.name))}</td>
                          <td className="num px-4 py-2 font-mono">
                            {fmt(e.value)} <span className="text-muted">± {fmt(e.stdErr, 2)}</span>
                          </td>
                          {truth && (
                            <td className="num px-4 py-2 font-mono">
                              {fmt(tv)}{" "}
                              {z !== null && (
                                <span className={cn("text-xs", z < 2 ? "text-ok" : z < 3 ? "text-warn" : "text-danger")}>
                                  ({fmt(z, 2)}σ)
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2 border-t border-border px-4 py-3 text-xs text-muted">
                {fit.chi2red > 3 && (
                  <p className="flex items-start gap-1.5 text-warn">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    χ² alto: el modelo no explica bien los datos. Puede haber efectos que el modelo no incluye (ΔCp,
                    desactivación, pérdidas de calor); es el caso de uso del modelo híbrido física + ML.
                  </p>
                )}
                <p>
                  Intervalos linealizados (covarianza de Gauss–Newton). Cerca de condiciones de descontrol térmico la
                  respuesta es muy no lineal y pueden resultar optimistas.
                </p>
                <button
                  type="button"
                  onClick={() => replace(fit.params)}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-text hover:border-accent hover:text-accent"
                >
                  Usar los parámetros ajustados en el simulador
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
