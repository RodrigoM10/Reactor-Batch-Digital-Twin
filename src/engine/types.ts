// Tipos del motor. Unidades base, iguales a la tesis (v1):
//   concentración mol/L · energía cal · temperatura K · R = 1.987 cal/(mol·K)
//   el tiempo usa la unidad que elija el usuario (s, min o h) y k debe ser coherente con ella.

export type EnergyMode =
  | "isothermal" // T constante
  | "adiabatic" // sin intercambio de calor
  | "icq" // intercambiador de calor de la tesis: Q = m_c·Cp_c·(T − Tc)·(1 − e^(−UA/(m_c·Cp_c)))
  | "jacket"; // camisa a temperatura constante: Q = UA·(T − Tc)

export type KeqMethod = "direct" | "vant_hoff" | "gibbs";
export type StopMode = "conversion" | "time" | "complete";
export type TimeUnit = "s" | "min" | "h";
export type RateConstantMode = "arrhenius" | "direct";

export interface Species {
  id: string; // símbolo corto: "A", "B", …
  name: string; // nombre descriptivo (opcional en la UI)
  nu: number; // coeficiente estequiométrico (reactivos < 0, productos > 0, inertes 0)
  C0: number; // concentración inicial [mol/L]
  Cp: number; // capacidad calorífica [cal/(mol·K)]
  order: number; // orden directo (ley de potencias)
  reverseOrder: number; // orden inverso (ley de potencias)
  constantInRate: boolean; // usa C0 en la ley de velocidad (reactivo en exceso)
  DGf: number; // energía libre de formación [cal/mol] (método Gibbs)
}

export interface ReactorParams {
  species: Species[];
  keySpecies: string; // especie sobre la que se define X (la "A" de la tesis)
  reversible: boolean;
  kinetics: {
    mode: RateConstantMode;
    k: number; // k directa (solo isotérmico)
    A: number; // factor preexponencial
    E: number; // energía de activación [cal/mol]
  };
  equilibrium: {
    method: KeqMethod;
    Keq: number; // K directa
    Keq_ref: number; // K a T_ref (van't Hoff)
    T_ref: number; // [K]
  };
  deltaH: number; // ΔH_rxn [cal/mol de especie clave]
  energy: {
    mode: EnergyMode;
    T0: number; // temperatura inicial (o de operación si es isotérmico) [K]
    V: number; // volumen de mezcla [L]
    UA: number; // [cal/(tiempo·K)]
    T_cool: number; // temperatura de entrada del refrigerante [K]
    m_c: number; // caudal másico del refrigerante [kg/tiempo]
    Cp_c: number; // Cp del refrigerante [cal/(kg·K)]
  };
  stop: {
    mode: StopMode;
    X_target: number;
    t_final: number;
    t_max: number; // límite de seguridad
  };
  timeUnit: TimeUnit;
  volume: {
    enabled: boolean;
    product: string;
    P_kg_h: number; // producción deseada [kg/h]
    M_g_mol: number; // masa molar del producto [g/mol]
    t_dead: number; // tiempo muerto (carga, descarga, limpieza) [unidad de tiempo]
  };
}

export type StopReason = "target" | "time" | "complete" | "t_max";

export interface SimSummary {
  t_end: number;
  X_end: number;
  T_end: number;
  T_max: number;
  t_Tmax: number;
  X_max: number; // conversión máxima estequiométrica
  X_eq0: number | null; // X de equilibrio a T0
  k0: number;
  Keq0: number | null;
  deltaT_ad: number; // aumento adiabático de temperatura para X = X_max [K]
  volume: number | null; // [L]
  runaway: boolean;
  stopReason: StopReason;
  steps: number;
  solver: "dopri5" | "rosenbrock";
  elapsedMs: number;
}

export interface SimSeries {
  t: number[];
  X: number[];
  T: number[];
  C: Record<string, number[]>;
  rate: number[]; // −r_clave [mol/(L·tiempo)]
  k: number[];
  Keq: number[] | null;
  Xeq: number[] | null; // X de equilibrio a la T de cada instante
  Qg: number[]; // calor generado [cal/tiempo]
  Qr: number[]; // calor removido [cal/tiempo]
  T_cool_out: number[] | null; // salida del refrigerante (ICQ)
}

export interface SimOk {
  ok: true;
  series: SimSeries;
  summary: SimSummary;
  warnings: string[];
}

export interface SimError {
  ok: false;
  code: "invalid" | "unreachable" | "solver";
  error: string;
  details?: Record<string, number>;
}

export type SimResult = SimOk | SimError;
