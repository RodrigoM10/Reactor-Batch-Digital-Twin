import { describe, expect, it } from "vitest";
import { compileModel, equilibriumConversion } from "@/engine/model/kinetics";
import { R, equilibriumConstant } from "@/engine/model/thermo";
import { PRESETS, species } from "@/engine/presets";
import { simulate } from "@/engine/simulate";
import type { ReactorParams, SimOk } from "@/engine/types";

const iso = (overrides: Partial<ReactorParams>): ReactorParams => ({
  species: [species("A", -1, 1), species("B", 1, 0)],
  keySpecies: "A",
  reversible: false,
  kinetics: { mode: "direct", k: 0.1, A: 1, E: 0 },
  equilibrium: { method: "direct", Keq: 1, Keq_ref: 1, T_ref: 298 },
  deltaH: 0,
  energy: { mode: "isothermal", T0: 350, V: 1, UA: 0, T_cool: 300, m_c: 1, Cp_c: 1 },
  stop: { mode: "time", X_target: 0.9, t_final: 30, t_max: 1e5 },
  timeUnit: "min",
  volume: { enabled: false, product: "B", P_kg_h: 1, M_g_mol: 1, t_dead: 0 },
  ...overrides,
});

function run(p: ReactorParams, samples = 61): SimOk {
  const r = simulate(p, { samples });
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("soluciones analíticas (isotérmico)", () => {
  it("1.er orden irreversible: X = 1 − e^(−kt)", () => {
    const r = run(iso({}));
    r.series.t.forEach((t, i) => expect(r.series.X[i]).toBeCloseTo(1 - Math.exp(-0.1 * t), 7));
  });

  it("2.º orden equimolar A + B → C: X = kC0t / (1 + kC0t)", () => {
    const p = iso({
      species: [species("A", -1, 2), species("B", -1, 2), species("C", 1, 0)],
      kinetics: { mode: "direct", k: 0.05, A: 1, E: 0 },
    });
    const r = run(p);
    r.series.t.forEach((t, i) => {
      const kct = 0.05 * 2 * t;
      expect(r.series.X[i]).toBeCloseTo(kct / (1 + kct), 7);
    });
  });

  it("reactivo en exceso (pseudo-primer orden): −r = k·C_B0·C_A", () => {
    const p = iso({
      species: [species("A", -1, 1), species("B", -1, 20, { constantInRate: true }), species("C", 1, 0)],
      kinetics: { mode: "direct", k: 0.01, A: 1, E: 0 },
    });
    const r = run(p);
    r.series.t.forEach((t, i) => expect(r.series.X[i]).toBeCloseTo(1 - Math.exp(-0.01 * 20 * t), 7));
  });

  it("1.er orden reversible A ⇌ B: X = Xe·(1 − e^(−k(1+1/K)t))", () => {
    const K = 3;
    const r = run(iso({ reversible: true, equilibrium: { method: "direct", Keq: K, Keq_ref: 1, T_ref: 298 } }));
    const Xe = K / (1 + K);
    r.series.t.forEach((t, i) =>
      expect(r.series.X[i]).toBeCloseTo(Xe * (1 - Math.exp(-0.1 * (1 + 1 / K) * t)), 7),
    );
    expect(r.summary.X_eq0).toBeCloseTo(Xe, 10);
  });

  it("tiempo para una conversión objetivo: t = ln(1/(1−X))/k", () => {
    const r = run(iso({ stop: { mode: "conversion", X_target: 0.9, t_final: 0, t_max: 1e5 } }));
    expect(r.summary.stopReason).toBe("target");
    expect(r.summary.t_end).toBeCloseTo(Math.log(10) / 0.1, 6);
    expect(r.summary.X_end).toBeCloseTo(0.9, 8);
  });

  it("conversión objetivo mayor que X_eq devuelve un aviso con X_eq", () => {
    const r = simulate(
      iso({
        reversible: true,
        equilibrium: { method: "direct", Keq: 1, Keq_ref: 1, T_ref: 298 },
        stop: { mode: "conversion", X_target: 0.8, t_final: 0, t_max: 1e5 },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.details?.X_eq).toBeCloseTo(0.5, 10);
  });

  it("modo 'completo' corta cerca del límite y no integra hasta t_max", () => {
    const r = run(iso({ stop: { mode: "complete", X_target: 0, t_final: 0, t_max: 1e6 } }));
    expect(r.summary.stopReason).toBe("complete");
    expect(r.summary.X_end).toBeGreaterThan(0.998);
    expect(r.summary.t_end).toBeLessThan(200);
  });
});

describe("equilibrio", () => {
  it("A + B ⇌ C + D equimolar: X_eq = √K / (1 + √K)", () => {
    const p = iso({
      reversible: true,
      species: [species("A", -1, 1), species("B", -1, 1), species("C", 1, 0), species("D", 1, 0)],
    });
    const m = compileModel(p);
    for (const K of [0.1, 1, 2.93, 50]) {
      expect(equilibriumConversion(m, K)).toBeCloseTo(Math.sqrt(K) / (1 + Math.sqrt(K)), 10);
    }
  });

  it("van't Hoff con 2A ⇌ C: d ln K_c/dT = ΔH_rxn/RT² con ΔH_rxn = |ν_A|·ΔH", () => {
    const p = iso({
      reversible: true,
      species: [species("A", -2, 1), species("C", 1, 0)],
      equilibrium: { method: "vant_hoff", Keq: 1, Keq_ref: 5000, T_ref: 298 },
      deltaH: -20000,
    });
    const T = 350;
    const h = 1e-3;
    const slope = (Math.log(equilibriumConstant(p, T + h)) - Math.log(equilibriumConstant(p, T - h))) / (2 * h);
    expect(slope).toBeCloseTo((2 * -20000) / (R * T * T), 8);
    expect(equilibriumConstant(p, 298)).toBeCloseTo(5000, 9);
  });

  it("si la especie clave no es limitante, X_max < 1", () => {
    const p = iso({ species: [species("A", -1, 2), species("B", -2, 2), species("C", 1, 0)] });
    expect(compileModel(p).X_max).toBeCloseTo(0.5, 12);
  });
});

describe("balance de energía", () => {
  it("adiabático: la trayectoria sigue la recta T = T0 + (−ΔH)·C_A0·X / ΣC_i0·Cp_i", () => {
    const p = PRESETS.find((x) => x.id === "adiabatica")!.params;
    const r = run(p, 101);
    const sumCp = p.species.reduce((a, s) => a + s.C0 * s.Cp, 0);
    r.series.X.forEach((X, i) => expect(r.series.T[i]).toBeCloseTo(p.energy.T0 + (10000 * 2 * X) / sumCp, 4));
    expect(r.summary.T_max).toBeCloseTo(p.energy.T0 + r.summary.deltaT_ad * r.summary.X_end, 1);
  });

  it("ICQ: sin reacción, T decae a T_cool con la constante del intercambiador", () => {
    const p = iso({
      species: [species("A", -1, 1, { Cp: 100 }), species("B", 1, 0, { Cp: 100 })],
      kinetics: { mode: "arrhenius", k: 0, A: 1e-30, E: 0 },
      energy: { mode: "icq", T0: 350, V: 2, UA: 100, T_cool: 300, m_c: 1, Cp_c: 500 },
      stop: { mode: "time", X_target: 0, t_final: 10, t_max: 1e5 },
    });
    const r = run(p);
    const lambda = (500 * (1 - Math.exp(-100 / 500))) / (2 * 100);
    r.series.t.forEach((t, i) => expect(r.series.T[i]).toBeCloseTo(300 + 50 * Math.exp(-lambda * t), 5));
  });
});

describe("presets", () => {
  it("todos los presets simulan sin errores y rápido", () => {
    for (const preset of PRESETS) {
      const r = simulate(preset.params);
      expect(r.ok, `${preset.id}: ${!r.ok ? r.error : ""}`).toBe(true);
      if (r.ok) {
        expect(r.series.X.every(Number.isFinite)).toBe(true);
        expect(r.series.T.every(Number.isFinite)).toBe(true);
        expect(r.summary.elapsedMs).toBeLessThan(500);
      }
    }
  });
});
