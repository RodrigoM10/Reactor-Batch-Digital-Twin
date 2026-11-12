# ⚗️ Reactor Batch 2.0 · Gemelo digital

Simulador de reactores batch (TAD – Tanque Agitado Discontinuo) en tiempo real, con herramientas de datos y machine learning. Es la versión reversionada del trabajo final **«Modelado y Simulación de un Reactor Batch en Python»** (Rodrigo Mendoza, 2025).

**App:** https://reactor-batch-digital-twin.vercel.app/

La versión de la tesis se conserva sin cambios:

- Front de la tesis: https://github.com/RodrigoM10/Batch-Reactor-Front (https://batch-reactor-front.vercel.app/)
- Motor de la tesis: https://github.com/RodrigoM10/Batch-Reactor-Simulate

## Qué cambia respecto de la tesis

- **Sin servidor**: el motor está escrito en TypeScript y corre en el navegador (Web Worker). Cada simulación tarda milisegundos y no hay que esperar a que despierte un backend.
- **Gemelo digital**: los resultados se recalculan solos al mover cualquier parámetro. Incluye un esquema animado del reactor y la reproducción del batch en el tiempo.
- **Funciones generalizadas**: admite N especies con coeficientes arbitrarios, órdenes de ley de potencias, reactivos en exceso, inertes y elección de la especie clave. Se suman la camisa a temperatura constante y un volumen de mezcla explícito.
- **Nuevas herramientas de análisis**: diagrama X–T (con equilibrio, recta adiabática y T óptima), gráfico de Levenspiel, calor generado y removido, exportación CSV y escenarios compartibles por enlace.
- **Compatibilidad**: importa directamente un `sim_params.json` de la tesis.

## Pantallas

| Ruta | Qué hace |
|---|---|
| `/simulador` | Gemelo digital: parámetros, esquema animado, gráficos (concentraciones, conversión, temperatura, calor, X–T, Levenspiel), CSV y enlace compartible |
| `/calibrar` | Ajuste de k, E, ΔH y UA a datos medidos (Levenberg–Marquardt) con intervalos de confianza; corridas de la planta virtual o CSV propio |
| `/riesgo` | Mapa de operación segura: una red sustituta predice T_max y la frontera de runaway; verificación contra el motor |
| `/en-vivo` | Pronóstico de una corrida en curso: red neuronal contra física + datos (Monte Carlo), con alarma de runaway |

Las tres herramientas de datos se apoyan en una **planta virtual** (`ml/`): un reactor simulado con parámetros ocultos, ruido, retardo del termómetro y efectos que el modelo no incluye (ΔCp, desactivación, pérdidas al ambiente). Los modelos de ML se entrenan offline en Python y se exportan como JSON (`public/models/`); el navegador los evalúa en TypeScript (`src/engine/mlp.ts`).

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

### Capa de ML (Python, offline)

Solo hace falta para regenerar datos o reentrenar modelos; la app publicada no usa Python.

```bash
cd ml
python -m venv .venv
.venv/Scripts/python -m pip install numpy scipy pandas scikit-learn pytest
.venv/Scripts/python -m pytest                       # paridad con el motor TypeScript y planta virtual
cd ..
ml/.venv/Scripts/python -B ml/scripts/make_fit_fixtures.py      # corridas de la planta para Calibrar
ml/.venv/Scripts/python -B ml/scripts/train_risk_surrogate.py   # modelo de /riesgo
ml/.venv/Scripts/python -B ml/scripts/train_forecaster.py       # modelos de /en-vivo
```

Después de reentrenar, `npx vitest run` verifica que la red en TypeScript dé lo mismo que en NumPy.

## Estructura

```
src/engine/       motor puro (sin React): modelo, integradores, análisis, ajuste, redes, pronóstico, presets
src/workers/      Web Worker que expone el motor con Comlink
src/components/   simulador, calibración, mapa de riesgo, modo en vivo, gráficos, esquema del reactor
src/app/          portada (/), /simulador, /calibrar, /riesgo, /en-vivo
public/models/    redes entrenadas (JSON) · public/data/ corridas de la planta virtual
ml/               motor Python espejo, planta virtual y scripts de entrenamiento
tests/engine/     pruebas del motor (analíticas, contra la v1, paridad con Python, ML)
tools/            generador de casos de referencia desde la v1
docs/             contexto para la presentación del proyecto
```

## Próximamente

- Modelo híbrido física + ML: una red que aprenda lo que el balance no explica, entrenada con datos medidos.
- Asistente con IA que explique los resultados y permita configurar casos en lenguaje natural.
- Múltiples reacciones simultáneas.
