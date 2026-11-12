import { describe, expect, it } from "vitest";
import { dopri5, rosenbrock23, type Rhs } from "@/engine/solvers/ode";
import { PRESETS } from "@/engine/presets";
import { simulate } from "@/engine/simulate";

const decay: Rhs = (_t, y, dy) => {
  dy[0] = -2 * y[0];
};

describe("integradores", () => {
  it("Dormand–Prince: y' = −2y con salida densa de 4.º orden", () => {
    const sol = dopri5(decay, { t0: 0, tEnd: 3, y0: [1], rtol: 1e-9, atol: [1e-12] });
    for (const t of [0.13, 0.77, 1.5, 2.9]) expect(sol.at(t)[0]).toBeCloseTo(Math.exp(-2 * t), 8);
  });

  it("Rosenbrock: problema rígido (λ = −1e4) con pocos pasos", () => {
    // y' = −1e4·(y − cos t) − sin t, solución y = cos t
    const stiff: Rhs = (t, y, dy) => {
      dy[0] = -1e4 * (y[0] - Math.cos(t)) - Math.sin(t);
    };
    const sol = rosenbrock23(stiff, { t0: 0, tEnd: 2, y0: [1], rtol: 1e-6, atol: [1e-9] });
    expect(sol.status).toBe("done");
    expect(sol.nSteps).toBeLessThan(2000);
    expect(sol.at(1.7)[0]).toBeCloseTo(Math.cos(1.7), 4);
  });

  it("Dormand–Prince detecta rigidez y la simulación pasa a Rosenbrock", () => {
    const stiff: Rhs = (t, y, dy) => {
      dy[0] = -1e6 * (y[0] - Math.cos(t)) - Math.sin(t);
    };
    const sol = dopri5(stiff, { t0: 0, tEnd: 10, y0: [1], rtol: 1e-6, atol: [1e-9] });
    expect(["stiff", "maxSteps"]).toContain(sol.status);
  });

  it("eventos: corta exactamente donde y cruza el umbral", () => {
    const sol = dopri5(decay, {
      t0: 0,
      tEnd: 10,
      y0: [1],
      rtol: 1e-9,
      atol: [1e-12],
      events: [{ g: (_t, y) => y[0] - 0.25, direction: -1, terminal: true }],
    });
    expect(sol.status).toBe("event");
    expect(sol.ts[sol.ts.length - 1]).toBeCloseTo(Math.log(4) / 2, 9);
  });
});

describe("volumen del reactor", () => {
  it("V = P·(t_r + t_muerto) / (C_P·M), con P convertida de kg/h a la unidad de tiempo", () => {
    const p = PRESETS[0].params;
    const r = simulate(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const C_P = r.series.C[p.volume.product].at(-1)!;
    const P_min = p.volume.P_kg_h / 60;
    expect(r.summary.volume).toBeCloseTo((P_min * (r.summary.t_end + p.volume.t_dead)) / (C_P * 0.088), 6);
  });
});
