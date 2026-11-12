"use client";

import { Atom, Flame, FlaskConical, Gauge, Plus, Ruler, Scale, Timer, Trash2 } from "lucide-react";
import { convertTimeUnit, species as makeSpecies, type ReactorParams, type Species, type TimeUnit } from "@/engine";
import { useReactorStore } from "@/lib/store";
import { cn, fmt, TIME_LABEL } from "@/lib/format";
import { NumberField, Section, Segmented, SelectField, Toggle } from "./ui/fields";

const R = 1.987;
const TIME_OPTIONS: { value: TimeUnit; label: string }[] = [
  { value: "s", label: "segundos" },
  { value: "min", label: "minutos" },
  { value: "h", label: "horas" },
];

export function reactionEquation(p: ReactorParams) {
  const term = (s: Species) => `${Math.abs(s.nu) === 1 ? "" : Math.abs(s.nu)}${s.id}`;
  const lhs = p.species.filter((s) => s.nu < 0).map(term).join(" + ");
  const rhs = p.species.filter((s) => s.nu > 0).map(term).join(" + ");
  return `${lhs} ${p.reversible ? "⇌" : "→"} ${rhs || "productos"}`;
}

export function ParamsPanel() {
  const p = useReactorStore((s) => s.params);
  const update = useReactorStore((s) => s.update);
  const nonIso = p.energy.mode !== "isothermal";
  const tu = TIME_LABEL[p.timeUnit];
  // Cambiar la unidad convierte A, k, UA, caudal y tiempos: el reactor sigue siendo el mismo.
  const setTimeUnit = (v: TimeUnit) => update((d) => void Object.assign(d, convertTimeUnit(d, v)));
  const reactants = p.species.filter((s) => s.nu < 0);
  const products = p.species.filter((s) => s.nu > 0);

  const setSpecies = (i: number, patch: Partial<Species>) =>
    update((d) => {
      const s = d.species[i];
      const oldId = s.id;
      Object.assign(s, patch);
      if (patch.nu !== undefined) {
        // Al cambiar ν se recalculan los órdenes elementales de esa especie.
        s.order = s.nu < 0 ? -s.nu : 0;
        s.reverseOrder = s.nu > 0 ? s.nu : 0;
      }
      if (patch.id !== undefined) {
        if (d.keySpecies === oldId) d.keySpecies = s.id;
        if (d.volume.product === oldId) d.volume.product = s.id;
      }
    });

  const k0 =
    p.kinetics.mode === "direct" ? p.kinetics.k : p.kinetics.A * Math.exp(-p.kinetics.E / (R * p.energy.T0));

  return (
    <div className="text-sm">
      <Section title="Reacción" icon={<Atom className="size-4" />}>
        <div className="rounded-lg bg-accent-soft px-3 py-2 text-center font-mono text-sm text-accent">
          {reactionEquation(p)}
        </div>
        <Toggle label="Reacción reversible" checked={p.reversible} onChange={(v) => update((d) => void (d.reversible = v))} />
        <SelectField
          label="Especie clave (define la conversión X)"
          value={p.keySpecies}
          options={reactants.map((s) => ({ value: s.id, label: `${s.id}${s.name ? ` · ${s.name}` : ""}` }))}
          onChange={(v) => update((d) => void (d.keySpecies = v))}
        />
        <div className="space-y-2">
          {p.species.map((s, i) => (
            <div key={i} className="rounded-lg border border-border p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <input
                  aria-label="Símbolo"
                  value={s.id}
                  maxLength={4}
                  onChange={(e) => setSpecies(i, { id: e.target.value })}
                  className="w-12 rounded-md border border-border bg-surface-2 px-1.5 py-1 text-center font-mono text-sm font-semibold"
                />
                <input
                  aria-label="Nombre"
                  placeholder="Nombre (opcional)"
                  value={s.name}
                  onChange={(e) => setSpecies(i, { name: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-border focus:border-accent focus:outline-none"
                />
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                    s.nu < 0 ? "bg-cool/15 text-cool" : s.nu > 0 ? "bg-heat/15 text-heat" : "bg-surface-2 text-muted",
                  )}
                >
                  {s.nu < 0 ? "reactivo" : s.nu > 0 ? "producto" : "inerte"}
                </span>
                <button
                  type="button"
                  aria-label={`Quitar ${s.id}`}
                  disabled={p.species.length <= 2}
                  onClick={() =>
                    update((d) => {
                      d.species.splice(i, 1);
                      if (!d.species.some((x) => x.id === d.keySpecies))
                        d.keySpecies = d.species.find((x) => x.nu < 0)?.id ?? "";
                    })
                  }
                  className="text-muted hover:text-danger disabled:opacity-30"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NumberField compact label="ν" value={s.nu} onChange={(v) => setSpecies(i, { nu: v })} />
                <NumberField compact label="C₀" unit="mol/L" min={0} value={s.C0} onChange={(v) => setSpecies(i, { C0: v })} />
                <NumberField compact label="Orden" min={0} value={s.order} onChange={(v) => setSpecies(i, { order: v })} />
                {p.reversible && (
                  <NumberField
                    compact
                    label="Orden inv."
                    min={0}
                    value={s.reverseOrder}
                    onChange={(v) => setSpecies(i, { reverseOrder: v })}
                  />
                )}
                {nonIso && (
                  <NumberField compact label="Cp" unit="cal/mol·K" min={0} value={s.Cp} onChange={(v) => setSpecies(i, { Cp: v })} />
                )}
                {p.reversible && p.equilibrium.method === "gibbs" && (
                  <NumberField compact label="ΔG°f" unit="cal/mol" value={s.DGf} onChange={(v) => setSpecies(i, { DGf: v })} />
                )}
              </div>
              {s.nu < 0 && s.id !== p.keySpecies && (
                <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={s.constantInRate}
                    onChange={(e) => setSpecies(i, { constantInRate: e.target.checked })}
                  />
                  En exceso (C ≈ C₀ en la ley de velocidad)
                </label>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              update((d) => {
                const used = new Set(d.species.map((s) => s.id));
                const id = "ABCDEFGHJKLMNOPQRSTUVWXYZ".split("").find((c) => !used.has(c)) ?? `S${d.species.length}`;
                d.species.push(makeSpecies(id, 1, 0));
              })
            }
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 text-xs text-muted hover:border-accent hover:text-accent"
          >
            <Plus className="size-3.5" /> Agregar especie
          </button>
          <button
            type="button"
            title="Órdenes iguales a los coeficientes estequiométricos (reacción elemental)"
            onClick={() =>
              update((d) =>
                d.species.forEach((s) => {
                  s.order = s.nu < 0 ? -s.nu : 0;
                  s.reverseOrder = s.nu > 0 ? s.nu : 0;
                  s.constantInRate = false;
                }),
              )
            }
            className="flex-1 rounded-md border border-border py-1.5 text-xs text-muted hover:border-accent hover:text-accent"
          >
            Órdenes elementales
          </button>
        </div>
      </Section>

      <Section title="Cinética" icon={<Gauge className="size-4" />}>
        <Segmented
          value={p.kinetics.mode}
          onChange={(v) => update((d) => void (d.kinetics.mode = v))}
          options={[
            { value: "arrhenius", label: "Arrhenius" },
            { value: "direct", label: "k constante", disabled: nonIso },
          ]}
        />
        <Segmented label="Unidad de tiempo" value={p.timeUnit} onChange={setTimeUnit} options={TIME_OPTIONS} />
        {p.kinetics.mode === "direct" ? (
          <NumberField
            label="Constante de velocidad k"
            unit={`(L/mol)ⁿ⁻¹/${tu}`}
            min={0}
            value={p.kinetics.k}
            slider={{ min: 1e-6, max: 10, log: true }}
            onChange={(v) => update((d) => void (d.kinetics.k = v))}
          />
        ) : (
          <>
            <NumberField
              label="Factor preexponencial A"
              unit={`(L/mol)ⁿ⁻¹/${tu}`}
              min={0}
              value={p.kinetics.A}
              slider={{ min: 1, max: 1e18, log: true }}
              onChange={(v) => update((d) => void (d.kinetics.A = v))}
            />
            <NumberField
              label="Energía de activación E"
              unit="cal/mol"
              min={0}
              value={p.kinetics.E}
              slider={{ min: 0, max: 40000 }}
              onChange={(v) => update((d) => void (d.kinetics.E = v))}
            />
          </>
        )}
        <p className="text-xs text-muted">
          k(T₀) = <span className="num font-mono text-text">{fmt(k0)}</span>
        </p>
      </Section>

      {p.reversible && (
        <Section title="Equilibrio" icon={<Scale className="size-4" />}>
          <Segmented
            value={p.equilibrium.method}
            onChange={(v) => update((d) => void (d.equilibrium.method = v))}
            options={[
              { value: "direct", label: "K directa" },
              { value: "vant_hoff", label: "Van't Hoff" },
              { value: "gibbs", label: "Gibbs" },
            ]}
          />
          {p.equilibrium.method === "direct" && (
            <NumberField
              label="K_eq (en concentraciones)"
              min={0}
              value={p.equilibrium.Keq}
              slider={{ min: 1e-3, max: 1e4, log: true }}
              onChange={(v) => update((d) => void (d.equilibrium.Keq = v))}
            />
          )}
          {p.equilibrium.method === "vant_hoff" && (
            <>
              <NumberField
                label="K_eq de referencia"
                min={0}
                value={p.equilibrium.Keq_ref}
                slider={{ min: 1e-3, max: 1e8, log: true }}
                onChange={(v) => update((d) => void (d.equilibrium.Keq_ref = v))}
              />
              <NumberField
                label="T de referencia"
                unit="K"
                min={0}
                value={p.equilibrium.T_ref}
                onChange={(v) => update((d) => void (d.equilibrium.T_ref = v))}
              />
              {!nonIso && <DeltaH p={p} update={update} />}
            </>
          )}
          {p.equilibrium.method === "gibbs" && (
            <p className="text-xs text-muted">Cargá ΔG°f en cada especie (sección Reacción).</p>
          )}
        </Section>
      )}

      <Section title="Operación térmica" icon={<Flame className="size-4" />}>
        <Segmented
          value={p.energy.mode}
          onChange={(v) =>
            update((d) => {
              d.energy.mode = v;
              if (v !== "isothermal") d.kinetics.mode = "arrhenius";
            })
          }
          options={[
            { value: "isothermal", label: "Isotérmico" },
            { value: "adiabatic", label: "Adiabático" },
            { value: "icq", label: "ICQ" },
            { value: "jacket", label: "Camisa" },
          ]}
        />
        <NumberField
          label={nonIso ? "Temperatura inicial T₀" : "Temperatura de operación"}
          unit="K"
          min={1}
          value={p.energy.T0}
          slider={{ min: 250, max: 650 }}
          onChange={(v) => update((d) => void (d.energy.T0 = v))}
        />
        {nonIso && (
          <>
            <DeltaH p={p} update={update} />
            <NumberField
              label="Volumen de mezcla V"
              unit="L"
              min={0}
              value={p.energy.V}
              onChange={(v) => update((d) => void (d.energy.V = v))}
            />
          </>
        )}
        {(p.energy.mode === "icq" || p.energy.mode === "jacket") && (
          <>
            <NumberField
              label="U·A"
              unit={`cal/(${tu}·K)`}
              min={0}
              value={p.energy.UA}
              slider={{ min: 1, max: 1e5, log: true }}
              onChange={(v) => update((d) => void (d.energy.UA = v))}
            />
            <NumberField
              label="Temperatura del refrigerante"
              unit="K"
              min={1}
              value={p.energy.T_cool}
              slider={{ min: 250, max: 600 }}
              onChange={(v) => update((d) => void (d.energy.T_cool = v))}
            />
          </>
        )}
        {p.energy.mode === "icq" && (
          <>
            <NumberField
              label="Caudal de refrigerante m_c"
              unit={`kg/${tu}`}
              min={0}
              value={p.energy.m_c}
              slider={{ min: 0.01, max: 100, log: true }}
              onChange={(v) => update((d) => void (d.energy.m_c = v))}
            />
            <NumberField
              label="Cp del refrigerante"
              unit="cal/(kg·K)"
              min={0}
              value={p.energy.Cp_c}
              onChange={(v) => update((d) => void (d.energy.Cp_c = v))}
            />
          </>
        )}
      </Section>

      <Section title="Tiempo y corte" icon={<Timer className="size-4" />}>
        <Segmented
          value={p.stop.mode}
          onChange={(v) => update((d) => void (d.stop.mode = v))}
          options={[
            { value: "complete", label: "Hasta completar" },
            { value: "time", label: "Tiempo fijo" },
            { value: "conversion", label: "X objetivo" },
          ]}
        />
        {p.stop.mode === "time" && (
          <NumberField
            label="Tiempo de reacción"
            unit={tu}
            min={0}
            value={p.stop.t_final}
            slider={{ min: 0.1, max: 1e4, log: true }}
            onChange={(v) => update((d) => void (d.stop.t_final = v))}
          />
        )}
        {p.stop.mode === "conversion" && (
          <NumberField
            label="Conversión deseada X"
            min={0}
            value={p.stop.X_target}
            slider={{ min: 0.01, max: 0.999 }}
            onChange={(v) => update((d) => void (d.stop.X_target = v))}
          />
        )}
        <SelectField
          label="Unidad de tiempo (al cambiarla se convierten A, k, UA, caudal y tiempos)"
          value={p.timeUnit}
          options={TIME_OPTIONS}
          onChange={(v) => setTimeUnit(v as TimeUnit)}
        />
      </Section>

      <Section title="Dimensionamiento" icon={<Ruler className="size-4" />} defaultOpen={p.volume.enabled}>
        <Toggle
          label="Calcular volumen del reactor"
          checked={p.volume.enabled}
          onChange={(v) => update((d) => void (d.volume.enabled = v))}
        />
        {p.volume.enabled && (
          <>
            <SelectField
              label="Producto de interés"
              value={p.volume.product}
              options={products.map((s) => ({ value: s.id, label: `${s.id}${s.name ? ` · ${s.name}` : ""}` }))}
              onChange={(v) => update((d) => void (d.volume.product = v))}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Producción"
                unit="kg/h"
                min={0}
                value={p.volume.P_kg_h}
                onChange={(v) => update((d) => void (d.volume.P_kg_h = v))}
              />
              <NumberField
                label="Masa molar"
                unit="g/mol"
                min={0}
                value={p.volume.M_g_mol}
                onChange={(v) => update((d) => void (d.volume.M_g_mol = v))}
              />
            </div>
            <NumberField
              label="Tiempo muerto (carga, descarga, limpieza)"
              unit={tu}
              min={0}
              value={p.volume.t_dead}
              onChange={(v) => update((d) => void (d.volume.t_dead = v))}
            />
          </>
        )}
      </Section>

      <div className="flex items-start gap-2 px-4 py-3 text-xs text-muted">
        <FlaskConical className="mt-0.5 size-3.5 shrink-0" />
        Unidades de la tesis: mol/L, cal, K. Los resultados se recalculan solos al cambiar cualquier valor.
      </div>
    </div>
  );
}

function DeltaH({ p, update }: { p: ReactorParams; update: (fn: (d: ReactorParams) => void) => void }) {
  return (
    <NumberField
      label="ΔH de reacción"
      unit={`cal/mol ${p.keySpecies}`}
      value={p.deltaH}
      slider={{ min: -60000, max: 30000 }}
      onChange={(v) => update((d) => void (d.deltaH = v))}
    />
  );
}
