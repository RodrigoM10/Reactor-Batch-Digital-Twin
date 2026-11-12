import * as Comlink from "comlink";
import { levenspiel, simulate, xtDiagram, type ReactorParams, type SimResult, type XTDiagram } from "@/engine";

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
};

export type EngineApi = typeof api;

Comlink.expose(api);
