# Reactor Batch 2.0 · Contexto para generar la presentación

> **Última actualización:** 2026-11-12 · Fases 1 a 4 de la capa de ML terminadas.
> Este archivo se mantiene al día con cada funcionalidad nueva (ver la sección *Registro de actualizaciones* al final).

---

## 0. Instrucciones para Claude

Usá este archivo como **única fuente de información** para armar una presentación de diapositivas sobre el proyecto *Reactor Batch 2.0*.

- **Objetivo:** una publicación en LinkedIn (carrusel de diapositivas con imágenes) que cuente qué es el proyecto, qué hace cada funcionalidad y por qué es interesante.
- **Público:** ingenieros químicos, estudiantes y gente de software/datos. Tiene que entenderlo alguien que no vio la tesis.
- **Idioma y tono:** español rioplatense (voseo: "mové", "probá"). Divulgativo pero riguroso, con frases cortas y sin exagerar.
- **Datos:** usá solo las cifras de este archivo. No inventes métricas, usuarios ni resultados. Si falta un dato, dejá un marcador `[completar]`.
- **Largo sugerido:** 8 a 12 diapositivas. Hay un guion propuesto en la sección 8, que podés ajustar.
- **Imágenes:** cada funcionalidad trae una *captura sugerida*. Indicá en cada diapositiva qué captura va, para que el autor la saque de la app.
- **Autor:** Rodrigo Mendoza, ingeniero químico. El proyecto parte de su trabajo final de carrera.

---

## 1. El proyecto en una frase

**Un gemelo digital de un reactor batch que corre en el navegador:** simula balances de materia y energía en milisegundos, se calibra con datos medidos, anticipa descontroles térmicos (runaway) con machine learning y se valida contra la física.

### La historia

| | Tesis (v1, 2025) | Reactor Batch 2.0 |
|---|---|---|
| Qué es | Trabajo final «Modelado y Simulación de un Reactor Batch en Python» | Reversión del simulador como gemelo digital, más una capa de ML |
| Motor | Python (NumPy/SciPy) con FastAPI, en un servidor (Render) | TypeScript que corre **en el navegador** (Web Worker), sin servidor |
| Interfaz | Next.js: se carga un formulario y se espera la respuesta | Next.js 16: los resultados se recalculan **al instante** al mover cualquier parámetro |
| Alcance | Una reacción del tipo aA + bB ⇌ cC + dD | N especies, órdenes arbitrarios, inertes, varios modos térmicos |
| Datos | No usa | Calibración con datos, mapa de riesgo y pronóstico en vivo con ML |

La versión de la tesis se conserva sin cambios como trabajo académico:
- App v1: https://batch-reactor-front.vercel.app/
- Código v1: https://github.com/RodrigoM10/Batch-Reactor-Front y https://github.com/RodrigoM10/Batch-Reactor-Simulate
- App 2.0: `[URL pendiente: todavía no está publicada]`

---

## 2. Arquitectura en criollo

```
 Navegador
 ┌───────────────────────────────────────────────────────────────┐
 │  Interfaz (Next.js + React)                                   │
 │   Simular · Calibrar · Riesgo · En vivo                       │
 │        │  parámetros                    ▲ resultados          │
 │        ▼                                │                     │
 │  Web Worker ── Motor TypeScript puro ───┘                     │
 │     • balances de materia y energía (estado X, T)             │
 │     • integradores propios: Dormand–Prince 5(4) y Rosenbrock  │
 │     • ajuste Levenberg–Marquardt · redes neuronales chicas    │
 └───────────────────────────────────────────────────────────────┘
                 ▲ modelos entrenados (archivos JSON)
 ┌───────────────┴───────────────────────────────────────────────┐
 │  Python offline (ml/)                                         │
 │   motor espejo (idéntico al de TS) → planta virtual con       │
 │   efectos ocultos y ruido → miles de corridas → entrenamiento │
 └───────────────────────────────────────────────────────────────┘
```

- **Sin servidor:** toda la simulación pasa en la computadora del usuario. No hay que esperar a que "despierte" un backend.
- **Motor propio:** el integrador Dormand–Prince detecta cuándo el problema se vuelve rígido (por ejemplo, durante un runaway) y cambia solo a Rosenbrock.
- **Planta virtual:** como todavía no hay datos de laboratorio, Python simula un "reactor real". Tiene parámetros ocultos, ruido de termómetro y efectos que el modelo no incluye: variación de ΔH con T (ΔCp), desactivación del catalizador y pérdidas de calor al ambiente. Con esos datos se entrenan y prueban las herramientas de ML.
- **ML liviano:** las redes son chicas, se entrenan en Python y se exportan como JSON. En el navegador se evalúan en microsegundos, sin librerías pesadas.

---

## 3. Funcionalidades por pantalla

### 3.1 Portada (`/`)
- **Qué muestra:** un reactor animado cuya reacción (exotérmica adiabática) se calcula en vivo con el motor 2.0, las funcionalidades nuevas y una tabla "De la tesis a la 2.0" con las correcciones del modelo.
- **Captura sugerida:** la portada completa en modo claro, con el reactor animado a la derecha.

### 3.2 Simulador (`/simulador`): el gemelo digital
**Qué resuelve:** simular cualquier reactor batch de una reacción y ver al instante cómo responde a cada cambio.

**Cómo se usa:**
1. Elegí un **caso de ejemplo** arriba o armá uno propio:
   - *Tesis · Acetato de etilo:* A + B ⇌ C + D, isotérmico a 373 K, K_eq = 2.93, con dimensionamiento del reactor.
   - *Exotérmica adiabática:* A → B de primer orden con inerte. La temperatura sube sobre la recta adiabática.
   - *Camisa ICQ · al borde del runaway:* A + B → C de segundo orden enfriada con intercambiador. Si bajás el caudal de refrigerante a menos de 1 kg/min, aparece el descontrol.
   - *Reversible exotérmica (van't Hoff):* A ⇌ B adiabática. El equilibrio cae al subir T.
2. Ajustá los parámetros en el **panel lateral**:
   - **Reacción:** N especies con coeficientes, órdenes directo e inverso, reversible o no y especie clave (la que define la conversión X).
   - **Cinética:** k directa o Arrhenius (A, E).
   - **Equilibrio:** K directa, van't Hoff (K de referencia a T de referencia) o Gibbs (ΔG°f de cada especie).
   - **Operación térmica:** isotérmico, adiabático, **ICQ** (intercambiador de la tesis) o **camisa** (UA·(T − T_cool)), con volumen, temperatura y caudal del refrigerante.
   - **Tiempo y corte:** hasta completar, tiempo fijo o conversión objetivo.
   - **Dimensionamiento:** volumen del reactor a partir de la producción (kg/h), la masa molar y el tiempo muerto.
3. Los resultados **se recalculan solos** con cada cambio. El **esquema animado** del reactor y el botón de **reproducción** muestran el batch avanzando en el tiempo.
4. Analizá los resultados en las pestañas de gráficos:
   - **Concentraciones** y **Conversión** (con X de equilibrio).
   - **Temperatura:** del reactor, de entrada del refrigerante y de su salida.
   - **Calor:** generado contra removido.
   - **Diagrama X–T:** curva de equilibrio X_eq(T), curva de T óptima (máxima velocidad), recta adiabática y trayectoria del batch.
   - **Levenspiel:** el área bajo la curva entre 0 y X es el tiempo de reacción.
5. Revisá el resumen: tiempo de reacción, T máxima, X de equilibrio, volumen del reactor e integrador usado.
6. **Exportar CSV**, **Compartir escenario** (enlace con todos los parámetros) o **Importar JSON**, incluido el `sim_params.json` de la tesis.

**Capturas sugeridas:**
- Caso *Camisa ICQ* con el caudal de refrigerante bajo, en la pestaña Temperatura: se ve el pico de runaway.
- Caso *Reversible exotérmica* en la pestaña **Diagrama X–T**: equilibrio, T óptima y recta adiabática juntas.
- El panel de parámetros abierto junto al esquema animado del reactor.

### 3.3 Calibrar (`/calibrar`): ajustar el modelo a datos medidos
**Qué resuelve:** los parámetros de un reactor real (cinética, calor de reacción, coeficiente de transferencia) nunca se conocen exactos. Esta pantalla los estima a partir de mediciones.

**Cómo se usa:**
1. **Datos medidos:** cargá una corrida de la planta virtual o **subí tu propio CSV** con columnas `t`, `T` y/o `X`. Hay tres corridas de la planta:
   - *Planta ideal:* solo parámetros distintos y ruido. El modelo puede explicarla.
   - *Planta realista 1 y 2:* con ΔCp, desactivación y pérdidas al ambiente.
2. **Modelo y parámetros a ajustar:** marcá cuáles quedan libres (k, E, ΔH, UA) e indicá el ruido del termómetro (σ).
3. **Ajustar:** el método Levenberg–Marquardt busca los parámetros que mejor reproducen los datos.
4. **Resultado:**
   - Curva medida, modelo nominal y modelo ajustado superpuestos.
   - Tabla con cada parámetro *nominal*, *ajustado ± σ* y la **verdad oculta de la planta**, para comprobar que el ajuste la recupera.
   - Si el χ² es alto, la app avisa que hay efectos que el modelo no incluye. Ese es justamente el caso de uso del próximo modelo híbrido.
5. **Usar los parámetros ajustados en el simulador** con un clic.

**Validación:** el ajuste se comparó con `scipy.optimize.least_squares` sobre las mismas corridas.

**Captura sugerida:** *Planta ideal* ajustada, con el gráfico de medición contra modelo y la tabla donde la verdad oculta cae dentro de ± σ. Opcional: *Planta realista 1*, mostrando el aviso de χ² alto.

### 3.4 Riesgo (`/riesgo`): mapa de operación segura
**Qué resuelve:** saber de antemano qué condiciones de operación llevan a un runaway, sin correr miles de simulaciones a mano.

**Cómo funciona:** se simularon 24 000 corridas del caso *Camisa ICQ* variando T₀, T_cool, el caudal de refrigerante m_c y UA. Con ellas se entrenó una red neuronal (modelo sustituto) que predice la T máxima en microsegundos. Así se puede pintar un mapa completo al instante.

**Cómo se usa:**
1. Elegí qué variables van en el **eje horizontal** y en el **vertical** (T₀, T_cool, m_c o UA).
2. El **mapa de calor** muestra la T máxima esperada. Una línea marca la **frontera de runaway** (la T sube más del 50 % del ΔT adiabático).
3. Pasá el mouse para leer la T máxima en cada punto. Hacé **clic** para mover el punto de operación: se indica si queda *seguro* o en *runaway*.
4. **Verificar con el motor:** la app recalcula 144 puntos del mapa con el simulador real y muestra el error del sustituto en cada uno.
5. El punto de operación es el mismo que el del simulador: **Ver el punto actual en Simular** lo abre ahí con el motor completo. Si en el simulador hay otro caso cargado, la pantalla avisa que el sustituto solo vale para *Camisa ICQ* y ofrece **Cargar ese caso**.

**Métricas del sustituto (3 600 corridas de prueba no vistas):**
- Error medio de T máxima: **0.38 K**. Percentil 95: **1.07 K**.
- Acierto en la clasificación runaway / seguro: **99.4 %**.

**Captura sugerida:** el mapa con T₀ contra caudal de refrigerante, la frontera de runaway visible y el punto de operación marcado. Mejor después de "Verificar con el motor", así se ven los puntos verificados.

### 3.5 En vivo (`/en-vivo`): pronóstico de una corrida en curso
**Qué resuelve:** mientras el reactor está operando, anticipar a dónde va la temperatura y avisar **antes** de que ocurra un runaway.

**Cómo funciona:** una corrida de la planta virtual se reproduce como si los datos llegaran de un sensor, dato a dato. En cada instante, dos métodos compiten:

| Método | Idea | Salida |
|---|---|---|
| **Red neuronal (ML)** | Mira los últimos 3 min de temperatura medida y las condiciones de operación. Se entrenó con 2 550 corridas de la planta. | T futura a 0.5–12 min y probabilidad de runaway |
| **Física + datos** | Reajusta k y UA con lo medido hasta ese momento y simula hacia adelante 40 veces, sorteando los parámetros dentro de su incertidumbre (Monte Carlo). | Pronóstico con banda de 10–90 % y probabilidad de runaway |

**Cómo se usa:**
1. Elegí una corrida: **segura**, **al borde** o **con runaway**.
2. Dale **Reproducir** (se puede cambiar la velocidad, pausar o reiniciar).
3. Mirá los dos pronósticos actualizarse con cada dato nuevo, junto con el indicador de **P(runaway)** de cada método.
4. Activá **"Mostrar trayectoria real"** para comparar contra lo que de verdad pasó.
5. Al final se informa **cuántos minutos antes del pico avisó** cada método.

**Métricas de la red (corridas de prueba no vistas, antes del pico):**
- Error de temperatura: **±0.12 K** a 0.5 min, **±0.54 K** a 2 min, **±1.12 K** a 5 min y **±1.67 K** a 12 min.
- Más de 10 min antes del pico: detecta el **93 %** de los runaway, con **5 %** de falsas alarmas.
- Entre 0 y 10 min antes del pico: detecta el **99 %**, con 1–2 % de falsas alarmas.

**Capturas sugeridas:**
- La corrida **con runaway** a mitad de reproducción: puntos medidos, pronóstico ML punteado, banda de la física y alarma encendida antes del pico.
- La corrida **al borde**, donde los dos métodos dudan. Es buena para mostrar incertidumbre.

---

## 4. Lo que se corrigió del modelo de la tesis

Al reescribir el motor se revisó el de la tesis y se corrigieron, por diseño, estos puntos:

| Aspecto | Tesis (v1) | Versión 2.0 |
|---|---|---|
| Velocidad inversa | Usaba C_C·C_D con el signo estequiométrico cambiado. Para A ⇌ B valía cero. | −r = k·(Π Cᵢ^αᵢ − Π Cⱼ^βⱼ / K_c), coherente con K_eq |
| Equilibrio con intercambiador (ICQ) | Al llegar a X_eq se congelaban X y también T | El equilibrio surge de la cinética y el intercambiador sigue actuando |
| Volumen en el balance de energía | Implícito en 1 L | Volumen de mezcla V explícito |
| Corte de la integración | Adiabático hasta t = 50 000 con paso 1 (segundos de cálculo) | Eventos: conversión objetivo o reacción completa (milisegundos) |
| Unidades de tiempo | La producción en kg/min se mezclaba con tiempos en segundos | Unidad de tiempo explícita y producción en kg/h |
| Precisión numérica | Tolerancia por defecto de SciPy (rtol = 1e-3) | rtol = 1e-8, verificada contra soluciones analíticas |

**Ejemplo concreto:** en el caso de la tesis (acetato de etilo), la v1 da X = 0.48 a los 120 min y la 2.0 da **X = 0.35**. La diferencia viene del término inverso: en la v1 sumaba velocidad en lugar de restarla.

---

## 5. Cómo se valida

- **Contra la matemática:** el motor se prueba contra soluciones analíticas exactas, con un error de ~1e-7.
- **Contra la tesis:** los casos del motor Python original (ejecutado sin modificarlo) deben coincidir dentro de 2e-3 en conversión. Las diferencias intencionales están documentadas una por una.
- **TypeScript contra Python:** el motor espejo de Python coincide con el de TypeScript con un error menor a 1e-6. Así, lo que se entrena en Python vale en el navegador.
- **ML:** cada modelo se evalúa sobre corridas que no vio durante el entrenamiento, y las salidas de las redes en el navegador coinciden con las de Python.
- Actualmente: 46 pruebas automáticas en TypeScript y 14 en Python, todas en verde.

---

## 6. Tecnologías

- **Interfaz:** Next.js 16, React 19, Tailwind CSS 4, Recharts, Zustand.
- **Motor:** TypeScript puro en un Web Worker (Comlink).
- **ML y datos:** Python con NumPy, SciPy y scikit-learn. Los modelos se exportan a JSON.
- **Pruebas:** Vitest y pytest.

---

## 7. Próximamente

- **Modelo híbrido física + ML (fase 5):** una red aprende lo que el balance no explica (desactivación, pérdidas de calor) y se suma al modelo físico. Así se cierra la brecha que muestra el aviso de χ² alto en *Calibrar*.
- **Asistente con IA:** explica los resultados en lenguaje natural y permite configurar casos describiéndolos con palabras.
- **Múltiples reacciones simultáneas.**
- **Publicación** de la app 2.0 en la web.

---

## 8. Guion de diapositivas sugerido

1. **Portada.** "De la tesis a un gemelo digital: un reactor batch que corre en tu navegador." *Imagen:* portada con el reactor animado.
2. **El punto de partida.** La tesis en Python con servidor, la idea de llevarla a algo interactivo y el salto a la 2.0. *Imagen:* tabla v1 contra 2.0 (sección 1).
3. **Cómo está hecho.** Motor propio en el navegador, Python offline y redes chicas. *Imagen:* diagrama de la sección 2.
4. **Simulador.** Mové un parámetro y todo se recalcula al instante. *Imagen:* runaway en el caso ICQ.
5. **Análisis de ingeniería.** Diagrama X–T con equilibrio, T óptima y recta adiabática, más Levenspiel. *Imagen:* diagrama X–T del caso reversible exotérmico.
6. **Calibrar con datos.** El modelo recupera los parámetros ocultos de la planta, con su incertidumbre. *Imagen:* ajuste de la planta ideal.
7. **Mapa de riesgo.** Una red neuronal predice la T máxima de 24 000 escenarios y dibuja la frontera de runaway (99.4 % de acierto). *Imagen:* mapa de calor.
8. **En vivo.** Física contra ML pronosticando un runaway antes de que pase. *Imagen:* corrida con runaway y alarma.
9. **Rigor.** Lo que se corrigió de la tesis y cómo se valida todo. *Imagen:* tabla de correcciones o el ejemplo 0.48 → 0.35.
10. **Qué sigue.** Modelo híbrido, asistente con IA y link a la app y al código. *Imagen:* captura general con el header de las 4 secciones.

---

## 9. Registro de actualizaciones

| Fecha | Novedad |
|---|---|
| 2026-11-12 | Primera versión del archivo. Incluye el simulador 2.0 y las fases 1 a 4 de ML: motor espejo y planta virtual, *Calibrar*, *Riesgo* y *En vivo*. |
