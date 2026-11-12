# ⚗️ Reactor Batch 2.0 · Gemelo digital

Simulador de reactores batch (TAD – Tanque Agitado Discontinuo) en tiempo real. Es la versión reversionada del trabajo final **«Modelado y Simulación de un Reactor Batch en Python»** (Rodrigo Mendoza, 2025). La versión de la tesis se conserva sin cambios:

- Front de la tesis: https://github.com/RodrigoM10/Batch-Reactor-Front (https://batch-reactor-front.vercel.app/)
- Motor de la tesis: https://github.com/RodrigoM10/Batch-Reactor-Simulate

## Qué cambia respecto de la tesis

- **Sin servidor**: el motor está escrito en TypeScript y corre en el navegador (Web Worker). Cada simulación tarda milisegundos y no hay que esperar a que despierte un backend.
- **Gemelo digital**: los resultados se recalculan solos al mover cualquier parámetro. Incluye un esquema animado del reactor y la reproducción del batch en el tiempo.
- **Funciones generalizadas**: admite N especies con coeficientes arbitrarios, órdenes de ley de potencias, reactivos en exceso, inertes y elección de la especie clave. Se suman la camisa a temperatura constante y un volumen de mezcla explícito.
- **Nuevas herramientas de análisis**: diagrama X–T (con equilibrio, recta adiabática y T óptima), gráfico de Levenspiel, calor generado y removido, exportación CSV y escenarios compartibles por enlace.
- **Compatibilidad**: importa directamente un `sim_params.json` de la tesis.

### Diferencias de modelo con la v1

| Punto | Tesis (v1) | 2.0 |
|---|---|---|
| F1/F2 · Término inverso | `k·C_C·C_D/K` con concentraciones de producto de signo cambiado; para A ⇌ B vale 0 | `−r = k·(Π Cᵢ^αᵢ − Π Cⱼ^βⱼ / K_c)`, coherente con K_eq |
| F3 · Volumen | Implícito en 1 L dentro del balance de energía | `V` explícito (con V = 1 L se reproduce la v1) |
| F4 · Equilibrio en ICQ | Devuelve `[0, 0]` y congela también T | El equilibrio surge de la cinética |
| F5 · Corte | Adiabático hasta t = 50 000 con `max_step = 1` | Eventos de conversión objetivo y de reacción completa |
| F7 · Unidades | La producción en kg/min se mezclaba con tiempos en s | Unidad de tiempo explícita y producción en kg/h |
| F10 · Precisión | `rtol = 1e-3` (por defecto en SciPy) | `rtol = 1e-8`, verificada con soluciones analíticas |

Ejemplo: para el caso de la tesis (`sim_params.json`, acetato de etilo), la v1 da X = 0.48 a los 120 min y la 2.0 da X = 0.35. La diferencia se debe a F1: en la v1 el término inverso suma velocidad en lugar de restarla.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:3000
npm run test       # Vitest: motor contra soluciones analíticas y contra la v1
npm run lint
npm run build
```

### Casos de referencia de la tesis

`tests/engine/fixtures/v1/*.json` se generan ejecutando el motor Python original sin modificarlo:

```bash
../Batch-Reactor-Simulate/.venv/Scripts/python -B tools/generate_v1_fixtures.py ../Batch-Reactor-Simulate
```

Cada caso se marca como `match` (la 2.0 debe coincidir con la v1) o `divergent` (la diferencia está documentada y tiene su motivo).

## Estructura

```
src/engine/       motor puro (sin React): modelo, integradores, análisis, presets, compatibilidad v1
src/workers/      Web Worker que expone el motor con Comlink
src/components/   simulador, panel de parámetros, esquema del reactor, gráficos
src/app/          portada (/) y simulador (/simulador)
tests/engine/     pruebas del motor
tools/            generador de casos de referencia desde la v1
```

## Próximamente

- Asistente con IA que explique los resultados y permita configurar casos en lenguaje natural.
- Ajuste de parámetros cinéticos a partir de datos experimentales.
- Múltiples reacciones simultáneas.
