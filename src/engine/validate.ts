import type { ReactorParams } from "./types";

/** Valida los parámetros antes de integrar. Devuelve una lista de errores en español (vacía si todo está bien). */
export function validateParams(p: ReactorParams): string[] {
  const errs: string[] = [];
  const num = (v: number, label: string, { min, positive }: { min?: number; positive?: boolean } = {}) => {
    if (!Number.isFinite(v)) errs.push(`${label}: valor inválido.`);
    else if (positive && v <= 0) errs.push(`${label} debe ser mayor a cero.`);
    else if (min !== undefined && v < min) errs.push(`${label} debe ser ≥ ${min}.`);
  };

  const ids = new Set<string>();
  for (const s of p.species) {
    if (!s.id.trim()) errs.push("Hay una especie sin símbolo.");
    if (ids.has(s.id)) errs.push(`El símbolo "${s.id}" está repetido.`);
    ids.add(s.id);
    num(s.nu, `ν de ${s.id}`);
    num(s.C0, `C0 de ${s.id}`, { min: 0 });
    num(s.order, `Orden directo de ${s.id}`, { min: 0 });
    num(s.reverseOrder, `Orden inverso de ${s.id}`, { min: 0 });
  }
  if (!p.species.some((s) => s.nu < 0)) errs.push("La reacción necesita al menos un reactivo (ν < 0).");
  const key = p.species.find((s) => s.id === p.keySpecies);
  if (!key) errs.push("Elegí la especie clave sobre la que se mide la conversión.");
  else {
    if (key.nu >= 0) errs.push("La especie clave debe ser un reactivo.");
    if (!(key.C0 > 0)) errs.push("La concentración inicial de la especie clave debe ser mayor a cero.");
  }

  const nonIso = p.energy.mode !== "isothermal";
  if (p.kinetics.mode === "direct") {
    if (nonIso) errs.push("En operación no isotérmica k debe calcularse con Arrhenius (A y E).");
    num(p.kinetics.k, "k", { positive: true });
  } else {
    num(p.kinetics.A, "Factor preexponencial A", { positive: true });
    num(p.kinetics.E, "Energía de activación E", { min: 0 });
  }

  if (p.reversible) {
    if (!p.species.some((s) => s.nu > 0)) errs.push("Una reacción reversible necesita al menos un producto.");
    const eq = p.equilibrium;
    if (eq.method === "direct") num(eq.Keq, "K_eq", { positive: true });
    if (eq.method === "vant_hoff") {
      num(eq.Keq_ref, "K_eq de referencia", { positive: true });
      num(eq.T_ref, "T de referencia", { positive: true });
      num(p.deltaH, "ΔH_rxn");
    }
    if (eq.method === "gibbs") for (const s of p.species) num(s.DGf, `ΔG°f de ${s.id}`);
  }

  num(p.energy.T0, nonIso ? "Temperatura inicial" : "Temperatura de operación", { positive: true });
  if (nonIso) {
    num(p.deltaH, "ΔH_rxn");
    num(p.energy.V, "Volumen de mezcla", { positive: true });
    for (const s of p.species) num(s.Cp, `Cp de ${s.id}`, { min: 0 });
    if (!(p.species.reduce((a, s) => a + s.C0 * s.Cp, 0) > 0))
      errs.push("La capacidad calorífica de la mezcla debe ser mayor a cero (revisá los Cp).");
  }
  if (p.energy.mode === "icq" || p.energy.mode === "jacket") {
    num(p.energy.UA, "U·A", { min: 0 });
    num(p.energy.T_cool, "Temperatura del refrigerante", { positive: true });
  }
  if (p.energy.mode === "icq") {
    num(p.energy.m_c, "Caudal de refrigerante", { positive: true });
    num(p.energy.Cp_c, "Cp del refrigerante", { positive: true });
  }

  if (p.stop.mode === "conversion" && !(p.stop.X_target > 0 && p.stop.X_target < 1))
    errs.push("La conversión objetivo debe estar entre 0 y 1.");
  if (p.stop.mode === "time") num(p.stop.t_final, "Tiempo de reacción", { positive: true });
  num(p.stop.t_max, "Tiempo máximo", { positive: true });

  if (p.volume.enabled) {
    if (!p.species.some((s) => s.id === p.volume.product)) errs.push("Elegí el producto para el cálculo de volumen.");
    num(p.volume.P_kg_h, "Producción", { positive: true });
    num(p.volume.M_g_mol, "Masa molar del producto", { positive: true });
    num(p.volume.t_dead, "Tiempo muerto", { min: 0 });
  }
  return errs;
}
