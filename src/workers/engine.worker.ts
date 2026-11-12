import * as Comlink from "comlink";
import { levenspiel, simulate, xtDiagram, type ReactorParams, type SimResult, type XTDiagram } from "@/engine";
import { fitParameters, type FitOptions, type FitResult, type Measurements } from "@/engine/fit";

export interface EngineOutput {
  result: SimResult;
  xt: XTDiagram | null;
  levenspiel: { X: number; inv: number }[];
}

const api = {
  run(params: ReactorParams): EngineOutput {
    const result = simulate(params);
    if (!result.ok) return { result, xt: null, levenspiel: [] };
    return { result, xt: xtDiagram(params, result), levenspiel: levenspiel(params, result) };
  },
  fit(params: ReactorParams, data: Measurements, opts: FitOptions): FitResult {
    return fitParameters(params, data, opts);
  },
  /** T_max exacta (motor) para varios reactores, con horizonte fijo: verificación del sustituto. */
  exactTmax(list: ReactorParams[], horizon: number): number[] {
    return list.map((params) => {
      const p = structuredClone(params);
      p.stop = { ...p.stop, mode: "time", t_final: horizon };
      const r = simulate(p, { samples: 1500 });
      return r.ok ? r.summary.T_max : NaN;
    });
  },
  simulateAt(params: ReactorParams, times: number[]): SimResult {
    const p = structuredClone(params);
    p.stop = { ...p.stop, mode: "time", t_final: Math.max(...times) };
    return simulate(p, { sampleTimes: times });
  },
};

export type EngineApi = typeof api;

Comlink.expose(api);
