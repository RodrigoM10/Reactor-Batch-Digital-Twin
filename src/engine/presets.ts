import type { ReactorParams, Species } from "./types";

/** Crea una especie con órdenes por defecto coherentes con la estequiometría (elemental). */
export function species(id: string, nu: number, C0: number, extra: Partial<Species> = {}): Species {
  return {
    id,
    name: "",
    nu,
    C0,
    Cp: 0,
    order: nu < 0 ? -nu : 0,
    reverseOrder: nu > 0 ? nu : 0,
    constantInRate: false,
    DGf: 0,
    ...extra,
  };
}

const base: Omit<ReactorParams, "species"> = {
  keySpecies: "A",
  reversible: false,
  kinetics: { mode: "arrhenius", k: 0.05, A: 1e8, E: 15000 },
  equilibrium: { method: "direct", Keq: 1, Keq_ref: 1, T_ref: 298.15 },
  deltaH: -10000,
  energy: { mode: "isothermal", T0: 350, V: 1, UA: 200, T_cool: 300, m_c: 1, Cp_c: 1000 },
  stop: { mode: "complete", X_target: 0.9, t_final: 120, t_max: 100000 },
  timeUnit: "min",
  volume: { enabled: false, product: "C", P_kg_h: 100, M_g_mol: 100, t_dead: 30 },
};

export interface Preset {
  id: string;
  title: string;
  description: string;
  params: ReactorParams;
}

export const PRESETS: Preset[] = [
  {
    id: "tesis-esterificacion",
    title: "Tesis · Acetato de etilo",
    description:
      "Caso de la tesis (sim_params.json): A + B ⇌ C + D, isotérmico a 373 K, K_eq = 2.93, con dimensionamiento del reactor.",
    params: {
      ...base,
      species: [
        species("A", -1, 3.91, { name: "Ácido acético" }),
        species("B", -1, 10.18, { name: "Etanol" }),
        species("C", 1, 0, { name: "Acetato de etilo" }),
        species("D", 1, 17.56, { name: "Agua" }),
      ],
      reversible: true,
      kinetics: { mode: "direct", k: 0.0004758, A: 1e8, E: 15000 },
      equilibrium: { method: "direct", Keq: 2.93, Keq_ref: 2.93, T_ref: 373 },
      energy: { ...base.energy, mode: "isothermal", T0: 373 },
      stop: { ...base.stop, mode: "time", t_final: 120 },
      volume: { enabled: true, product: "C", P_kg_h: 37.72 * 60, M_g_mol: 88, t_dead: 30 },
    },
  },
  {
    id: "adiabatica",
    title: "Exotérmica adiabática",
    description: "A → B de primer orden con inerte: la temperatura sube sobre la recta adiabática hasta completar.",
    params: {
      ...base,
      species: [
        species("A", -1, 2, { Cp: 30 }),
        species("B", 1, 0, { Cp: 30 }),
        species("I", 0, 20, { name: "Inerte (agua)", Cp: 18 }),
      ],
      kinetics: { mode: "arrhenius", k: 0.05, A: 4.3e9, E: 15000 },
      deltaH: -10000,
      energy: { ...base.energy, mode: "adiabatic", T0: 300 },
    },
  },
  {
    id: "runaway",
    title: "Camisa ICQ · al borde del runaway",
    description:
      "A + B → C de segundo orden enfriada con intercambiador (modelo ICQ de la tesis). Bajá el caudal de refrigerante a menos de 1 kg/min para ver el descontrol.",
    params: {
      ...base,
      species: [
        species("A", -1, 2, { Cp: 35 }),
        species("B", -1, 2.5, { Cp: 30 }),
        species("C", 1, 0, { Cp: 50 }),
        species("I", 0, 25, { name: "Solvente", Cp: 18 }),
      ],
      kinetics: { mode: "arrhenius", k: 0.05, A: 1.0e11, E: 16000 },
      deltaH: -18000,
      energy: { ...base.energy, mode: "icq", T0: 305, V: 1, UA: 1500, T_cool: 300, m_c: 3, Cp_c: 1000 },
    },
  },
  {
    id: "reversible-exotermica",
    title: "Reversible exotérmica (van't Hoff)",
    description:
      "A ⇌ B adiabática: el equilibrio cae al subir T. Mirá el diagrama X–T con la curva de T óptima.",
    params: {
      ...base,
      species: [species("A", -1, 1, { Cp: 50 }), species("B", 1, 0, { Cp: 50 }), species("I", 0, 10, { Cp: 18 })],
      reversible: true,
      kinetics: { mode: "arrhenius", k: 0.05, A: 5e7, E: 13000 },
      equilibrium: { method: "vant_hoff", Keq: 1, Keq_ref: 5000, T_ref: 298 },
      deltaH: -20000,
      energy: { ...base.energy, mode: "adiabatic", T0: 300 },
    },
  },
];

export const DEFAULT_PRESET = PRESETS[0];
