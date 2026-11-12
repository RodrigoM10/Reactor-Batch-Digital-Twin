import { fitParameters, fromTheta, type FitParam } from "./fit";
import { loadMlp, type Mlp, type MlpJson } from "./mlp";
import { simulate } from "./simulate";
import type { ReactorParams } from "./types";

/**
 * Pronóstico de una corrida en curso a partir de la temperatura medida hasta t_c.
 *  - ML: redes entrenadas con la planta virtual (ml/scripts/train_forecaster.py).
 *  - Física: reajuste MAP de k y UA con los datos disponibles + Monte Carlo sobre la incertidumbre.
 */

export type OpPoint = { T0: number; T_cool: number; ln_m_c: number; ln_UA: number };

export interface ForecastModelJson {
  preset: string;
  time_scale: number;
  nominal: ReactorParams;
  window: number;
  dt_window: number;
  horizons: number[];
  deltaT_ad: number;
  metrics: Record<string, unknown>;
  regressor: MlpJson;
  classifier: MlpJson;
}

export interface ForecastModel {
  meta: ForecastModelJson;
  reg: Mlp;
  clf: Mlp;
}

export interface ForecastResult {
  tc: number;
  path: { t: number; T: number }[]; // trayectoria pronosticada (incluye t_c)
  band?: { t: number; lo: number; hi: number }[];
  Tmax: number;
  pRunaway: number;
}

export function loadForecastModel(meta: ForecastModelJson): ForecastModel {
  return { meta, reg: loadMlp(meta.regressor), clf: loadMlp(meta.classifier) };
}

export function applyOp(nominal: ReactorParams, op: OpPoint): ReactorParams {
  const p = structuredClone(nominal);
  p.energy.T0 = op.T0;
  p.energy.T_cool = op.T_cool;
  p.energy.m_c = Math.exp(op.ln_m_c);
  p.energy.UA = Math.exp(op.ln_UA);
  return p;
}

/** Interpolación lineal con extremos constantes (como numpy.interp). */
function interp(x: number, xp: number[], fp: number[], n = xp.length): number {
  if (x <= xp[0]) return fp[0];
  if (x >= xp[n - 1]) return fp[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xp[mid] <= x) lo = mid;
    else hi = mid;
  }
  return fp[lo] + ((fp[hi] - fp[lo]) * (x - xp[lo])) / (xp[hi] - xp[lo]);
}

/** Mismas features que build_features() en train_forecaster.py. */
export function forecastFeatures(meta: ForecastModelJson, op: OpPoint, t: number[], T: number[], tc: number): number[] {
  let n = 0;
  while (n < t.length && t[n] <= tc + 1e-9) n++;
  const f = [op.T0, op.T_cool, op.ln_m_c, op.ln_UA, tc];
  for (let i = meta.window - 1; i >= 0; i--) {
    const tw = Math.max(tc - meta.dt_window * i, t[0]);
    f.push(interp(tw, t, T, Math.max(n, 1)) - op.T0);
  }
  return f;
}

export function riskReference(op: OpPoint, deltaT_ad: number) {
  return Math.max(op.T0, op.T_cool) + 0.5 * deltaT_ad;
}

export function mlForecast(m: ForecastModel, op: OpPoint, t: number[], T: number[], tc: number): ForecastResult {
  const x = forecastFeatures(m.meta, op, t, T, tc);
  const y = m.reg.predict(x);
  const Tc = x[x.length - 1] + op.T0;
  const path = [{ t: tc, T: Tc }, ...m.meta.horizons.map((h, i) => ({ t: tc + h, T: Tc + y[i] }))];
  // T_max de la corrida: lo ya medido (suavizado en 5 muestras) o lo que se pronostica a futuro
  let pastMax = -Infinity;
  for (let i = 2; i < t.length - 2 && t[i + 2] <= tc; i++) pastMax = Math.max(pastMax, (T[i - 2] + T[i - 1] + T[i] + T[i + 1] + T[i + 2]) / 5);
  const Tmax = Math.max(pastMax, op.T0 + y[m.meta.horizons.length], ...path.map((p) => p.T));
  return { tc, path, Tmax, pRunaway: m.clf.predict(x)[0] };
}

/** Normal estándar (Box–Muller) con semilla, para Monte Carlo reproducible. */
function gaussian(seed: number) {
  let s = seed >>> 0 || 1;
  const uni = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) + 0.5) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(uni())) * Math.cos(2 * Math.PI * uni());
}

export interface PhysicsForecastOptions {
  horizon: number;
  sigmaT?: number;
  samples?: number;
  params?: FitParam[];
  priors?: Partial<Record<FitParam, number>>;
}

export function physicsForecast(
  nominal: ReactorParams,
  op: OpPoint,
  t: number[],
  T: number[],
  tc: number,
  deltaT_ad: number,
  opts: PhysicsForecastOptions,
): ForecastResult | null {
  const base = applyOp(nominal, op);
  const idx = t.map((v, i) => i).filter((i) => t[i] <= tc + 1e-9);
  const names = opts.params ?? ["k", "UA"];
  const fit = fitParameters(
    base,
    { t: idx.map((i) => t[i]), T: idx.map((i) => T[i]) },
    { params: names, sigmaT: opts.sigmaT ?? 0.3, priors: opts.priors ?? { k: 0.4, UA: 0.3 }, maxIter: 25 },
  );
  if (!fit.ok) return null;

  const grid = Array.from({ length: 121 }, (_, i) => (opts.horizon * i) / 120);
  const run = (p: ReactorParams) => {
    const q = structuredClone(p);
    q.stop = { ...q.stop, mode: "time", t_final: opts.horizon };
    const r = simulate(q, { sampleTimes: grid });
    return r.ok ? r : null;
  };

  // Cholesky de la covarianza (p ≤ 4)
  const p = fit.theta.length;
  const L = fit.cov.map((row) => row.map(() => 0));
  for (let i = 0; i < p; i++)
    for (let j = 0; j <= i; j++) {
      let s = fit.cov[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 0)) : L[j][j] > 0 ? s / L[j][j] : 0;
    }

  const randn = gaussian(Math.round(tc * 1000) + 7);
  const n = opts.samples ?? 40;
  const paths: Float64Array[] = [];
  const ref = riskReference(op, deltaT_ad);
  let runaways = 0;
  for (let s = 0; s < n; s++) {
    const z = Array.from({ length: p }, randn);
    const th = fit.theta.map((v, i) => v + L[i].reduce((acc, l, k) => acc + l * z[k], 0));
    const r = run(fromTheta(base, fit.names, th, base.energy.T0));
    if (!r) continue;
    paths.push(Float64Array.from(r.series.T));
    if (r.summary.T_max > ref) runaways++;
  }
  const mean = run(fit.params);
  if (!mean || !paths.length) return null;

  const q = (arr: number[], f: number) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(f * (sorted.length - 1))))];
  };
  const band = grid.map((tt, i) => {
    const col = paths.map((pp) => pp[i]);
    return { t: tt, lo: q(col, 0.1), hi: q(col, 0.9) };
  });
  return {
    tc,
    path: grid.map((tt, i) => ({ t: tt, T: mean.series.T[i] })),
    band,
    Tmax: mean.summary.T_max,
    pRunaway: runaways / paths.length,
  };
}
