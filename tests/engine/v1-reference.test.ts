import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { simulate } from "@/engine/simulate";
import { fromV1Params, type V1Params } from "@/engine/v1-compat";

/**
 * Compara el motor v2 contra la respuesta del motor original de la tesis.
 * Fixtures generados con tools/generate_v1_fixtures.py (corren SimulateBR sin modificarlo).
 * La v1 usa las tolerancias por defecto de SciPy (rtol = 1e-3), por eso la tolerancia es 2e-3 en X.
 */

interface Fixture {
  case: string;
  expected: "match" | "divergent";
  reason: string | null;
  v1_elapsed_s: number;
  params: V1Params;
  result: {
    success: boolean;
    summary: Record<string, number | null>;
    data: { t_eval: number[]; X_A_eval: number[]; T_eval?: number[] };
  };
}

const dir = join(__dirname, "fixtures", "v1");
const fixtures: Fixture[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")));

function runOnV1Grid(fx: Fixture) {
  const p = fromV1Params(fx.params);
  const t = fx.result.data.t_eval;
  // Mismo horizonte que la v1 para comparar punto a punto.
  p.stop = { ...p.stop, mode: "time", t_final: t[t.length - 1] };
  const r = simulate(p, { sampleTimes: t });
  if (!r.ok) throw new Error(`${fx.case}: ${r.error}`);
  return r;
}

const maxAbsDiff = (a: number[], b: number[]) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));

describe("v2 reproduce a la tesis (v1)", () => {
  for (const fx of fixtures.filter((f) => f.expected === "match")) {
    it(fx.case, () => {
      const r = runOnV1Grid(fx);
      expect(maxAbsDiff(r.series.X, fx.result.data.X_A_eval)).toBeLessThan(2e-3);
      if (fx.result.data.T_eval) {
        const dT = maxAbsDiff(r.series.T, fx.result.data.T_eval);
        expect(dT).toBeLessThan(1e-3 * Math.max(...fx.result.data.T_eval));
      }
      const vol = fx.result.summary.volume;
      if (vol !== null && vol !== undefined) {
        const full = simulate(fromV1Params(fx.params));
        expect(full.ok && full.summary.volume).toBeCloseTo(vol, 0);
      }
    });
  }
});

describe("diferencias documentadas con la v1", () => {
  for (const fx of fixtures.filter((f) => f.expected === "divergent")) {
    it(`${fx.case}: ${fx.reason}`, () => {
      const r = runOnV1Grid(fx);
      // La diferencia existe (si desaparece, revisar: puede que alguien haya cambiado el modelo)…
      expect(maxAbsDiff(r.series.X, fx.result.data.X_A_eval)).toBeGreaterThan(2e-3);
      // …y la v2 se mantiene físicamente coherente: nunca supera el equilibrio a la T de cada instante.
      if (r.series.Xeq) r.series.X.forEach((X, i) => expect(X).toBeLessThanOrEqual(r.series.Xeq![i] + 1e-6));
    });
  }
});
