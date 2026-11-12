import type { ReactorParams } from "../types";
import { brent } from "../solvers/brent";
import { equilibriumConstant, rateConstant } from "./thermo";

/**
 * Modelo compilado: arreglos planos para evaluar la ley de velocidad rápido dentro del integrador.
 *
 * Estequiometría por avance de reacción (generaliza Stoichiometry.calculate_concentrations de la tesis):
 *   ξ = C_clave0·X / |ν_clave|,   C_i = C_i0 + ν_i·ξ
 * Ley de velocidad (ley de potencias, coherente con K_c, corrige F1/F2 de la v1):
 *   −r_clave = k·( Π C_i^α_i − Π C_j^β_j / K_c )
 */
export interface CompiledModel {
  n: number;
  ids: string[];
  nu: Float64Array;
  C0: Float64Array;
  order: Float64Array;
  reverseOrder: Float64Array;
  constant: Uint8Array;
  keyIndex: number;
  CA0: number;
  xiPerX: number; // ξ por unidad de X
  X_max: number; // conversión máxima estequiométrica de la especie clave
  reversible: boolean;
}

export function compileModel(p: ReactorParams): CompiledModel {
  const sp = p.species;
  const keyIndex = sp.findIndex((s) => s.id === p.keySpecies);
  if (keyIndex < 0) throw new Error(`La especie clave "${p.keySpecies}" no existe.`);
  const key = sp[keyIndex];
  if (key.nu >= 0) throw new Error("La especie clave debe ser un reactivo (ν < 0).");
  if (key.C0 <= 0) throw new Error("La concentración inicial de la especie clave debe ser mayor a cero.");

  const CA0 = key.C0;
  const xiPerX = CA0 / Math.abs(key.nu);

  // Reactivo limitante: X no puede superar el valor que agota a cualquier reactivo.
  let X_max = 1;
  for (const s of sp) {
    if (s.nu < 0) X_max = Math.min(X_max, s.C0 / (Math.abs(s.nu) * xiPerX));
  }

  return {
    n: sp.length,
    ids: sp.map((s) => s.id),
    nu: Float64Array.from(sp, (s) => s.nu),
    C0: Float64Array.from(sp, (s) => s.C0),
    order: Float64Array.from(sp, (s) => s.order),
    reverseOrder: Float64Array.from(sp, (s) => s.reverseOrder),
    constant: Uint8Array.from(sp, (s) => (s.constantInRate ? 1 : 0)),
    keyIndex,
    CA0,
    xiPerX,
    X_max,
    reversible: p.reversible,
  };
}

export function concentration(m: CompiledModel, i: number, X: number): number {
  return m.C0[i] + m.nu[i] * m.xiPerX * X;
}

/** −r_clave [mol/(L·tiempo)] a la conversión X con constantes k y K_c ya evaluadas. */
export function rateAt(m: CompiledModel, X: number, k: number, Kc: number | null): number {
  let fwd = 1;
  let rev = 1;
  for (let i = 0; i < m.n; i++) {
    const C = m.constant[i] ? m.C0[i] : Math.max(concentration(m, i, X), 0);
    const a = m.order[i];
    const b = m.reverseOrder[i];
    if (a !== 0) fwd *= Math.pow(C, a);
    if (b !== 0) rev *= Math.pow(C, b);
  }
  if (!m.reversible || Kc === null) return k * fwd;
  return k * (fwd - rev / Kc);
}

/** Cociente de reacción en concentraciones Q = Π C_i^ν_i (misma definición que equilibrium_conversion_calculate). */
function logQ(m: CompiledModel, X: number): number {
  let s = 0;
  for (let i = 0; i < m.n; i++) {
    if (m.nu[i] === 0) continue;
    s += m.nu[i] * Math.log(Math.max(concentration(m, i, X), 1e-300));
  }
  return s;
}

/** Conversión de equilibrio para K_c; null si no hay solución en (0, X_max). */
export function equilibriumConversion(m: CompiledModel, Kc: number): number | null {
  if (!(Kc > 0) || !Number.isFinite(Kc)) return null;
  const lnK = Math.log(Kc);
  const lo = 1e-12;
  const hi = m.X_max * (1 - 1e-12);
  const f = (X: number) => logQ(m, X) - lnK;
  const flo = f(lo);
  const fhi = f(hi);
  if (flo > 0) return 0; // la mezcla inicial ya está más allá del equilibrio
  if (fhi < 0) return m.X_max; // equilibrio prácticamente completo
  return brent(f, lo, hi, 1e-13);
}

/** Evaluadores dependientes de T, con caché simple porque el integrador repite la misma T. */
export function makeThermoEvaluator(p: ReactorParams) {
  let lastT = NaN;
  let lastK = 0;
  let lastKc: number | null = null;
  return (T: number) => {
    if (T !== lastT) {
      lastT = T;
      lastK = rateConstant(p, T);
      lastKc = p.reversible ? equilibriumConstant(p, T) : null;
    }
    return { k: lastK, Kc: lastKc };
  };
}
