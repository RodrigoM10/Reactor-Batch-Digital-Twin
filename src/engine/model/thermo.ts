import type { ReactorParams, Species } from "../types";

export const R = 1.987; // cal/(mol·K), igual que la tesis

/** Arrhenius: k = A·e^(−E/RT). */
export function rateConstant(p: ReactorParams, T: number): number {
  if (p.kinetics.mode === "direct") return p.kinetics.k;
  return p.kinetics.A * Math.exp(-p.kinetics.E / (R * T));
}

/** K_eq a la temperatura T según el método elegido (misma semántica que Equilibrium.calculate_keq_auto). */
export function equilibriumConstant(p: ReactorParams, T: number): number {
  const eq = p.equilibrium;
  switch (eq.method) {
    case "direct":
      return eq.Keq;
    case "vant_hoff":
      return eq.Keq_ref * Math.exp((p.deltaH / R) * (1 / eq.T_ref - 1 / T));
    case "gibbs": {
      const dG = p.species.reduce((acc, s) => acc + s.nu * s.DGf, 0);
      return Math.exp(-dG / (R * T));
    }
  }
}

/** Σ C_i0·Cp_i [cal/(L·K)]: capacidad calorífica de la mezcla por litro (ΔCp ≈ 0, como en la tesis). */
export function mixtureHeatCapacity(species: Species[]): number {
  return species.reduce((acc, s) => acc + s.C0 * s.Cp, 0);
}
