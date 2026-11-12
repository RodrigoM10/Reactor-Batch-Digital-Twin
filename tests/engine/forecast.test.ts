import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  forecastFeatures,
  loadForecastModel,
  mlForecast,
  physicsForecast,
  riskReference,
  type ForecastModelJson,
  type OpPoint,
} from "@/engine/forecast";

const root = join(__dirname, "..", "..");
const meta = JSON.parse(readFileSync(join(root, "public", "models", "forecast-icq.json"), "utf-8")) as ForecastModelJson;
const fx = JSON.parse(readFileSync(join(__dirname, "fixtures", "ml", "forecast-icq-samples.json"), "utf-8")) as {
  op: OpPoint;
  t: number[];
  T: number[];
  cuts: number[];
  features: number[][];
  reg: number[][];
  clf: number[];
};
const model = loadForecastModel(meta);

describe("pronóstico ML: paridad con Python", () => {
  it("construye las mismas features desde las mediciones crudas", () => {
    fx.cuts.forEach((tc, k) =>
      forecastFeatures(meta, fx.op, fx.t, fx.T, tc).forEach((v, i) => expect(v).toBeCloseTo(fx.features[k][i], 8)),
    );
  });

  it("las redes dan la misma salida que NumPy", () => {
    fx.features.forEach((x, k) => {
      model.reg.predict(x).forEach((v, i) => expect(v).toBeCloseTo(fx.reg[k][i], 5));
      expect(model.clf.predict(x)[0]).toBeCloseTo(fx.clf[k], 6);
    });
  });
});

describe("pronóstico en corridas de demostración", () => {
  const load = (id: string) =>
    JSON.parse(readFileSync(join(root, "public", "data", "live", `${id}.json`), "utf-8")) as {
      op: OpPoint;
      measured: { t: number[]; T: number[] };
      clean: { t: number[]; T: number[] };
    };

  it("la corrida con runaway termina con alarma de ambos métodos antes del pico", () => {
    const run = load("runaway");
    const tPeak = run.clean.t[run.clean.T.indexOf(Math.max(...run.clean.T))];
    const tc = Math.max(tPeak - 1, 1);
    const ml = mlForecast(model, run.op, run.measured.t, run.measured.T, tc);
    const ph = physicsForecast(meta.nominal, run.op, run.measured.t, run.measured.T, tc, meta.deltaT_ad, { horizon: 60 });
    expect(ml.pRunaway).toBeGreaterThan(0.5);
    expect(ph).not.toBeNull();
    expect(ph!.pRunaway).toBeGreaterThan(0.5);
    expect(Math.max(...run.clean.T)).toBeGreaterThan(riskReference(run.op, meta.deltaT_ad));
  });

  it("la corrida segura no dispara alarmas a mitad de camino", () => {
    const run = load("segura");
    const ml = mlForecast(model, run.op, run.measured.t, run.measured.T, 15);
    const ph = physicsForecast(meta.nominal, run.op, run.measured.t, run.measured.T, 15, meta.deltaT_ad, { horizon: 60 });
    expect(ml.pRunaway).toBeLessThan(0.5);
    expect(ph!.pRunaway).toBeLessThan(0.5);
  });
});
