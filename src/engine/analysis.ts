import { compileModel, equilibriumConversion, makeThermoEvaluator, rateAt } from "./model/kinetics";
import { mixtureHeatCapacity } from "./model/thermo";
import { goldenMax } from "./solvers/brent";
import type { ReactorParams, SimOk } from "./types";

export interface XTPoint {
  T: number;
  X: number;
}

export interface XTDiagram {
  Tmin: number;
  Tmax: number;
  equilibrium: XTPoint[] | null; // X_eq(T)
  adiabatic: XTPoint[] | null; // recta adiabática desde T0
  optimal: XTPoint[] | null; // T de máxima velocidad para cada X (reversible exotérmica)
  trajectory: XTPoint[];
}

/** Diagrama conversión–temperatura: equilibrio, recta adiabática, curva de T óptima y trayectoria simulada. */
export function xtDiagram(p: ReactorParams, sim: SimOk): XTDiagram {
  const m = compileModel(p);
  const thermo = makeThermoEvaluator(p);
  const { T } = sim.series;
  const lo = Math.min(...T, p.energy.mode === "isothermal" ? Infinity : p.energy.T_cool) - 30;
  const hi = Math.max(...T) + 80;
  const Tmin = Math.floor(Math.max(lo, 200) / 10) * 10;
  const Tmax = Math.ceil(Math.max(hi, Tmin + 50) / 10) * 10;
  const N = 120;
  const grid = Array.from({ length: N }, (_, i) => Tmin + ((Tmax - Tmin) * i) / (N - 1));

  let equilibrium: XTPoint[] | null = null;
  if (p.reversible) {
    equilibrium = [];
    for (const t of grid) {
      const { Kc } = thermo(t);
      const X = Kc === null ? null : equilibriumConversion(m, Kc);
      if (X !== null) equilibrium.push({ T: t, X });
    }
  }

  let adiabatic: XTPoint[] | null = null;
  const sumCp = mixtureHeatCapacity(p.species);
  if (p.deltaH !== 0 && sumCp > 0) {
    // X = Σ C_i0·Cp_i·(T − T0) / ((−ΔH)·C_clave0)
    const slope = sumCp / (-p.deltaH * m.CA0);
    adiabatic = grid
      .map((t) => ({ T: t, X: slope * (t - p.energy.T0) }))
      .filter((pt) => pt.X >= 0 && pt.X <= m.X_max);
  }

  let optimal: XTPoint[] | null = null;
  if (p.reversible && p.deltaH < 0 && p.kinetics.mode === "arrhenius") {
    optimal = [];
    for (let i = 1; i < 60; i++) {
      const X = (m.X_max * i) / 60;
      const f = (t: number) => {
        const { k, Kc } = thermo(t);
        return rateAt(m, X, k, Kc);
      };
      const Topt = goldenMax(f, Tmin, Tmax, 0.05);
      if (Topt > Tmin + 0.5 && Topt < Tmax - 0.5 && f(Topt) > 0) optimal.push({ T: Topt, X });
    }
  }

  const trajectory = sim.series.T.map((t, i) => ({ T: t, X: sim.series.X[i] }));
  return { Tmin, Tmax, equilibrium, adiabatic, optimal, trajectory };
}

/** Levenspiel: C_clave0 / (−r_clave) en función de X (el área bajo la curva es el tiempo de reacción). */
export function levenspiel(p: ReactorParams, sim: SimOk) {
  const key = p.species.find((s) => s.id === p.keySpecies)!;
  const out: { X: number; inv: number }[] = [];
  sim.series.X.forEach((X, i) => {
    const r = sim.series.rate[i];
    if (r > 1e-12) out.push({ X, inv: key.C0 / r });
  });
  return out;
}
