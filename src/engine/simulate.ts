import {
  compileModel,
  concentration,
  equilibriumConversion,
  makeThermoEvaluator,
  rateAt,
} from "./model/kinetics";
import { mixtureHeatCapacity } from "./model/thermo";
import { dopri5, rosenbrock23, type OdeEvent, type OdeOptions, type OdeSolution } from "./solvers/ode";
import type { ReactorParams, SimResult, SimSeries, StopReason, TimeUnit } from "./types";
import { validateParams } from "./validate";

export interface SimulateOptions {
  samples?: number; // puntos uniformes en el tiempo (por defecto 300)
  sampleTimes?: number[]; // tiempos explícitos (usado por las pruebas contra la v1)
  corrections?: Corrections;
}

/**
 * Términos que se suman al modelo de balances (mismo papel que Extras en ml/reactor_ml/engine.py).
 * Los usan la planta virtual (efectos conocidos) y el modelo híbrido (efectos aprendidos por una red).
 */
export interface Corrections {
  /** Factor multiplicativo sobre −r (desactivación del catalizador, error en A o E). */
  rateFactor?: (t: number, X: number, T: number) => number;
  /** ΔH efectivo en función de T (ΔCp ≠ 0) [cal/mol]. */
  deltaH?: (T: number) => number;
  /** Calor removido adicional, p. ej. pérdidas al ambiente [cal/tiempo]. */
  extraHeat?: (T: number) => number;
  /** Término aditivo sobre dT/dt [K/tiempo]. */
  dT?: (t: number, X: number, T: number) => number;
}

const HOURS_PER_UNIT: Record<TimeUnit, number> = { s: 1 / 3600, min: 1 / 60, h: 1 };

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Simula el reactor batch. Estado y = [X, T]:
 *   dX/dt = −r_clave / C_clave0
 *   dT/dt = (Q_g − Q_r) / (V·Σ C_i0·Cp_i),   Q_g = (−ΔH)·(−r_clave)·V
 * Con V = 1 L reproduce el balance de NonIsotermalReactor.balance_reactor_nonisothermal de la tesis.
 */
export function simulate(p: ReactorParams, opts: SimulateOptions = {}): SimResult {
  const start = now();
  const errors = validateParams(p);
  if (errors.length) return { ok: false, code: "invalid", error: errors.join(" ") };

  let model;
  try {
    model = compileModel(p);
  } catch (e) {
    return { ok: false, code: "invalid", error: (e as Error).message };
  }

  const warnings: string[] = [];
  const thermo = makeThermoEvaluator(p);
  const isothermal = p.energy.mode === "isothermal";
  const { T0, UA, T_cool, m_c, Cp_c } = p.energy;
  const V = isothermal ? Math.max(p.energy.V, 1e-12) : p.energy.V;
  const sumCp = mixtureHeatCapacity(p.species);
  const minusDH = -p.deltaH;
  const CA0 = model.CA0;
  const X_max = model.X_max;
  const icqFactor = p.energy.mode === "icq" ? 1 - Math.exp(-UA / (m_c * Cp_c)) : 0;

  const corr = opts.corrections ?? {};
  const heatRemoved = (T: number) => {
    const extra = corr.extraHeat && !isothermal ? corr.extraHeat(T) : 0;
    switch (p.energy.mode) {
      case "icq":
        return m_c * Cp_c * (T - T_cool) * icqFactor + extra;
      case "jacket":
        return UA * (T - T_cool) + extra;
      default:
        return extra;
    }
  };
  const minusDHAt = (T: number) => (corr.deltaH ? -corr.deltaH(T) : minusDH);
  const rateWith = (t: number, X: number, T: number, k: number, Kc: number | null) =>
    rateAt(model, X, k, Kc) * (corr.rateFactor ? corr.rateFactor(t, X, T) : 1);

  const { k: k0, Kc: Keq0 } = thermo(T0);
  const X_eq0 = p.reversible && Keq0 !== null ? equilibriumConversion(model, Keq0) : null;
  if (p.reversible && X_eq0 === null)
    return {
      ok: false,
      code: "unreachable",
      error: `No se pudo calcular la conversión de equilibrio para K_eq = ${Keq0?.toExponential(3)}. Revisá los parámetros o la estequiometría.`,
    };

  if (p.stop.mode === "conversion") {
    if (p.stop.X_target > X_max + 1e-12)
      return {
        ok: false,
        code: "unreachable",
        error: `La conversión deseada (${p.stop.X_target.toFixed(3)}) supera la máxima estequiométrica (${X_max.toFixed(3)}): otro reactivo es limitante.`,
        details: { X_target: p.stop.X_target, X_max },
      };
    if (isothermal && X_eq0 !== null && p.stop.X_target > X_eq0)
      return {
        ok: false,
        code: "unreachable",
        error: `La conversión deseada (${p.stop.X_target.toFixed(3)}) excede la conversión de equilibrio (${X_eq0.toFixed(3)}). Ingresá un valor menor o igual a X_eq.`,
        details: { X_target: p.stop.X_target, X_eq: X_eq0 },
      };
  }

  if (p.reversible) {
    const consistent = p.species.every((s) =>
      s.nu < 0 ? s.order === -s.nu && s.reverseOrder === 0 : s.nu > 0 ? s.reverseOrder === s.nu && s.order === 0 : true,
    );
    if (!consistent)
      warnings.push(
        "Los órdenes de reacción no coinciden con la estequiometría: el equilibrio cinético puede diferir del calculado con K_eq.",
      );
  }

  const rhs = (t: number, y: Float64Array, dy: Float64Array) => {
    const X = Math.min(Math.max(y[0], 0), X_max);
    const T = isothermal ? T0 : Math.max(y[1], 1);
    const { k, Kc } = thermo(T);
    let r = rateWith(t, X, T, k, Kc);
    if ((X >= X_max && r > 0) || (X <= 0 && r < 0)) r = 0;
    dy[0] = r / CA0;
    dy[1] = isothermal ? 0 : (minusDHAt(T) * r * V - heatRemoved(T)) / (V * sumCp) + (corr.dT ? corr.dT(t, X, T) : 0);
  };

  // ---- Criterios de corte
  const events: OdeEvent[] = [];
  let tEnd = p.stop.t_max;
  let onStep: OdeOptions["onStep"];
  if (p.stop.mode === "time") tEnd = p.stop.t_final;
  if (p.stop.mode === "conversion") {
    const Xt = p.stop.X_target;
    events.push({ g: (_t, y) => y[0] - Xt, direction: 1, terminal: true });
  }
  if (p.stop.mode === "complete") {
    let peak = 0;
    onStep = (_t, y, f) => {
      const rate = Math.abs(f[0]);
      peak = Math.max(peak, rate);
      const X = y[0];
      let Xlim = X_max;
      if (p.reversible) {
        const { Kc } = thermo(isothermal ? T0 : y[1]);
        Xlim = Kc === null ? X_max : (equilibriumConversion(model, Kc) ?? X_max);
      }
      const nearLimit = Xlim > 0 && X >= 0.999 * Xlim;
      const stalled = peak > 0 && rate <= 1e-5 * peak;
      return nearLimit || stalled;
    };
  }

  const odeOpts: OdeOptions = {
    t0: 0,
    tEnd,
    y0: [0, T0],
    rtol: 1e-8,
    atol: [1e-10, 1e-8],
    maxSteps: 50000,
    events,
    onStep,
  };

  let sol: OdeSolution = dopri5(rhs, odeOpts);
  let solver: "dopri5" | "rosenbrock" = "dopri5";
  if (sol.status === "stiff" || sol.status === "maxSteps" || sol.status === "failed") {
    sol = rosenbrock23(rhs, { ...odeOpts, rtol: 1e-6, maxSteps: 300000 });
    solver = "rosenbrock";
  }
  if (sol.status === "failed" || sol.status === "maxSteps" || sol.status === "stiff")
    return { ok: false, code: "solver", error: "El integrador no pudo resolver el sistema con estos parámetros." };

  const t_end = sol.ts[sol.ts.length - 1];
  let stopReason: StopReason;
  if (sol.status === "event") stopReason = "target";
  else if (sol.status === "stopped") stopReason = "complete";
  else if (p.stop.mode === "time") stopReason = "time";
  else stopReason = "t_max";

  if (p.stop.mode === "conversion" && stopReason !== "target") {
    const X_end = sol.ys[sol.ys.length - 1][0];
    return {
      ok: false,
      code: "unreachable",
      error: `No se alcanzó la conversión deseada (${p.stop.X_target.toFixed(3)}) antes de t = ${p.stop.t_max} ${p.timeUnit}; se llegó a X = ${X_end.toFixed(3)}.`,
      details: { X_target: p.stop.X_target, X_end },
    };
  }
  if (stopReason === "t_max")
    warnings.push(`La simulación llegó al tiempo máximo (${p.stop.t_max} ${p.timeUnit}) sin completarse.`);

  // ---- Muestreo de la solución densa
  const nSamples = Math.max(opts.samples ?? 300, 2);
  const times = opts.sampleTimes ?? Array.from({ length: nSamples }, (_, i) => (t_end * i) / (nSamples - 1));
  const series: SimSeries = {
    t: [],
    X: [],
    T: [],
    C: Object.fromEntries(model.ids.map((id) => [id, [] as number[]])),
    rate: [],
    k: [],
    Keq: p.reversible ? [] : null,
    Xeq: p.reversible ? [] : null,
    Qg: [],
    Qr: [],
    T_cool_out: p.energy.mode === "icq" ? [] : null,
  };
  const buf = new Float64Array(2);
  for (const t of times) {
    sol.at(t, buf);
    const X = Math.min(Math.max(buf[0], 0), X_max);
    const T = isothermal ? T0 : buf[1];
    const { k, Kc } = thermo(T);
    const r = rateWith(t, X, T, k, Kc);
    series.t.push(t);
    series.X.push(X);
    series.T.push(T);
    model.ids.forEach((id, i) => series.C[id].push(Math.max(concentration(model, i, X), 0)));
    series.rate.push(r);
    series.k.push(k);
    if (series.Keq && Kc !== null) {
      series.Keq.push(Kc);
      series.Xeq!.push(equilibriumConversion(model, Kc) ?? NaN);
    }
    series.Qg.push(minusDHAt(T) * r * V);
    series.Qr.push(heatRemoved(T));
    series.T_cool_out?.push(T - (T - T_cool) * Math.exp(-UA / (m_c * Cp_c)));
  }

  // T máxima sobre todos los pasos del integrador (más fiel que las muestras)
  let T_max = T0;
  let t_Tmax = 0;
  if (!isothermal)
    sol.ys.forEach((y, i) => {
      if (y[1] > T_max) {
        T_max = y[1];
        t_Tmax = sol.ts[i];
      }
    });

  const deltaT_ad = sumCp > 0 ? (minusDH * CA0 * X_max) / sumCp : 0;
  const cooled = p.energy.mode === "icq" || p.energy.mode === "jacket";
  const runaway = cooled && deltaT_ad > 0 && T_max - Math.max(T0, T_cool) > 0.5 * deltaT_ad;
  if (runaway)
    warnings.push(
      "Posible descontrol térmico: el sistema de enfriamiento no contiene más de la mitad del aumento adiabático de temperatura.",
    );

  const last = series.t.length - 1;
  let volume: number | null = null;
  if (p.volume.enabled) {
    const C_P = series.C[p.volume.product]?.[last] ?? 0;
    if (C_P <= 0) warnings.push(`La concentración final de ${p.volume.product} es cero: no se puede calcular el volumen.`);
    else {
      const P = p.volume.P_kg_h * HOURS_PER_UNIT[p.timeUnit]; // kg por unidad de tiempo
      volume = (P * (t_end + p.volume.t_dead)) / (C_P * (p.volume.M_g_mol / 1000));
    }
  }

  return {
    ok: true,
    series,
    warnings,
    summary: {
      t_end,
      X_end: series.X[last],
      T_end: series.T[last],
      T_max,
      t_Tmax,
      X_max,
      X_eq0,
      k0,
      Keq0,
      deltaT_ad,
      volume,
      runaway,
      stopReason,
      steps: sol.nSteps,
      solver,
      elapsedMs: now() - start,
    },
  };
}
