import {
  Activity,
  ArrowRight,
  Bot,
  Cpu,
  Crosshair,
  Map as MapIcon,
  FlaskConical,
  GitCompareArrows,
  LineChart,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { HeroReactor } from "@/components/hero-reactor";
import { SiteHeader } from "@/components/site-header";
import { V1_BACK_REPO, V1_FRONT_REPO, V1_URL } from "@/lib/site";

const FEATURES: { icon: typeof Zap; title: string; text: string; href?: string }[] = [
  {
    icon: Zap,
    title: "Resultados al instante",
    text: "El motor corre en tu navegador. Sin servidor que despertar: cada cambio se recalcula en milisegundos.",
  },
  {
    icon: SlidersHorizontal,
    title: "Gemelo digital interactivo",
    text: "Mové la temperatura, el caudal de refrigerante o la cinética y mirá cómo responde el reactor en vivo, con reproducción del batch.",
  },
  {
    icon: FlaskConical,
    title: "Cinética generalizada",
    text: "N especies, coeficientes y órdenes arbitrarios (ley de potencias), reactivos en exceso, inertes y elección de la especie clave.",
  },
  {
    icon: LineChart,
    title: "Nuevas herramientas de análisis",
    text: "Diagrama conversión–temperatura con equilibrio, recta adiabática y curva de T óptima; gráfico de Levenspiel; calor generado y removido.",
  },
  {
    icon: Crosshair,
    title: "Calibrar con datos",
    text: "Cargá una corrida medida y ajustá k, E, ΔH y UA con Levenberg–Marquardt, con su incertidumbre y la comparación contra el modelo nominal.",
    href: "/calibrar",
  },
  {
    icon: MapIcon,
    title: "Mapa de riesgo",
    text: "Una red neuronal entrenada con 24 000 simulaciones dibuja al instante la frontera de runaway según T₀, refrigerante y UA.",
    href: "/riesgo",
  },
  {
    icon: Activity,
    title: "Pronóstico en vivo",
    text: "Una corrida llega dato a dato y dos métodos, ML y física + datos, pronostican la temperatura y avisan antes del runaway.",
    href: "/en-vivo",
  },
  {
    icon: ShieldCheck,
    title: "Validado contra la tesis",
    text: "Pruebas automáticas contra soluciones analíticas y contra el motor Python original, con las diferencias documentadas.",
  },
  {
    icon: Cpu,
    title: "Integradores propios",
    text: "Dormand–Prince 5(4) con salida densa y eventos, y Rosenbrock para casos rígidos como el descontrol térmico.",
  },
];

const DIFFS = [
  ["Velocidad inversa", "Usaba C_C·C_D con el signo estequiométrico cambiado; para A ⇌ B valía cero.", "−r = k·(Π Cᵢ^αᵢ − Π Cⱼ^βⱼ / K_c), coherente con K_eq."],
  ["Equilibrio con intercambiador (ICQ)", "Al llegar a X_eq se congelaban X y también T.", "El equilibrio surge de la cinética; el intercambiador sigue actuando."],
  ["Volumen en el balance de energía", "Implícito en 1 L.", "Volumen de mezcla V explícito."],
  ["Corte de la integración", "Adiabático hasta t = 50 000 con paso 1 (segundos de cálculo).", "Eventos: conversión objetivo o reacción completa (milisegundos)."],
  ["Unidades de tiempo", "La producción en kg/min se mezclaba con tiempos en segundos.", "Unidad de tiempo explícita; producción en kg/h convertida."],
  ["Precisión numérica", "Tolerancia por defecto de SciPy (rtol = 1e-3).", "rtol = 1e-8, verificada contra soluciones analíticas."],
  ["Equilibrio con van't Hoff", "ΔH por mol de A con K_c por reacción: con 2A ⇌ C, K_c(T) variaba a la mitad de la pendiente.", "ΔH de la reacción escrita (a·ΔH); con a = 1 coincide con la tesis."],
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
              <span className="size-1.5 rounded-full bg-ok" /> Versión 2.0 · reversionada
            </p>
            <h1 className="text-4xl leading-tight font-bold tracking-tight md:text-5xl">
              El reactor batch, <span className="text-accent">en tiempo real</span>.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted">
              Gemelo digital de un Tanque Agitado Discontinuo: balances de materia y energía, equilibrio químico y
              dimensionamiento, con un motor nuevo que corre en tu navegador. Construido sobre las bases de la tesis
              «Modelado y Simulación de un Reactor Batch en Python».
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/simulador"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90 dark:text-bg"
              >
                Abrir el simulador <ArrowRight className="size-4" />
              </Link>
              <a
                href={V1_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-5 py-2.5 font-medium hover:border-accent hover:text-accent"
              >
                Ver la versión de la tesis
              </a>
            </div>
          </div>
          <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="aspect-[34/30]">
              <HeroReactor />
            </div>
            <p className="text-center text-xs text-muted">Reacción exotérmica adiabática calculada en vivo por el motor 2.0</p>
          </div>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <h2 className="text-2xl font-semibold">Qué hay de nuevo</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text, href }) => {
                const body = (
                  <>
                    <Icon className="size-5 text-accent" />
                    <h3 className="mt-3 flex items-center gap-1.5 font-semibold">
                      {title}
                      {href && <ArrowRight className="size-3.5 text-muted" />}
                    </h3>
                    <p className="mt-1.5 text-sm text-muted">{text}</p>
                  </>
                );
                return href ? (
                  <Link key={title} href={href} className="rounded-xl border border-border bg-bg p-5 transition-colors hover:border-accent">
                    {body}
                  </Link>
                ) : (
                  <div key={title} className="rounded-xl border border-border bg-bg p-5">
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="size-5 text-accent" />
            <h2 className="text-2xl font-semibold">De la tesis a la 2.0</h2>
          </div>
          <p className="mt-2 max-w-3xl text-muted">
            La versión de la tesis se conserva sin cambios como trabajo académico. La 2.0 mantiene su modelo (balances,
            Arrhenius, Van&apos;t Hoff, Gibbs, intercambiador ICQ y dimensionamiento) y corrige por diseño los puntos
            detectados al revisarla.
          </p>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Aspecto</th>
                  <th className="px-4 py-2.5 font-medium">Tesis (v1)</th>
                  <th className="px-4 py-2.5 font-medium">Versión 2.0</th>
                </tr>
              </thead>
              <tbody>
                {DIFFS.map(([a, v1, v2]) => (
                  <tr key={a} className="border-t border-border bg-surface align-top">
                    <td className="px-4 py-3 font-medium">{a}</td>
                    <td className="px-4 py-3 text-muted">{v1}</td>
                    <td className="px-4 py-3">{v2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 md:flex-row md:items-center">
            <Bot className="size-8 shrink-0 text-accent" />
            <div>
              <h2 className="font-semibold">Próximamente: asistente con inteligencia artificial</h2>
              <p className="mt-1 text-sm text-muted">
                Explicación de resultados en lenguaje natural y configuración de casos describiéndolos en palabras.
                Más adelante: un modelo híbrido física + ML entrenado con datos medidos y múltiples reacciones
                simultáneas.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted md:flex-row md:items-center md:justify-between">
          <p>
            Rodrigo Mendoza · Ingeniería Química · Trabajo final «Modelado y Simulación de un Reactor Batch en Python»
            (2025)
          </p>
          <div className="flex gap-4">
            <a href={V1_FRONT_REPO} target="_blank" rel="noreferrer" className="hover:text-text">
              Front tesis
            </a>
            <a href={V1_BACK_REPO} target="_blank" rel="noreferrer" className="hover:text-text">
              Motor tesis
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
