"use client";

import { useEffect, useMemo, useState } from "react";
import { PRESETS, simulate } from "@/engine";
import { ReactorSchematic } from "./reactor-schematic";

/** Reactor de la portada: corre el motor real (caso adiabático) y lo reproduce en bucle. */
export function HeroReactor() {
  const sim = useMemo(() => {
    const r = simulate(PRESETS.find((p) => p.id === "adiabatica")!.params, { samples: 120 });
    return r.ok ? r : null;
  }, []);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!sim) return;
    const id = setInterval(() => setI((x) => (x + 1) % (sim.series.t.length + 40)), 60);
    return () => clearInterval(id);
  }, [sim]);

  if (!sim) return null;
  const k = Math.min(i, sim.series.t.length - 1);
  return (
    <ReactorSchematic
      T={sim.series.T[k]}
      X={sim.series.X[k]}
      Tlow={300}
      Thigh={350}
      mode="adiabatic"
      label="Animación de un reactor batch adiabático calculada con el motor de la v2.0"
    />
  );
}
