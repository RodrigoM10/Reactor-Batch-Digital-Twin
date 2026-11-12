"use client";

import { Activity, BellRing, Brain, Eye, EyeOff, FlaskConical, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  loadForecastModel,
  mlForecast,
  riskReference,
  type ForecastModel,
  type ForecastModelJson,
  type ForecastResult,
  type OpPoint,
} from "@/engine/forecast";
import { cn, fmt } from "@/lib/format";
import { useEngineWorker } from "@/lib/use-engine";
import { SiteHeader } from "./site-header";
import { Card } from "./ui/fields";

interface LiveRun {
  id: string;
  title: string;
  op: OpPoint;
  measured: { t: number[]; T: number[] };
  clean: { t: number[]; T: number[] };
}

const RUNS = ["segura", "borde", "runaway"];
const HORIZON = 60; // min
const SPEEDS = [1, 2, 4];
const BASE_RATE = 2; // min de corrida por segundo real (×1)

interface Alarm {
  t: number;
  p: number;
}

function firstMlAlarm(model: ForecastModel, run: LiveRun, tc: number): Alarm | null {
  for (let t = 0.5; t <= tc + 1e-9; t += 0.1) {
    const f = mlForecast(model, run.op, run.measured.t, run.measured.T, t);
    if (f.pRunaway > 0.5) return { t, p: f.pRunaway };
  }
  return null;
}

export function LiveView() {
  const api = useEngineWorker();
  const [model, setModel] = useState<ForecastModel | null>(null);
  const [runs, setRuns] = useState<Record<string, LiveRun>>({});
  const [runId, setRunId] = useState("borde");
  const [tc, setTc] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showTruth, setShowTruth] = useState(false);
  const [phys, setPhys] = useState<ForecastResult | null>(null);
  const [physAlarm, setPhysAlarm] = useState<Alarm | null>(null);
  const physBusy = useRef(false);
  const lastPhysTc = useRef(-1);

  useEffect(() => {
    fetch("/models/forecast-icq.json")
      .then((r) => r.json())
      .then((m: ForecastModelJson) => setModel(loadForecastModel(m)));
    Promise.all(RUNS.map((id) => fetch(`/data/live/${id}.json`).then((r) => r.json() as Promise<LiveRun>))).then((list) =>
      setRuns(Object.fromEntries(list.map((r) => [r.id, r]))),
    );
  }, []);

  const run = runs[runId];
  const tEnd = run ? run.measured.t[run.measured.t.length - 1] : HORIZON;
  const finished = tc >= tEnd - 1e-9;

  const reset = (id = runId) => {
    setRunId(id);
    setTc(0.5);
    setPlaying(false);
    setPhys(null);
    setPhysAlarm(null);
    setShowTruth(false);
    lastPhysTc.current = -1;
  };

  // Avance del tiempo de la corrida
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * BASE_RATE * speed;
      last = now;
      let done = false;
      setTc((t) => {
        const next = Math.min(t + dt, tEnd);
        done = next >= tEnd;
        return next;
      });
      if (done) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, tEnd]);

  // Pronóstico ML: instantáneo, en cada cuadro
  const ml = useMemo(
    () => (model && run ? mlForecast(model, run.op, run.measured.t, run.measured.T, tc) : null),
    [model, run, tc],
  );

  // Pronóstico físico: en el worker, cada 0.5 min de corrida (si el anterior terminó)
  useEffect(() => {
    if (!model || !run || !api.current || physBusy.current) return;
    if (tc - lastPhysTc.current < 0.5 && !finished) return;
    physBusy.current = true;
    lastPhysTc.current = tc;
    api.current
      .forecastPhysics(model.meta.nominal, run.op, run.measured.t, run.measured.T, tc, model.meta.deltaT_ad, HORIZON)
      .then((r) => {
        if (!r) return;
        setPhys(r);
        if (r.pRunaway > 0.5) setPhysAlarm((a) => a ?? { t: r.tc, p: r.pRunaway });
      })
      .finally(() => (physBusy.current = false));
  }, [tc, model, run, api, finished]);

  // Primera alarma del ML: primer instante (cada 0.1 min) con P(runaway) > 0.5 hasta t_c
  const mlAlarm = useMemo(() => (model && run ? firstMlAlarm(model, run, tc) : null), [model, run, tc]);

  const chart = useMemo(() => {
    if (!run || !model) return null;
    const n = run.measured.t.findIndex((t) => t > tc);
    const upto = n < 0 ? run.measured.t.length : n;
    const meas = run.measured.t.slice(0, upto).map((t, i) => ({ t, T: run.measured.T[i] }));
    const band = phys?.band?.filter((b) => b.t >= phys.tc).map((b) => ({ t: b.t, band: [b.lo, b.hi] as [number, number] }));
    const physPath = phys?.path.filter((p) => p.t >= phys.tc);
    const truth = run.clean.t.map((t, i) => ({ t, T: run.clean.T[i] }));
    return { meas, band, physPath, mlPath: ml?.path, truth };
  }, [run, model, tc, phys, ml]);

  const tPeak = run ? run.clean.t[run.clean.T.indexOf(Math.max(...run.clean.T))] : 0;
  const isRunawayRun = run && model ? Math.max(...run.clean.T) > riskReference(run.op, model.meta.deltaT_ad) : false;
  const threshold = run && model ? riskReference(run.op, model.meta.deltaT_ad) : null;
  const yDomain = run ? [Math.min(...run.clean.T, run.op.T_cool) - 3, Math.max(...run.clean.T, threshold ?? 0) + 6] : ["auto", "auto"];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="size-4 text-accent" /> Corrida en vivo
            </h2>
            <p className="text-xs text-muted">
              La planta virtual envía la temperatura medida cada 6 s (con ruido). En cada instante se pronostica el resto
              de la corrida con dos métodos y se dispara una alarma si la probabilidad de descontrol supera 50 %.
            </p>
            <div className="grid gap-2">
              {RUNS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => reset(id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm hover:border-accent",
                    runId === id ? "border-accent bg-accent-soft" : "border-border",
                  )}
                >
                  {runs[id]?.title ?? id}
                </button>
              ))}
            </div>
            {run && (
              <div className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                T₀ {fmt(run.op.T0, 4)} K · refrigerante {fmt(run.op.T_cool, 4)} K · m_c {fmt(Math.exp(run.op.ln_m_c), 3)} kg/min · UA{" "}
                {fmt(Math.exp(run.op.ln_UA), 3)}
              </div>
            )}
          </Card>

          <ProbCard
            icon={<Brain className="size-4" />}
            title="Red neuronal (ML)"
            subtitle="Entrenada con 2 550 corridas de la planta"
            p={ml?.pRunaway ?? null}
            alarm={mlAlarm}
            tPeak={finished && isRunawayRun ? tPeak : null}
          />
          <ProbCard
            icon={<FlaskConical className="size-4" />}
            title="Modelo físico + datos"
            subtitle="Reajuste de k y UA + Monte Carlo (40 corridas)"
            p={phys?.pRunaway ?? null}
            alarm={physAlarm}
            tPeak={finished && isRunawayRun ? tPeak : null}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                aria-label={playing ? "Pausar" : "Reproducir"}
                onClick={() => {
                  if (finished) reset();
                  setPlaying((p) => !p || finished);
                }}
                className="grid size-9 place-items-center rounded-full bg-accent text-white dark:text-bg"
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
              </button>
              <button type="button" aria-label="Reiniciar" onClick={() => reset()} className="grid size-9 place-items-center rounded-full border border-border text-muted hover:text-text">
                <RotateCcw className="size-4" />
              </button>
              <div className="flex gap-1 rounded-lg bg-surface-2 p-1 text-xs">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    className={cn("rounded-md px-2 py-1", speed === s ? "bg-surface text-accent shadow-sm" : "text-muted")}
                  >
                    ×{s}
                  </button>
                ))}
              </div>
              <span className="num font-mono text-sm">t = {fmt(tc, 3)} min</span>
              <button
                type="button"
                onClick={() => setShowTruth((v) => !v)}
                className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:text-text"
              >
                {showTruth ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {showTruth ? "Ocultar" : "Mostrar"} trayectoria real
              </button>
            </div>

            <div className="h-[420px]">
              {chart && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart margin={{ top: 8, right: 16, bottom: 16, left: 8 }}>
                    <CartesianGrid stroke="var(--grid)" vertical={false} />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={[0, HORIZON]}
                      allowDuplicatedCategory={false}
                      stroke="var(--muted)"
                      tick={{ fill: "var(--muted)", fontSize: 11 }}
                      label={{ value: "t [min]", position: "insideBottomRight", offset: -4, fill: "var(--muted)", fontSize: 11 }}
                    />
                    <YAxis
                      domain={yDomain as [number, number]}
                      allowDataOverflow
                      stroke="var(--muted)"
                      tick={{ fill: "var(--muted)", fontSize: 11 }}
                      tickFormatter={(v) => fmt(v, 4)}
                      label={{ value: "T [K]", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: unknown) => (Array.isArray(v) ? `${fmt(v[0], 4)} – ${fmt(v[1], 4)}` : fmt(v as number, 4))}
                      labelFormatter={(v) => `t = ${fmt(v as number, 3)} min`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {chart.band && (
                      <Area data={chart.band} dataKey="band" name="Física: banda 10–90 %" stroke="none" fill="var(--series-3)" fillOpacity={0.18} isAnimationActive={false} />
                    )}
                    {chart.physPath && (
                      <Line data={chart.physPath} dataKey="T" name="Física: pronóstico" stroke="var(--series-3)" strokeWidth={2} dot={false} isAnimationActive={false} />
                    )}
                    {chart.mlPath && (
                      <Line data={chart.mlPath} dataKey="T" name="ML: pronóstico" stroke="var(--accent)" strokeWidth={2.5} strokeDasharray="5 3" dot={{ r: 2.5 }} isAnimationActive={false} />
                    )}
                    <Scatter data={chart.meas} dataKey="T" name="Medición" fill="var(--muted)" shape={(props: { cx?: number; cy?: number }) => <circle cx={props.cx} cy={props.cy} r={1.6} fill="var(--muted)" />} isAnimationActive={false} />
                    {(showTruth || finished) && (
                      <Line data={chart.truth} dataKey="T" name="Trayectoria real" stroke="var(--heat)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    )}
                    {threshold && (
                      <ReferenceLine y={threshold} stroke="var(--danger)" strokeDasharray="4 4" label={{ value: "umbral de runaway", fill: "var(--danger)", fontSize: 11, position: "insideTopRight" }} />
                    )}
                    <ReferenceLine x={tc} stroke="var(--text)" strokeOpacity={0.4} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
            {finished && run && (
              <p className="mt-2 text-sm">
                Resultado real: {isRunawayRun ? <strong className="text-danger">hubo runaway</strong> : <strong className="text-ok">sin runaway</strong>}{" "}
                (pico de {fmt(Math.max(...run.clean.T), 4)} K a los {fmt(tPeak, 3)} min).
              </p>
            )}
          </Card>

          {model && <Metrics meta={model.meta} />}
        </div>
      </div>
    </div>
  );
}

function ProbCard({
  icon,
  title,
  subtitle,
  p,
  alarm,
  tPeak,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  p: number | null;
  alarm: Alarm | null;
  tPeak: number | null;
}) {
  const pct = p === null ? 0 : Math.round(p * 100);
  return (
    <Card className={cn("space-y-2 p-4", alarm && "border-danger/60")}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-accent">{icon}</span>
        {title}
        {alarm && <BellRing className="ml-auto size-4 text-danger" />}
      </div>
      <div className="text-xs text-muted">{subtitle}</div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">P(runaway)</span>
        <span className={cn("num font-mono text-2xl font-semibold", pct > 50 ? "text-danger" : pct > 25 ? "text-warn" : "text-ok")}>
          {p === null ? "—" : `${pct} %`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full transition-all", pct > 50 ? "bg-danger" : pct > 25 ? "bg-warn" : "bg-ok")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {alarm && (
        <p className="text-xs text-danger">
          Alarma a los {fmt(alarm.t, 3)} min
          {tPeak !== null && tPeak > alarm.t && <> · {fmt(tPeak - alarm.t, 2)} min antes del pico</>}
        </p>
      )}
    </Card>
  );
}

function Metrics({ meta }: { meta: ForecastModelJson }) {
  const m = meta.metrics as {
    mae_by_horizon_K_before_peak: Record<string, number>;
    alarm_by_lead_min: Record<string, { detección: number; falsa_alarma: number }>;
  };
  return (
    <Card className="grid gap-4 p-4 text-xs text-muted md:grid-cols-2">
      <div>
        <div className="mb-1.5 text-sm font-semibold text-text">Precisión del ML antes del pico (corridas de prueba)</div>
        <table className="w-full">
          <tbody>
            {Object.entries(m.mae_by_horizon_K_before_peak).map(([h, v]) => (
              <tr key={h}>
                <td className="py-0.5">a {h} min</td>
                <td className="num py-0.5 text-right font-mono text-text">± {fmt(v, 2)} K</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <div className="mb-1.5 text-sm font-semibold text-text">Alarma del ML según anticipación</div>
        <table className="w-full">
          <thead>
            <tr>
              <th className="py-0.5 text-left font-normal">antes del pico</th>
              <th className="py-0.5 text-right font-normal">detecta</th>
              <th className="py-0.5 text-right font-normal">falsas alarmas</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(m.alarm_by_lead_min).map(([k, v]) => (
              <tr key={k}>
                <td className="py-0.5">{k} min</td>
                <td className="num py-0.5 text-right font-mono text-text">{(v.detección * 100).toFixed(0)} %</td>
                <td className="num py-0.5 text-right font-mono text-text">{(v.falsa_alarma * 100).toFixed(0)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2">Lejos del pico la red ya detecta la mayoría de los runaway, aunque con algunas falsas alarmas más; cerca del pico la alarma es casi segura.</p>
      </div>
    </Card>
  );
}
