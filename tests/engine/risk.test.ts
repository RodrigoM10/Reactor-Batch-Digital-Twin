import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS } from "@/engine/presets";
import { applyOperatingPoint, loadRiskModel, riskGrid, type RiskModelJson } from "@/engine/risk";
import { simulate } from "@/engine/simulate";

const root = join(__dirname, "..", "..");
const meta = JSON.parse(readFileSync(join(root, "public", "models", "risk-icq.json"), "utf-8")) as RiskModelJson;
const samples = JSON.parse(readFileSync(join(__dirname, "fixtures", "ml", "risk-icq-samples.json"), "utf-8")) as {
  x: number[][];
  pred: number[];
  T_max: number[];
};
const model = loadRiskModel(meta);
const base = PRESETS.find((p) => p.id === meta.preset)!.params;

describe("modelo sustituto del mapa de riesgo", () => {
  it("la inferencia en TypeScript coincide con NumPy", () => {
    samples.x.forEach((x, i) => expect(model.mlp.predict(x)[0]).toBeCloseTo(samples.pred[i], 5));
  });

  it("predice T_max con error medio < 1 K contra el motor TypeScript", () => {
    const errs = samples.x.map((x) => {
      const pt = { T0: x[0], T_cool: x[1], ln_m_c: x[2], ln_UA: x[3] };
      const p = applyOperatingPoint(base, pt);
      p.stop = { ...p.stop, mode: "time", t_final: meta.horizon_min };
      const r = simulate(p, { samples: 1500 });
      if (!r.ok) throw new Error(r.error);
      return Math.abs(model.tMax(pt) - r.summary.T_max);
    });
    expect(errs.reduce((a, b) => a + b, 0) / errs.length).toBeLessThan(1);
  });

  it("una grilla de 100×66 se calcula en menos de 500 ms (chequeo de cordura)", () => {
    const g = riskGrid(model, { T0: 305, T_cool: 300, ln_m_c: Math.log(3), ln_UA: Math.log(1500) }, "T0", "ln_m_c", 100, 66);
    expect(g.tMax.length).toBe(100 * 66);
    expect(g.elapsedMs).toBeLessThan(500);
  });
});
