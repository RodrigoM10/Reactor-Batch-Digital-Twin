import { species } from "./presets";
import type { EnergyMode, ReactorParams, Species } from "./types";

/** Payload de la API de la tesis (SimParams en Batch-Reactor-Simulate/main.py). */
export interface V1Params {
  mode_op: "isothermal" | "non-isothermal";
  k_eq_method: "direct" | "vant_hoff" | "gibbs" | null;
  K_eq_direct?: number | null;
  K_det?: number | null;
  T_iso?: number | null;
  A?: number | null;
  E?: number | null;
  option?: string | null;
  X_A_desired?: number | null;
  t_reaction_det?: number | null;
  C_A0?: number | null;
  C_B0?: number | null;
  C_C0?: number | null;
  C_D0?: number | null;
  C_I?: number | null;
  order: number;
  reversible: boolean;
  stoichiometry: Record<string, number>;
  excess_B?: boolean | null;
  ans_volume?: string | null;
  P_k?: number | null; // kg/min en la v1
  t_mcd?: number | null;
  product_k?: string | null;
  m_k?: number | null; // g/mol
  T_ref?: number | null;
  T0?: number | null;
  K_eq_ref?: number | null;
  delta_H_rxn?: number | null;
  DG_dict?: Record<string, number | null> | null;
  C_p_dict?: Record<string, number> | null;
  mode_energy?: string | null;
  U?: number | null;
  A_ICQ?: number | null;
  T_cool?: number | null;
  m_c?: number | null;
  Cp_ref?: number | null;
}

const n = (v: number | null | undefined, fallback = 0) => (v === null || v === undefined ? fallback : v);

/**
 * Traduce un caso de la tesis al modelo generalizado.
 * La ley de velocidad se arma con los mismos órdenes que ReactionUtils.reaction_rate:
 *   orden 1 → k·C_A;  orden 2 → k·C_A·C_B, k·C_B0·C_A (B en exceso) o k·C_A² (sin B).
 * El término inverso usa C_C·C_D como la v1, pero con el signo estequiométrico corregido (F1).
 */
export function fromV1Params(v: V1Params): ReactorParams {
  const st = v.stoichiometry;
  const C0: Record<string, number> = { A: n(v.C_A0), B: n(v.C_B0), C: n(v.C_C0), D: n(v.C_D0) };
  const cp = v.C_p_dict ?? {};
  const dg = v.DG_dict ?? {};
  const hasB = "B" in st;
  const excessB = !!v.excess_B;

  const sp: Species[] = (["A", "B", "C", "D"] as const)
    .filter((id) => id in st)
    .map((id) => {
      const s = species(id, st[id], C0[id], { Cp: n(cp[id]), DGf: n(dg[id]) });
      s.order = 0;
      s.reverseOrder = s.nu > 0 ? 1 : 0;
      return s;
    });
  const A = sp.find((s) => s.id === "A")!;
  const B = sp.find((s) => s.id === "B");
  if (v.order === 1 || !hasB) A.order = v.order;
  else {
    A.order = 1;
    B!.order = 1;
    B!.constantInRate = excessB;
  }
  if (v.mode_op === "non-isothermal" && n(v.C_I) > 0) sp.push(species("I", 0, n(v.C_I), { Cp: n(cp.I) }));

  const iso = v.mode_op === "isothermal";
  const energyMode: EnergyMode = iso ? "isothermal" : v.mode_energy?.trim().toLowerCase() === "adiabatic" ? "adiabatic" : "icq";
  const option = (v.option ?? "T").trim().toUpperCase();

  return {
    species: sp,
    keySpecies: "A",
    reversible: v.reversible,
    kinetics:
      iso && v.K_det !== null && v.K_det !== undefined
        ? { mode: "direct", k: v.K_det, A: 0, E: 0 }
        : { mode: "arrhenius", k: 0, A: n(v.A), E: n(v.E) },
    equilibrium: {
      method: v.k_eq_method ?? "direct",
      Keq: n(v.K_eq_direct, 1),
      Keq_ref: n(v.K_eq_ref, 1),
      T_ref: n(v.T_ref, 298.15),
    },
    deltaH: n(v.delta_H_rxn),
    energy: {
      mode: energyMode,
      T0: iso ? n(v.T_iso) : n(v.T0),
      V: 1, // la v1 asume implícitamente 1 L en el balance de energía (F3)
      UA: n(v.U) * n(v.A_ICQ),
      T_cool: n(v.T_cool, 298.15),
      m_c: n(v.m_c, 1),
      Cp_c: n(v.Cp_ref, 1000),
    },
    stop: iso
      ? option === "X"
        ? { mode: "conversion", X_target: n(v.X_A_desired), t_final: 0, t_max: 1e6 }
        : { mode: "time", X_target: 0.9, t_final: n(v.t_reaction_det), t_max: 1e6 }
      : { mode: "complete", X_target: 0.9, t_final: 0, t_max: 1e6 },
    timeUnit: "min",
    volume: {
      enabled: v.ans_volume?.trim().toLowerCase() === "s",
      product: v.product_k ?? "C",
      P_kg_h: n(v.P_k) * 60,
      M_g_mol: n(v.m_k, 1),
      t_dead: n(v.t_mcd),
    },
  };
}
