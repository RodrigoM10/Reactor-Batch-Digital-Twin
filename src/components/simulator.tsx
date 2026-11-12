"use client";

import {
  AlertTriangle,
  Download,
  FileUp,
  Link2,
  Loader2,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fromV1Params, PRESETS, type ReactorParams, type SimOk, type V1Params } from "@/engine";
import { useReactorStore } from "@/lib/store";
import { useEngine } from "@/lib/use-engine";
import { cn, fmt, TIME_LABEL } from "@/lib/format";
import { Charts } from "./charts";
import { ParamsPanel, reactionEquation } from "./params-panel";
import { ReactorSchematic } from "./reactor-schematic";
import { SiteHeader } from "./site-header";
import { Card } from "./ui/fields";

const PLAY_SECONDS = 6;

export function Simulator() {
  const params = useReactorStore((s) => s.params);
  const presetId = useReactorStore((s) => s.presetId);
  const loadPreset = useReactorStore((s) => s.loadPreset);
  const replace = useReactorStore((s) => s.replace);
  const { output, pending } = useEngine(params);
  const [frac, setFrac] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Parámetros compartidos por enlace (#p=…)
  useEffect(() => {
    const m = window.location.hash.match(/^#p=(.+)$/);
    if (!m) return;
    try {
      replace(JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/"))))));
    } catch {
      /* enlace inválido: se ignora */
    }
  }, [replace]);

  // Reproducción animada del batch
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let done = false;
      setFrac((f) => {
        const next = f + dt / PLAY_SECONDS;
        if (next >= 1) {
          done = true;
          return 1;
        }
        return next;
      });
      if (done) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  };

  const result = output?.result;
  const sim = result?.ok ? result : null;
  const n = sim?.series.t.length ?? 0;
  const idx = sim ? Math.round(frac * (n - 1)) : 0;
  const tu = TIME_LABEL[params.timeUnit];

  const share = async () => {
    const json = JSON.stringify(params);
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_");
    const url = `${window.location.origin}${window.location.pathname}#p=${b64}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("Enlace copiado al portapapeles");
    } catch {
      window.history.replaceState(null, "", url);
      flash("Enlace listo en la barra de direcciones");
    }
  };

  const exportCsv = () => {
    if (!sim) return;
    const ids = Object.keys(sim.series.C);
    const head = [`t [${tu}]`, "X", "T [K]", ...ids.map((id) => `C_${id} [mol/L]`), `-r [mol/(L·${tu})]`, "Qg", "Qr"];
    const lines = sim.series.t.map((t, i) =>
      [t, sim.series.X[i], sim.series.T[i], ...ids.map((id) => sim.series.C[id][i]), sim.series.rate[i], sim.series.Qg[i], sim.series.Qr[i]].join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reactor-batch.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      // Acepta tanto un caso de la tesis (sim_params.json) como parámetros de la v2.
      const next: ReactorParams = "mode_op" in data ? fromV1Params(data as V1Params) : data;
      replace(next);
      flash("mode_op" in data ? "Caso de la tesis importado" : "Parámetros importados");
    } catch {
      flash("No se pudo leer el archivo JSON");
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader>
        <select
          aria-label="Casos de ejemplo"
          value={presetId ?? ""}
          onChange={(e) => {
            loadPreset(e.target.value);
            setFrac(1);
          }}
          className="max-w-[46vw] rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
        >
          {presetId === null && <option value="">Personalizado</option>}
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </SiteHeader>

      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 p-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit overflow-hidden lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Parámetros</h2>
            <div className="flex gap-1">
              <IconButton label="Importar JSON (tesis o v2)" onClick={() => fileRef.current?.click()}>
                <FileUp className="size-4" />
              </IconButton>
              <IconButton label="Restablecer caso" onClick={() => loadPreset(presetId ?? PRESETS[0].id)}>
                <RotateCcw className="size-4" />
              </IconButton>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {presetId && (
            <p className="border-b border-border bg-surface-2 px-4 py-2.5 text-xs text-muted">
              {PRESETS.find((p) => p.id === presetId)?.description}
            </p>
          )}
          <ParamsPanel />
        </Card>

        <div className="min-w-0 space-y-4">
          {result && !result.ok && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
              <span>{result.error}</span>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <Card className="relative flex flex-col">
              <div className="flex items-center justify-between px-4 pt-3">
                <span className="font-mono text-xs text-muted">{reactionEquation(params)}</span>
                {pending && <Loader2 className="size-4 animate-spin text-muted" aria-label="Calculando" />}
              </div>
              <div className="aspect-[34/30] w-full px-2">
                {sim ? (
                  <ReactorSchematic
                    T={sim.series.T[idx]}
                    X={sim.series.X[idx]}
                    Tlow={Math.min(params.energy.T0, params.energy.mode === "isothermal" ? Infinity : params.energy.T_cool)}
                    Thigh={Math.max(params.energy.T0 + Math.max(sim.summary.deltaT_ad, 40), sim.summary.T_max)}
                    mode={params.energy.mode}
                    T_cool={params.energy.T_cool}
                    T_cool_out={sim.series.T_cool_out?.[idx]}
                    runaway={sim.summary.runaway && sim.series.T[idx] > params.energy.T0 + 0.5 * sim.summary.deltaT_ad}
                  />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-muted">Sin resultados</div>
                )}
              </div>
              {sim && (
                <div className="flex items-center gap-3 border-t border-border px-4 py-3">
                  <button
                    type="button"
                    aria-label={playing ? "Pausar" : "Reproducir"}
                    onClick={() => {
                      if (!playing && frac >= 1) setFrac(0);
                      setPlaying((p) => !p);
                    }}
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white hover:opacity-90 dark:text-bg"
                  >
                    {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
                  </button>
                  <input
                    type="range"
                    aria-label="Tiempo"
                    min={0}
                    max={1}
                    step={0.001}
                    value={frac}
                    onChange={(e) => {
                      setPlaying(false);
                      setFrac(Number(e.target.value));
                    }}
                    className="flex-1"
                  />
                  <span className="num w-28 text-right font-mono text-xs">
                    {fmt(sim.series.t[idx])} {tu}
                  </span>
                </div>
              )}
            </Card>

            <div className="space-y-4">
              {sim && <Kpis sim={sim} params={params} />}
              {sim && sim.warnings.length > 0 && (
                <ul className="space-y-2">
                  {sim.warnings.map((w) => (
                    <li key={w} className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton onClick={exportCsv} disabled={!sim}>
                  <Download className="size-4" /> Exportar CSV
                </ActionButton>
                <ActionButton onClick={share}>
                  <Link2 className="size-4" /> Compartir escenario
                </ActionButton>
                {notice && <span className="text-xs text-accent">{notice}</span>}
                {sim && (
                  <span className="ml-auto text-xs text-muted">
                    Calculado en {fmt(sim.summary.elapsedMs, 2)} ms · {sim.summary.steps} pasos ·{" "}
                    {sim.summary.solver === "dopri5" ? "Dormand–Prince" : "Rosenbrock"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {sim && output && (
            <Card>
              <Charts params={params} sim={sim} xt={output.xt} lev={output.levenspiel} cursorT={sim.series.t[idx]} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpis({ sim, params }: { sim: SimOk; params: ReactorParams }) {
  const s = sim.summary;
  const tu = TIME_LABEL[params.timeUnit];
  const nonIso = params.energy.mode !== "isothermal";
  const stop = { target: "objetivo alcanzado", time: "tiempo fijado", complete: "reacción completa", t_max: "tiempo máximo" }[s.stopReason];
  const items: { label: string; value: string; sub?: string; tone?: "danger" | "accent" }[] = [
    { label: `Conversión X_${params.keySpecies}`, value: `${(s.X_end * 100).toFixed(2)} %`, sub: s.X_max < 1 ? `máx. estequiométrica ${fmt(s.X_max, 3)}` : undefined, tone: "accent" },
    { label: "Tiempo de reacción", value: `${fmt(s.t_end)} ${tu}`, sub: stop },
  ];
  if (nonIso)
    items.push({
      label: "T máxima",
      value: `${fmt(s.T_max)} K`,
      sub: `ΔT_ad = ${fmt(s.deltaT_ad, 3)} K`,
      tone: s.runaway ? "danger" : undefined,
    });
  if (s.X_eq0 !== null) items.push({ label: "X de equilibrio (T₀)", value: fmt(s.X_eq0), sub: `K_eq = ${fmt(s.Keq0)}` });
  items.push({ label: "k (T₀)", value: fmt(s.k0) });
  if (s.volume !== null) items.push({ label: "Volumen del reactor", value: `${fmt(s.volume)} L`, sub: `${fmt(s.volume / 1000, 3)} m³` });

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <Card key={it.label} className="px-3 py-2.5">
          <div className="text-[11px] text-muted">{it.label}</div>
          <div
            className={cn(
              "num mt-0.5 text-lg font-semibold",
              it.tone === "danger" && "text-danger",
              it.tone === "accent" && "text-accent",
            )}
          >
            {it.value}
          </div>
          {it.sub && <div className="text-[11px] text-muted">{it.sub}</div>}
        </Card>
      ))}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
    >
      {children}
    </button>
  );
}

function ActionButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-40"
    >
      {children}
    </button>
  );
}
