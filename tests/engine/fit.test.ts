import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fitParameters, parseMeasurementsCsv, type FitParam } from "@/engine/fit";
import type { ReactorParams } from "@/engine/types";

/**
 * El ajuste en TypeScript debe llegar al mismo óptimo que scipy.optimize.least_squares
 * (ml/scripts/make_fit_fixtures.py) sobre las mismas corridas de la planta virtual.
 */

interface FitFixture {
  case: string;
  nominal: ReactorParams;
  fitParams: FitParam[];
  sigmaT: number;
  sigmaX: number;
  truth: Record<string, number>;
  scipy: { values: number[]; std: number[]; chi2red: number };
}

const dir = join(__dirname, "fixtures", "fit");
const fixtures = readdirSync(dir)
  .filter((f) => f.endsWith(".json") && !f.endsWith(".truth.json"))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")) as FitFixture);

describe("ajuste de parámetros (Levenberg–Marquardt) contra SciPy", () => {
  for (const fx of fixtures) {
    it(fx.case, () => {
      const data = parseMeasurementsCsv(readFileSync(join(dir, `${fx.case}.csv`), "utf-8"));
      const r = fitParameters(fx.nominal, data, { params: fx.fitParams, sigmaT: fx.sigmaT, sigmaX: fx.sigmaX });
      expect(r.ok, r.message).toBe(true);
      r.estimates.forEach((e, i) => {
        // mismo óptimo que SciPy (dentro de una fracción de su incertidumbre)
        expect(Math.abs(e.value - fx.scipy.values[i])).toBeLessThan(0.05 * fx.scipy.std[i] + 1e-9);
        // mismo error estándar
        expect(e.stdErr).toBeCloseTo(fx.scipy.std[i], 2 - Math.floor(Math.log10(fx.scipy.std[i])));
        // la verdad oculta cae dentro de ±4σ
        expect(Math.abs(e.value - fx.truth[e.name])).toBeLessThan(4 * e.stdErr);
      });
      expect(r.chi2red).toBeCloseTo(fx.scipy.chi2red, 3);
    });
  }
});

describe("lectura de CSV", () => {
  it("distingue t (tiempo) de T (temperatura) y admite unidades y celdas vacías", () => {
    const d = parseMeasurementsCsv("t [min],T [K],X\n0,300,\n1,301.5,0.1\n2,,0.2\n");
    expect(d.t).toEqual([0, 1, 2]);
    expect(d.T).toEqual([300, 301.5, null]);
    expect(d.X).toEqual([null, 0.1, 0.2]);
  });

  it("admite punto y coma con coma decimal", () => {
    const d = parseMeasurementsCsv("tiempo;temperatura\n0;300,5\n1;301,25\n");
    expect(d.T).toEqual([300.5, 301.25]);
  });
});
