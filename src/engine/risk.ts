import { loadMlp, type Mlp, type MlpJson } from "./mlp";
import type { ReactorParams } from "./types";

/**
 * Mapa de operación segura con el modelo sustituto entrenado en ml/scripts/train_risk_surrogate.py.
 * Variables: T0, T_cool, ln m_c, ln UA. El resto del reactor (reacción, cinética, ΔH, Cp) queda fijo:
 * el sustituto solo es válido para el caso con el que se entrenó.
 */

export type RiskFeature = "T0" | "T_cool" | "ln_m_c" | "ln_UA";

export interface RiskModelJson {
  preset: string;
  features: RiskFeature[];
  ranges: Record<RiskFeature, [number, number]>;
  deltaT_ad: number;
  runaway_threshold: number;
  horizon_min: number;
  metrics: { mae_K: number; p95_K: number; max_K: number; runaway_accuracy: number; n_train: number; n_test: number };
  mlp: MlpJson;
}

export interface RiskModel {
  meta: RiskModelJson;
  mlp: Mlp;
  /** T_max predicha [K] para un punto de operación. */
  tMax: (x: Record<RiskFeature, number>) => number;
}

export const FEATURE_INFO: Record<RiskFeature, { label: string; unit: string; log: boolean }> = {
  T0: { label: "Temperatura inicial T₀", unit: "K", log: false },
  T_cool: { label: "Temperatura del refrigerante", unit: "K", log: false },
  ln_m_c: { label: "Caudal de refrigerante m_c", unit: "kg/min", log: true },
  ln_UA: { label: "U·A", unit: "cal/(min·K)", log: true },
};

export function loadRiskModel(meta: RiskModelJson): RiskModel {
  const mlp = loadMlp(meta.mlp);
  const buf = new Float64Array(meta.features.length);
  return {
    meta,
    mlp,
    tMax: (x) => {
      meta.features.forEach((f, i) => (buf[i] = x[f]));
      const y = mlp.predict(buf)[0];
      return Math.max(x.T0, x.T_cool) + y * meta.deltaT_ad;
    },
  };
}

export function operatingPoint(p: ReactorParams): Record<RiskFeature, number> {
  return {
    T0: p.energy.T0,
    T_cool: p.energy.T_cool,
    ln_m_c: Math.log(p.energy.m_c),
    ln_UA: Math.log(p.energy.UA),
  };
}

export function applyOperatingPoint(p: ReactorParams, x: Record<RiskFeature, number>): ReactorParams {
  const q = structuredClone(p);
  q.energy.T0 = x.T0;
  q.energy.T_cool = x.T_cool;
  q.energy.m_c = Math.exp(x.ln_m_c);
  q.energy.UA = Math.exp(x.ln_UA);
  return q;
}

export function isRunaway(m: RiskModel, x: Record<RiskFeature, number>, Tmax: number) {
  return Tmax - Math.max(x.T0, x.T_cool) > m.meta.runaway_threshold * m.meta.deltaT_ad;
}

export interface RiskGrid {
  nx: number;
  ny: number;
  xs: number[];
  ys: number[];
  tMax: Float64Array; // [iy·nx + ix]
  rise: Float64Array; // (T_max − ref)/ΔT_ad
  elapsedMs: number;
}

/** Evalúa el sustituto en una grilla de dos variables, con las otras dos fijas en `base`. */
export function riskGrid(
  m: RiskModel,
  base: Record<RiskFeature, number>,
  xf: RiskFeature,
  yf: RiskFeature,
  nx = 120,
  ny = 90,
): RiskGrid {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const [x0, x1] = m.meta.ranges[xf];
  const [y0, y1] = m.meta.ranges[yf];
  const xs = Array.from({ length: nx }, (_, i) => x0 + ((x1 - x0) * i) / (nx - 1));
  const ys = Array.from({ length: ny }, (_, j) => y0 + ((y1 - y0) * j) / (ny - 1));
  const tMax = new Float64Array(nx * ny);
  const rise = new Float64Array(nx * ny);
  const pt = { ...base };
  for (let j = 0; j < ny; j++) {
    pt[yf] = ys[j];
    for (let i = 0; i < nx; i++) {
      pt[xf] = xs[i];
      const T = m.tMax(pt);
      tMax[j * nx + i] = T;
      rise[j * nx + i] = (T - Math.max(pt.T0, pt.T_cool)) / m.meta.deltaT_ad;
    }
  }
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { nx, ny, xs, ys, tMax, rise, elapsedMs: t1 - t0 };
}

/** ¿Los parámetros del reactor coinciden con el caso para el que se entrenó el sustituto? */
export function matchesSurrogate(p: ReactorParams, reference: ReactorParams): boolean {
  const key = (q: ReactorParams) =>
    JSON.stringify({
      s: q.species.map((s) => [s.id, s.nu, s.C0, s.Cp, s.order]),
      k: [q.kinetics.mode, q.kinetics.A, q.kinetics.E],
      h: q.deltaH,
      r: q.reversible,
      e: [q.energy.mode, q.energy.V, q.energy.Cp_c],
    });
  return key(p) === key(reference);
}
