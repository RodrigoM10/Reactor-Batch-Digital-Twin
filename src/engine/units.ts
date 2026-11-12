import type { ReactorParams, TimeUnit } from "./types";

const SECONDS: Record<TimeUnit, number> = { s: 1, min: 60, h: 3600 };

/**
 * Cambia la unidad de tiempo del caso convirtiendo todo lo que depende de ella, así el reactor simulado es el
 * mismo y solo cambia la unidad en que se lo ve. A diferencia de la tesis, donde la unidad era solo una etiqueta.
 *   1/tiempo: k, A · cal/(tiempo·K): UA · kg/tiempo: m_c  → × f
 *   tiempo: t_final, t_max, t_dead                         → ÷ f
 * con f = segundos(to) / segundos(from). P_kg_h ya está en kg/h y no cambia.
 */
export function convertTimeUnit(p: ReactorParams, to: TimeUnit): ReactorParams {
  const q = structuredClone(p);
  if (p.timeUnit === to) return q;
  const f = SECONDS[to] / SECONDS[p.timeUnit];
  q.kinetics.k *= f;
  q.kinetics.A *= f;
  q.energy.UA *= f;
  q.energy.m_c *= f;
  q.stop.t_final /= f;
  q.stop.t_max /= f;
  q.volume.t_dead /= f;
  q.timeUnit = to;
  return q;
}
