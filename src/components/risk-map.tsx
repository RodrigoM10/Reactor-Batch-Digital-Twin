"use client";

import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Target } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PRESETS } from "@/engine";
import {
  applyOperatingPoint,
  FEATURE_INFO,
  isRunaway,
  loadRiskModel,
  matchesSurrogate,
  operatingPoint,
  riskGrid,
  type RiskFeature,
  type RiskModel,
  type RiskModelJson,
} from "@/engine/risk";
import { cn, fmt } from "@/lib/format";
import { useReactorStore } from "@/lib/store";
import { useEngineWorker } from "@/lib/use-engine";
import { SiteHeader } from "./site-header";
import { Card, NumberField, SelectField } from "./ui/fields";

const FEATURES: RiskFeature[] = ["T0", "T_cool", "ln_m_c", "ln_UA"];
const NX = 100;
const NY = 66;

/** Color según el aumento relativo de temperatura (T_max − ref)/ΔT_ad: verde → ámbar → rojo. */
function riseColor(r: number): [number, number, number] {
  const x = Math.min(Math.max(r / 0.75, 0), 1);
  const hue = 140 * (1 - x);
  const s = 0.62;
  const l = 0.47;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

const display = (f: RiskFeature, v: number) => (FEATURE_INFO[f].log ? Math.exp(v) : v);

export function RiskMapView() {
  const params = useReactorStore((s) => s.params);
  const loadPreset = useReactorStore((s) => s.loadPreset);
  const replace = useReactorStore((s) => s.replace);
  const api = useEngineWorker();
  const [model, setModel] = useState<RiskModel | null>(null);
  const [xf, setXf] = useState<RiskFeature>("T0");
  const [yf, setYf] = useState<RiskFeature>("ln_m_c");
  const [hover, setHover] = useState<{ x: number; y: number; T: number } | null>(null);
  const [check, setCheck] = useState<{ pts: { x: number; y: number; ok: boolean; err: number }[]; mae: number; acc: number; ms: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetch("/models/risk-icq.json")
      .then((r) => r.json())
      .then((m: RiskModelJson) => setModel(loadRiskModel(m)));
  }, []);

  const reference = PRESETS.find((p) => p.id === (model?.meta.preset ?? "runaway"))!.params;
  const valid = matchesSurrogate(params, reference);
  const op = operatingPoint(params);
  const others = FEATURES.filter((f) => f !== xf && f !== yf);

  const grid = useMemo(() => (model && valid ? riskGrid(model, op, xf, yf, NX, NY) : null), [model, valid, xf, yf, op.T0, op.T_cool, op.ln_m_c, op.ln_UA]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !grid) return;
    c.width = grid.nx;
    c.height = grid.ny;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(grid.nx, grid.ny);
    for (let j = 0; j < grid.ny; j++)
      for (let i = 0; i < grid.nx; i++) {
        const k = j * grid.nx + i;
        const r = grid.rise[k];
        let [R, G, B] = riseColor(r);
        // Frontera de runaway: celdas donde el umbral cambia con su vecina
        const thr = model!.meta.runaway_threshold;
        const right = i < grid.nx - 1 ? grid.rise[k + 1] : r;
        const up = j < grid.ny - 1 ? grid.rise[k + grid.nx] : r;
        if ((r > thr) !== (right > thr) || (r > thr) !== (up > thr)) [R, G, B] = [20, 20, 20];
        const p = ((grid.ny - 1 - j) * grid.nx + i) * 4; // eje y hacia arriba
        img.data.set([R, G, B, 255], p);
      }
    ctx.putImageData(img, 0, 0);
  }, [grid, model]);

  const setPoint = (patch: Partial<Record<RiskFeature, number>>) => replace(applyOperatingPoint(params, { ...op, ...patch }));

  const range = (f: RiskFeature) => model!.meta.ranges[f];
  const frac = (f: RiskFeature, v: number) => (v - range(f)[0]) / (range(f)[1] - range(f)[0]);

  const pointer = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = 1 - (e.clientY - rect.top) / rect.height;
    const x = range(xf)[0] + fx * (range(xf)[1] - range(xf)[0]);
    const y = range(yf)[0] + fy * (range(yf)[1] - range(yf)[0]);
    return { x, y };
  };

  const verify = async () => {
    if (!model || !api.current) return;
    setChecking(true);
    const n = 12;
    const pts: { x: number; y: number; pt: Record<RiskFeature, number> }[] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = range(xf)[0] + ((i + 0.5) / n) * (range(xf)[1] - range(xf)[0]);
        const y = range(yf)[0] + ((j + 0.5) / n) * (range(yf)[1] - range(yf)[0]);
        pts.push({ x, y, pt: { ...op, [xf]: x, [yf]: y } });
      }
    try {
      const t0 = performance.now();
      const exact = await api.current.exactTmax(
        pts.map((p) => applyOperatingPoint(params, p.pt)),
        model.meta.horizon_min,
      );
      const res = pts.map((p, k) => {
        const pred = model.tMax(p.pt);
        return { x: p.x, y: p.y, ok: isRunaway(model, p.pt, pred) === isRunaway(model, p.pt, exact[k]), err: Math.abs(pred - exact[k]) };
      });
      setCheck({
        pts: res,
        mae: res.reduce((a, r) => a + r.err, 0) / res.length,
        acc: res.filter((r) => r.ok).length / res.length,
        ms: performance.now() - t0,
      });
    } finally {
      setChecking(false);
    }
  };

  const currentT = model && valid ? model.tMax(op) : null;
  const currentRunaway = model && currentT !== null ? isRunaway(model, op, currentT) : false;
  const featureOptions = FEATURES.map((f) => ({ value: f, label: FEATURE_INFO[f].label }));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 p-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4 text-accent" /> Mapa de operación segura
            </h2>
            <p className="text-xs text-muted">
              Una red neuronal entrenada con {model ? model.meta.metrics.n_train.toLocaleString("es-AR") : "miles de"}{" "}
              simulaciones predice la temperatura máxima al instante. Cada píxel del mapa es una corrida que el motor
              tardaría milisegundos en calcular; el sustituto calcula el mapa completo en un instante.
            </p>
            <SelectField label="Eje horizontal" value={xf} options={featureOptions.filter((o) => o.value !== yf)} onChange={(v) => { setXf(v as RiskFeature); setCheck(null); }} />
            <SelectField label="Eje vertical" value={yf} options={featureOptions.filter((o) => o.value !== xf)} onChange={(v) => { setYf(v as RiskFeature); setCheck(null); }} />
            {model &&
              valid &&
              others.map((f) => (
                <NumberField
                  key={f}
                  label={FEATURE_INFO[f].label}
                  unit={FEATURE_INFO[f].unit}
                  value={display(f, op[f])}
                  slider={{
                    min: display(f, range(f)[0]),
                    max: display(f, range(f)[1]),
                    log: FEATURE_INFO[f].log,
                  }}
                  onChange={(v) => {
                    setPoint({ [f]: FEATURE_INFO[f].log ? Math.log(Math.max(v, 1e-9)) : v });
                    setCheck(null);
                  }}
                />
              ))}
          </Card>

          {model && (
            <Card className="space-y-1.5 p-4 text-xs text-muted">
              <div className="text-sm font-semibold text-text">Precisión del sustituto (datos de prueba)</div>
              <div>
                Error medio de T_max: <span className="num font-mono text-text">{fmt(model.meta.metrics.mae_K, 2)} K</span> · p95{" "}
                <span className="num font-mono text-text">{fmt(model.meta.metrics.p95_K, 2)} K</span>
              </div>
              <div>
                Acierto en runaway: <span className="num font-mono text-text">{(model.meta.metrics.runaway_accuracy * 100).toFixed(1)} %</span>
              </div>
              <div>
                Red 4 → 64 → 64 → 64 → 1 (tanh), {model.meta.metrics.n_test.toLocaleString("es-AR")} corridas de prueba.
              </div>
              <button
                type="button"
                onClick={verify}
                disabled={checking || !valid}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text hover:border-accent hover:text-accent disabled:opacity-40"
              >
                {checking ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Verificar con el motor (144 corridas)
              </button>
              {check && (
                <p className="text-text">
                  Motor vs. sustituto en esta vista: error medio <span className="num font-mono">{fmt(check.mae, 2)} K</span>, misma
                  clasificación en <span className="num font-mono">{(check.acc * 100).toFixed(0)} %</span> de los puntos. El
                  motor tardó <span className="num font-mono">{fmt(check.ms / 1000, 2)} s</span> en 144 corridas: el mapa completo
                  le llevaría ~<span className="num font-mono">{fmt(((check.ms / 144) * NX * NY) / 1000, 2)} s</span>.
                </p>
              )}
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {!valid && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
              <AlertTriangle className="size-4 shrink-0 text-warn" />
              <span className="flex-1">
                Este sustituto se entrenó para el caso <strong>Camisa ICQ</strong> (reacción, cinética y calores fijos).
                Para otra reacción hay que regenerar el dataset y re-entrenarlo; esa es la principal limitación de un modelo
                sustituto frente al motor.
              </span>
              <button
                type="button"
                onClick={() => loadPreset(model?.meta.preset ?? "runaway")}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white dark:text-bg"
              >
                Cargar ese caso
              </button>
            </div>
          )}

          {model && valid && grid && (
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5">
                  <Target className="size-4" /> Punto actual: T_max ≈{" "}
                  <span className={cn("num font-mono font-semibold", currentRunaway ? "text-danger" : "text-ok")}>{fmt(currentT, 4)} K</span>
                  <span className={cn("text-xs", currentRunaway ? "text-danger" : "text-ok")}>{currentRunaway ? "runaway" : "seguro"}</span>
                </span>
                {hover && (
                  <span className="text-muted">
                    Cursor: {fmt(display(xf, hover.x), 4)} {FEATURE_INFO[xf].unit} · {fmt(display(yf, hover.y), 4)} {FEATURE_INFO[yf].unit} → T_max ≈{" "}
                    <span className="num font-mono text-text">{fmt(hover.T, 4)} K</span>
                  </span>
                )}
                <span className="ml-auto text-xs text-muted">{NX * NY} predicciones en {fmt(grid.elapsedMs, 2)} ms</span>
              </div>

              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                <div className="flex w-5 items-center justify-center">
                  <span className="-rotate-90 text-xs whitespace-nowrap text-muted">
                    {FEATURE_INFO[yf].label} [{FEATURE_INFO[yf].unit}]{FEATURE_INFO[yf].log ? " (log)" : ""}
                  </span>
                </div>
                <div>
                  <div
                    className="relative aspect-[16/9] w-full cursor-crosshair overflow-hidden rounded-lg border border-border"
                    onMouseMove={(e) => {
                      const { x, y } = pointer(e);
                      setHover({ x, y, T: model.tMax({ ...op, [xf]: x, [yf]: y }) });
                    }}
                    onMouseLeave={() => setHover(null)}
                    onClick={(e) => {
                      const { x, y } = pointer(e);
                      setPoint({ [xf]: x, [yf]: y });
                      setCheck(null);
                    }}
                  >
                    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ imageRendering: "auto" }} />
                    {check?.pts.map((p, k) => (
                      <span
                        key={k}
                        title={`error ${fmt(p.err, 2)} K`}
                        className={cn("absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border border-white", p.ok ? "bg-white/70" : "bg-black")}
                        style={{ left: `${frac(xf, p.x) * 100}%`, bottom: `${frac(yf, p.y) * 100}%` }}
                      />
                    ))}
                    <span
                      className="absolute size-5 -translate-x-1/2 translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_2px_rgba(0,0,0,0.6)]"
                      style={{ left: `${frac(xf, op[xf]) * 100}%`, bottom: `${frac(yf, op[yf]) * 100}%` }}
                      aria-label="Punto de operación actual"
                    />
                  </div>
                  <Axis f={xf} range={range(xf)} />
                  <div className="text-center text-xs text-muted">
                    {FEATURE_INFO[xf].label} [{FEATURE_INFO[xf].unit}]{FEATURE_INFO[xf].log ? " (log)" : ""}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-40 rounded" style={{ background: `linear-gradient(90deg, ${[0, 0.19, 0.38, 0.56, 0.75].map((r) => `rgb(${riseColor(r).join(",")})`).join(",")})` }} />
                  aumento de T: 0 → ≥ 75 % de ΔT_ad ({fmt(model.meta.deltaT_ad, 3)} K)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-5 bg-black" /> frontera de runaway (50 % de ΔT_ad)
                </span>
                {check && (
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full border border-white bg-black" /> el sustituto clasifica distinto que el motor
                  </span>
                )}
                <Link href="/simulador" className="ml-auto text-accent hover:underline">
                  Ver el punto actual en Simular →
                </Link>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Axis({ f, range }: { f: RiskFeature; range: [number, number] }) {
  const ticks = Array.from({ length: 5 }, (_, i) => range[0] + ((range[1] - range[0]) * i) / 4);
  return (
    <div className="relative mt-1 h-4 text-[11px] text-muted">
      {ticks.map((t, i) => (
        <span key={i} className="num absolute -translate-x-1/2" style={{ left: `${(i / 4) * 100}%` }}>
          {fmt(display(f, t), 3)}
        </span>
      ))}
    </div>
  );
}
