"use client";

import { ArrowLeftRight, ChevronDown, Maximize2, Minimize2, RotateCcw, SlidersHorizontal, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  usePlotArea,
  useXAxisInverseScale,
  useYAxisInverseScale,
  XAxis,
  YAxis,
} from "recharts";
import { cn, fmt } from "@/lib/format";

/**
 * Gráfico con controles: zoom por arrastre (recuadro o franja), intervalos manuales,
 * intercambio de ejes, escala log, series ocultables, pantalla completa y contraer.
 *
 * Los datos se describen como pares (u, v): u es la variable independiente (t, X) y
 * v la dependiente. Sin intercambiar, u va en el eje horizontal; intercambiados, en el vertical.
 * El zoom se guarda en términos de u y v, así que sobrevive al intercambio de ejes.
 */

export type Pt = { u: number; v: number };
export type BandPt = { u: number; v: [number, number] };
type Bound = number | "auto" | "dataMin" | "dataMax";
type Range = [number, number];

export interface AxisSpec {
  /** Rótulo del eje, p. ej. "t [min]". */
  label: string;
  /** Símbolo corto para el tooltip y los campos de intervalo, p. ej. "t". */
  name: string;
  /** Unidad para el tooltip. */
  unit?: string;
  domain?: [Bound, Bound];
  digits?: number;
  /** Escala log inicial (solo para v). */
  log?: boolean;
}

export interface SeriesSpec {
  id: string;
  name: string;
  color: string;
  kind?: "line" | "scatter" | "band";
  data: Pt[] | BandPt[];
  dashed?: boolean | string;
  width?: number;
  /** Radio de los marcadores (scatter o puntos sobre la línea). */
  dot?: number;
}

export interface RefSpec {
  axis: "u" | "v";
  value: number;
  color: string;
  label?: string;
  dashed?: boolean;
  opacity?: number;
}

interface View {
  swap: boolean;
  u: Range | null;
  v: Range | null;
  log: boolean;
  hidden: string[];
}

interface PlotProps {
  u: AxisSpec;
  v: AxisSpec;
  series: SeriesSpec[];
  refs?: RefSpec[];
  /** Contenido a la izquierda de la barra (título o pestañas). */
  header?: ReactNode;
  /** Texto debajo del gráfico. */
  footer?: ReactNode;
  height?: number;
  /** Cuando cambia, se descartan zoom, intercambio y series ocultas (p. ej. al cambiar de pestaña). */
  resetKey?: string;
  defaultSwap?: boolean;
}

const axisProps = {
  stroke: "var(--muted)",
  tick: { fill: "var(--muted)", fontSize: 11 },
  tickLine: false,
} as const;

const labelStyle = { fill: "var(--muted)", fontSize: 11 } as const;

export function Plot({ u, v, series, refs = [], header, footer, height = 340, resetKey = "", defaultSwap = false }: PlotProps) {
  const initial = (): View => ({ swap: defaultSwap, u: null, v: null, log: !!v.log, hidden: [] });
  const [view, setView] = useState<View>(initial);
  const [viewKey, setViewKey] = useState(resetKey);
  if (viewKey !== resetKey) {
    setViewKey(resetKey);
    setView(initial());
  }
  const [collapsed, setCollapsed] = useState(false);
  const [showRanges, setShowRanges] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === boxRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const { swap, log } = view;
  const shown = useMemo(() => {
    const vis = series.filter((s) => !view.hidden.includes(s.id) && !(swap && s.kind === "band"));
    // En escala log se descartan los valores no positivos.
    return log ? vis.map((s) => ({ ...s, data: (s.data as Pt[]).filter((p) => positive(p.v)) as Pt[] | BandPt[] })) : vis;
  }, [series, view.hidden, swap, log]);

  // Dominios numéricos vigentes (para el panel de intervalos, el alejar y el autoajuste).
  const extU = extent(shown, "u", false);
  const baseU = resolve(u.domain, extU);
  const curU = view.u ?? baseU;
  const extV = extent(shown, "v", log);
  const baseV = log ? padLog(extV) : resolve(v.domain, extV);
  // Con u acotado y v libre, v se ajusta a lo que queda visible.
  const curV = view.v ?? (view.u ? fit(extent(shown, "v", log, view.u), log) : baseV);
  const zoomed = view.u !== null || view.v !== null;

  // Dominio que recibe Recharts: el del spec mientras no haya zoom (ticks "lindos").
  const domU: [Bound, Bound] = zoomed ? curU : (u.domain ?? ["auto", "auto"]);
  const domV: [Bound, Bound] = zoomed ? curV : log ? ["auto", "auto"] : (v.domain ?? ["auto", "auto"]);

  const H = swap ? { spec: v, dom: domV, key: "v", log } : { spec: u, dom: domU, key: "u", log: false };
  const Vt = swap ? { spec: u, dom: domU, key: "u", log: false } : { spec: v, dom: domV, key: "v", log };

  const onZoom = (xr: Range | null, yr: Range | null) => {
    const ur = swap ? yr : xr;
    const vr = swap ? xr : yr;
    setView((s) => ({ ...s, u: ur ?? s.u, v: vr ?? (ur ? null : s.v) }));
  };
  const zoomOut = () =>
    setView((s) => {
      const nu = s.u ? widen(s.u, false) : null;
      const nv = s.v ? widen(s.v, log) : null;
      return { ...s, u: nu && !covers(nu, baseU) ? nu : null, v: nv && !covers(nv, baseV) ? nv : null };
    });
  const reset = () => setView((s) => ({ ...s, u: null, v: null }));
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void boxRef.current?.requestFullscreen();
  };

  const refEl = (r: RefSpec, i: number) => {
    const onX = (r.axis === "u") !== swap;
    return (
      <ReferenceLine
        key={`ref-${i}`}
        {...(onX ? { x: r.value } : { y: r.value })}
        stroke={r.color}
        strokeOpacity={r.opacity ?? 1}
        strokeDasharray={r.dashed ? "4 4" : undefined}
        ifOverflow="discard"
        label={r.label ? { value: r.label, fill: r.color, fontSize: 11, position: "insideTopRight" } : undefined}
      />
    );
  };

  const seriesEl = (s: SeriesSpec) => {
    const dash = s.dashed === true ? "6 4" : s.dashed || undefined;
    if (s.kind === "band")
      return <Area key={s.id} data={s.data as BandPt[]} dataKey="v" name={s.name} stroke="none" fill={s.color} fillOpacity={0.18} isAnimationActive={false} />;
    if (s.kind === "scatter")
      return (
        <Scatter
          key={s.id}
          data={s.data as Pt[]}
          dataKey={Vt.key}
          name={s.name}
          fill={s.color}
          shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={s.dot ?? 2.5} fill={s.color} />}
          isAnimationActive={false}
        />
      );
    return (
      <Line
        key={s.id}
        data={s.data as Pt[]}
        dataKey={Vt.key}
        name={s.name}
        stroke={s.color}
        strokeWidth={s.width ?? 2}
        strokeDasharray={dash}
        dot={s.dot ? { r: s.dot } : false}
        isAnimationActive={false}
      />
    );
  };

  return (
    <div ref={boxRef} className={cn(fullscreen && "flex h-full flex-col bg-surface p-4")}>
      <div className="flex items-center gap-2 border-b border-border pr-2">
        <div className="min-w-0 flex-1">{header}</div>
        {!collapsed && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconBtn label="Alejar" onClick={zoomOut} disabled={!zoomed}>
              <ZoomOut className="size-4" />
            </IconBtn>
            <IconBtn label="Restablecer zoom" onClick={reset} disabled={!zoomed}>
              <RotateCcw className="size-4" />
            </IconBtn>
            <IconBtn label="Elegir intervalos" onClick={() => setShowRanges((o) => !o)} active={showRanges}>
              <SlidersHorizontal className="size-4" />
            </IconBtn>
            <IconBtn label="Intercambiar ejes" onClick={() => setView((s) => ({ ...s, swap: !s.swap }))} active={swap}>
              <ArrowLeftRight className="size-4" />
            </IconBtn>
            <IconBtn label={`Escala logarítmica en ${v.name}`} onClick={() => setView((s) => ({ ...s, log: !s.log, v: null }))} active={log}>
              <span className="px-0.5 font-mono text-[11px] font-semibold">log</span>
            </IconBtn>
            <IconBtn label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </IconBtn>
          </div>
        )}
        {!fullscreen && (
          <IconBtn label={collapsed ? "Expandir gráfico" : "Contraer gráfico"} onClick={() => setCollapsed((c) => !c)}>
            <ChevronDown className={cn("size-4 transition-transform", !collapsed && "rotate-180")} />
          </IconBtn>
        )}
      </div>

      {!collapsed && (
        <>
          {showRanges && (
            <RangePanel
              key={`${curU}|${curV}|${swap}`}
              h={swap ? { spec: v, cur: curV } : { spec: u, cur: curU }}
              vt={swap ? { spec: u, cur: curU } : { spec: v, cur: curV }}
              onApply={(hr, vr) => setView((s) => ({ ...s, u: swap ? vr : hr, v: swap ? hr : vr }))}
              onAuto={reset}
              log={log}
              vIsHorizontal={swap}
            />
          )}

          <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pt-2 text-xs">
            {series.map((s) => {
              const off = view.hidden.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={!off}
                  title={off ? "Mostrar serie" : "Ocultar serie"}
                  onClick={() =>
                    setView((st) => ({ ...st, hidden: off ? st.hidden.filter((h) => h !== s.id) : [...st.hidden, s.id] }))
                  }
                  className={cn("flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-surface-2", off && "text-muted line-through opacity-60")}
                >
                  <Swatch s={s} />
                  {s.name}
                </button>
              );
            })}
          </div>

          <div className={cn("p-2 select-none", fullscreen && "min-h-0 flex-1")} style={fullscreen ? undefined : { height }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 8, right: 16, bottom: 16, left: 8 }}>
                <CartesianGrid stroke="var(--grid)" />
                <XAxis
                  {...axisProps}
                  dataKey={H.key}
                  type="number"
                  scale={H.log ? "log" : "auto"}
                  domain={H.dom}
                  allowDataOverflow={zoomed}
                  allowDuplicatedCategory={false}
                  tickFormatter={(x) => fmt(x, H.spec.digits ?? 3)}
                  label={{ value: H.spec.label, position: "insideBottomRight", offset: -4, ...labelStyle }}
                />
                <YAxis
                  {...axisProps}
                  dataKey={Vt.key}
                  type="number"
                  scale={Vt.log ? "log" : "auto"}
                  domain={Vt.dom}
                  allowDataOverflow={zoomed}
                  tickFormatter={(y) => fmt(y, Vt.spec.digits ?? 3)}
                  label={{ value: Vt.spec.label, angle: -90, position: "insideLeft", ...labelStyle }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--text)",
                  }}
                  labelStyle={{ color: "var(--muted)" }}
                  labelFormatter={(x) => `${H.spec.name} = ${fmt(x as number)}${H.spec.unit ? ` ${H.spec.unit}` : ""}`}
                  formatter={(y: unknown) => {
                    const unit = Vt.spec.unit ? ` ${Vt.spec.unit}` : "";
                    return Array.isArray(y) ? `${fmt(y[0], 4)} – ${fmt(y[1], 4)}${unit}` : `${fmt(y as number)}${unit}`;
                  }}
                />
                {shown.map(seriesEl)}
                {refs.map(refEl)}
                <ZoomLayer onZoom={onZoom} onReset={reset} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 px-4 pb-3 text-xs text-muted">
            {footer && <p className="flex-1">{footer}</p>}
            <p className="ml-auto">Arrastrá para hacer zoom · doble clic para restablecer</p>
          </div>
        </>
      )}
    </div>
  );
}

/** Capa transparente sobre el área de trazado que convierte un arrastre en rangos de datos. */
function ZoomLayer({ onZoom, onReset }: { onZoom: (x: Range | null, y: Range | null) => void; onReset: () => void }) {
  const area = usePlotArea();
  const ix = useXAxisInverseScale();
  const iy = useYAxisInverseScale();
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  if (!area || !ix || !iy) return null;

  const clampX = (x: number) => Math.min(Math.max(x, area.x), area.x + area.width);
  const clampY = (y: number) => Math.min(Math.max(y, area.y), area.y + area.height);
  const pos = (e: ReactPointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    return { x: clampX(e.clientX - r.left), y: clampY(e.clientY - r.top) };
  };
  const MIN = 8; // px: por debajo, ese eje no se acota

  const finish = () => {
    if (!drag) return;
    const dx = Math.abs(drag.x1 - drag.x0);
    const dy = Math.abs(drag.y1 - drag.y0);
    setDrag(null);
    if (dx < MIN && dy < MIN) return;
    const xr = dx >= MIN ? sorted(Number(ix(drag.x0)), Number(ix(drag.x1))) : null;
    const yr = dy >= MIN ? sorted(Number(iy(drag.y0)), Number(iy(drag.y1))) : null;
    onZoom(xr, yr);
  };

  // Franja completa en el eje que no se acota, para que se vea qué se va a ampliar.
  let sel: { x: number; y: number; w: number; h: number } | null = null;
  if (drag) {
    const dx = Math.abs(drag.x1 - drag.x0);
    const dy = Math.abs(drag.y1 - drag.y0);
    sel = {
      x: dx >= MIN ? Math.min(drag.x0, drag.x1) : area.x,
      w: dx >= MIN ? dx : area.width,
      y: dy >= MIN ? Math.min(drag.y0, drag.y1) : area.y,
      h: dy >= MIN ? dy : area.height,
    };
    if (dx < MIN && dy < MIN) sel = null;
  }

  return (
    <g>
      {sel && <rect x={sel.x} y={sel.y} width={sel.w} height={sel.h} fill="var(--accent)" fillOpacity={0.12} stroke="var(--accent)" strokeOpacity={0.5} />}
      <rect
        x={area.x}
        y={area.y}
        width={area.width}
        height={area.height}
        fill="transparent"
        style={{ cursor: "crosshair", touchAction: "none" }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = pos(e);
          setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const p = pos(e);
          setDrag({ ...drag, x1: p.x, y1: p.y });
        }}
        onPointerUp={finish}
        onPointerCancel={() => setDrag(null)}
        onDoubleClick={onReset}
      />
    </g>
  );
}

function RangePanel({
  h,
  vt,
  onApply,
  onAuto,
  log,
  vIsHorizontal,
}: {
  h: { spec: AxisSpec; cur: Range };
  vt: { spec: AxisSpec; cur: Range };
  onApply: (h: Range, v: Range) => void;
  onAuto: () => void;
  log: boolean;
  vIsHorizontal: boolean;
}) {
  const [d, setD] = useState(() => [h.cur[0], h.cur[1], vt.cur[0], vt.cur[1]].map((x) => fmt(x, 5)));
  const nums = d.map(Number);
  const okH = Number.isFinite(nums[0]) && Number.isFinite(nums[1]) && nums[0] < nums[1] && d[0] !== "" && d[1] !== "";
  const okV = Number.isFinite(nums[2]) && Number.isFinite(nums[3]) && nums[2] < nums[3] && d[2] !== "" && d[3] !== "";
  const logBad = log && (vIsHorizontal ? nums[0] <= 0 : nums[2] <= 0);
  const ok = okH && okV && !logBad;
  const field = (i: number, label: string) => (
    <label className="flex items-center gap-1.5">
      <span className="text-muted">{label}</span>
      <input
        value={d[i]}
        inputMode="decimal"
        onChange={(e) => setD((o) => o.map((x, j) => (j === i ? e.target.value : x)))}
        onKeyDown={(e) => e.key === "Enter" && ok && onApply([nums[0], nums[1]], [nums[2], nums[3]])}
        className="num w-24 rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs"
      />
    </label>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-surface-2 px-4 py-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium">Horizontal ({h.spec.name})</span>
        {field(0, "de")}
        {field(1, "a")}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-medium">Vertical ({vt.spec.name})</span>
        {field(2, "de")}
        {field(3, "a")}
      </div>
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          disabled={!ok}
          onClick={() => onApply([nums[0], nums[1]], [nums[2], nums[3]])}
          className="rounded-md bg-accent px-3 py-1 font-medium text-white disabled:opacity-40 dark:text-bg"
        >
          Aplicar
        </button>
        <button type="button" onClick={onAuto} className="rounded-md border border-border px-3 py-1 text-muted hover:text-text">
          Automático
        </button>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid h-8 min-w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-35",
        active && "bg-surface-2 text-accent",
      )}
    >
      {children}
    </button>
  );
}

function Swatch({ s }: { s: SeriesSpec }) {
  if (s.kind === "band") return <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: s.color, opacity: 0.35 }} />;
  if (s.kind === "scatter") return <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />;
  return (
    <svg width="18" height="6" aria-hidden>
      <line x1="0" y1="3" x2="18" y2="3" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dashed === true ? "5 3" : s.dashed || undefined} />
    </svg>
  );
}

// ---------- dominios ----------

const positive = (x: number | [number, number]) => (Array.isArray(x) ? x[0] > 0 && x[1] > 0 : x > 0);

function extent(series: SeriesSpec[], key: "u" | "v", log: boolean, uWithin?: Range): Range | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series)
    for (const p of s.data as (Pt | BandPt)[]) {
      if (uWithin && (p.u < uWithin[0] || p.u > uWithin[1])) continue;
      for (const x of Array.isArray(p[key]) ? (p[key] as number[]) : [p[key] as number]) {
        if (!Number.isFinite(x) || (log && x <= 0)) continue;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
  return lo <= hi ? [lo, hi] : null;
}

function resolve(domain: [Bound, Bound] | undefined, ext: Range | null): Range {
  const e = ext ?? [0, 1];
  const d = domain ?? ["auto", "auto"];
  const lo = typeof d[0] === "number" ? d[0] : e[0];
  const hi = typeof d[1] === "number" ? d[1] : e[1];
  return lo < hi ? [lo, hi] : [lo - (Math.abs(lo) || 1) * 0.05, hi + (Math.abs(hi) || 1) * 0.05];
}

function fit(ext: Range | null, log: boolean): Range {
  if (!ext) return [0, 1];
  if (log) return padLog(ext);
  const [lo, hi] = ext;
  const pad = hi > lo ? (hi - lo) * 0.05 : Math.abs(lo) * 0.05 || 1;
  return [lo - pad, hi + pad];
}

function padLog(ext: Range | null): Range {
  if (!ext) return [0.1, 1];
  return [ext[0] / 1.1, ext[1] * 1.1];
}

function widen([a, b]: Range, log: boolean): Range {
  if (log) {
    const r = Math.sqrt(b / a);
    return [a / r, b * r];
  }
  const w = (b - a) / 2;
  return [a - w, b + w];
}

const covers = (r: Range, base: Range) => r[0] <= base[0] && r[1] >= base[1];
const sorted = (a: number, b: number): Range => (a < b ? [a, b] : [b, a]);
