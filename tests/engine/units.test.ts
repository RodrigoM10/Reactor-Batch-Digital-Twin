import { describe, expect, it } from "vitest";
import { PRESETS } from "@/engine/presets";
import { matchesSurrogate } from "@/engine/risk";
import { simulate } from "@/engine/simulate";
import { convertTimeUnit } from "@/engine/units";

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.params;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

describe("cambio de unidad de tiempo", () => {
  it("Camisa ICQ: en segundos es el mismo reactor (misma T_max, tiempos × 60, misma X)", () => {
    const pMin = preset("runaway");
    const pS = convertTimeUnit(pMin, "s");
    expect(pS.timeUnit).toBe("s");
    expect(rel(pS.kinetics.A, pMin.kinetics.A / 60)).toBeLessThan(1e-12);

    const tMin = [0, 2, 5, 10, 20];
    const a = simulate(pMin, { sampleTimes: tMin });
    const b = simulate(pS, { sampleTimes: tMin.map((t) => t * 60) });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    a.series.X.forEach((x, i) => expect(Math.abs(b.series.X[i] - x)).toBeLessThan(1e-6));
    a.series.T.forEach((T, i) => expect(Math.abs(b.series.T[i] - T)).toBeLessThan(1e-5));

    const fa = simulate(pMin);
    const fb = simulate(pS);
    if (!fa.ok || !fb.ok) throw new Error("simulación fallida");
    // T_max sale del muestreo uniforme hasta el corte, que no cae en los mismos instantes: ~1e-6 relativo
    expect(rel(fb.summary.T_max, fa.summary.T_max)).toBeLessThan(1e-5);
    // El corte "hasta completar" se evalúa al final de cada paso del integrador, y los pasos no caen en los
    // mismos instantes en otra unidad: el criterio es el mismo, el instante exacto difiere ~0.1 %.
    expect(rel(fb.summary.t_end, fa.summary.t_end * 60)).toBeLessThan(1e-2);
  });

  it("caso de la tesis: misma conversión final y mismo volumen del reactor en horas", () => {
    const pMin = preset("tesis-esterificacion");
    const pH = convertTimeUnit(pMin, "h");
    const a = simulate(pMin);
    const b = simulate(pH);
    if (!a.ok || !b.ok) throw new Error("simulación fallida");
    expect(Math.abs(b.summary.X_end - a.summary.X_end)).toBeLessThan(1e-6);
    expect(rel(b.summary.volume!, a.summary.volume!)).toBeLessThan(1e-6);
  });

  it("ida y vuelta min → s → h → min devuelve los mismos parámetros", () => {
    const p = preset("tesis-esterificacion");
    const q = convertTimeUnit(convertTimeUnit(convertTimeUnit(p, "s"), "h"), "min");
    for (const [x, y] of [
      [q.kinetics.k, p.kinetics.k],
      [q.kinetics.A, p.kinetics.A],
      [q.energy.UA, p.energy.UA],
      [q.energy.m_c, p.energy.m_c],
      [q.stop.t_final, p.stop.t_final],
      [q.volume.t_dead, p.volume.t_dead],
    ])
      expect(rel(x, y)).toBeLessThan(1e-12);
    expect(convertTimeUnit(p, "min")).toEqual(p);
  });

  it("el mapa de riesgo sigue siendo válido en otra unidad y tras una ida y vuelta", () => {
    const ref = preset("runaway");
    expect(matchesSurrogate(convertTimeUnit(ref, "s"), ref)).toBe(true);
    expect(matchesSurrogate(convertTimeUnit(convertTimeUnit(ref, "s"), "min"), ref)).toBe(true);
    expect(matchesSurrogate(preset("adiabatica"), ref)).toBe(false);
  });
});
