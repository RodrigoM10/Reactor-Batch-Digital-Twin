import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS, species } from "@/engine/presets";
import { simulate } from "@/engine/simulate";
import type { ReactorParams } from "@/engine/types";

/**
 * Casos de referencia del motor v2 para la paridad con el motor Python (ml/tests/test_parity.py).
 *   EXPORT_FIXTURES=1 npx vitest run tests/engine/v2-fixtures.test.ts   → regenera los JSON
 *   npx vitest run                                                       → verifica que el motor no cambió
 */

const dir = join(__dirname, "fixtures", "v2");
const clone = (p: ReactorParams) => structuredClone(p);

function cases(): Record<string, ReactorParams> {
  const byId = Object.fromEntries(PRESETS.map((p) => [p.id, p.params]));
  const out: Record<string, ReactorParams> = { ...Object.fromEntries(PRESETS.map((p) => [`preset_${p.id}`, clone(p.params)])) };

  const jacket = clone(byId["runaway"]);
  jacket.energy = { ...jacket.energy, mode: "jacket", UA: 250, T_cool: 300 };
  out.camisa_runaway = jacket;

  const lowFlow = clone(byId["runaway"]);
  lowFlow.energy.m_c = 0.5;
  out.icq_caudal_bajo = lowFlow;

  const gibbs = clone(byId["reversible-exotermica"]);
  gibbs.equilibrium.method = "gibbs";
  gibbs.species[0].DGf = 0;
  gibbs.species[1].DGf = -3000;
  out.gibbs_adiabatica = gibbs;

  const conv = clone(byId["adiabatica"]);
  conv.stop = { ...conv.stop, mode: "conversion", X_target: 0.8 };
  out.conversion_objetivo = conv;

  const powerLaw = clone(byId["runaway"]);
  powerLaw.species = [
    species("A", -2, 2, { Cp: 35, order: 1.5 }),
    species("B", -1, 3, { Cp: 30, order: 0.5 }),
    species("C", 1, 0, { Cp: 50 }),
    species("I", 0, 25, { Cp: 18 }),
  ];
  powerLaw.energy.m_c = 1;
  out.ley_potencias_no_entera = powerLaw;

  return out;
}

if (process.env.EXPORT_FIXTURES) {
  it("exporta fixtures v2", () => {
    mkdirSync(dir, { recursive: true });
    for (const [name, params] of Object.entries(cases())) {
      const r = simulate(params, { samples: 61 });
      if (!r.ok) throw new Error(`${name}: ${r.error}`);
      const fixture = {
        case: name,
        params,
        t_end: r.summary.t_end,
        stopReason: r.summary.stopReason,
        t: r.series.t,
        X: r.series.X,
        T: r.series.T,
      };
      writeFileSync(join(dir, `${name}.json`), JSON.stringify(fixture, null, 1));
    }
  });
} else {
  describe("el motor v2 no cambió respecto de sus fixtures", () => {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      it(f, () => {
        const fx = JSON.parse(readFileSync(join(dir, f), "utf-8"));
        const r = simulate(fx.params, { sampleTimes: fx.t });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        r.series.X.forEach((x, i) => expect(x).toBeCloseTo(fx.X[i], 7));
        r.series.T.forEach((t, i) => expect(t).toBeCloseTo(fx.T[i], 4));
      });
    }
  });
}
