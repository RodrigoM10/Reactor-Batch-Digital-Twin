# Marco teórico: reactor TAD (batch)

Este documento es la referencia teórica de Reactor Batch 2.0. Ordena el Capítulo 2 de la tesis *Modelado y Simulación de un Reactor Batch en Python* (R. Mendoza, 2025), que sigue la nomenclatura de Fogler (2016).

- Las ecuaciones conservan su número de la tesis: **(Ec. N)**.
- Cada sección indica dónde vive la ecuación en el motor 2.0 (`src/engine/`).
- Las correcciones al texto de la tesis van en bloques **Nota 2.0**. Las erratas de redacción se corrigieron directamente.
- El texto original, tal como salió del Word, está en [`teoria-tesis-v1.md`](teoria-tesis-v1.md).
- Las diferencias de modelo F1–F10 son las de la tabla del [README](../README.md#diferencias-de-modelo-con-la-v1).

---

## 1. Nomenclatura

Unidades base del motor, iguales a la tesis: concentración en mol/L, energía en cal y temperatura en K. El tiempo usa la unidad que elige el usuario (s, min o h), y k, UA y el caudal deben ser coherentes con ella.

| Símbolo | Significado | Unidades | Código 2.0 |
|---|---|---|---|
| $X$ | Conversión de la especie clave A | — | `X` |
| $N_j,\ N_{j0}$ | Moles de la especie j (actual, inicial) | mol | — |
| $C_j,\ C_{j0}$ | Concentración de j (actual, inicial) | mol/L | `concentration()`, `Species.C0` |
| $C_{A0}$ | Concentración inicial de la especie clave | mol/L | `CompiledModel.CA0` |
| $\nu_j$ | Coeficiente estequiométrico (reactivos < 0, productos > 0, inertes 0) | — | `Species.nu` |
| $a, b, c, d$ | Coeficientes de $aA + bB \rightleftharpoons cC + dD$ | — | $\lvert\nu_j\rvert$ |
| $\Theta_j$ | Relación molar inicial $N_{j0}/N_{A0} = C_{j0}/C_{A0}$ | — | — |
| $-r_A$ | Velocidad de desaparición de A | mol/(L·tiempo) | `rateAt()` |
| $\alpha_j,\ \beta_j$ | Órdenes directos e inversos (en la tesis, $n, m$ y $p, q$) | — | `order`, `reverseOrder` |
| $k$ | Constante de velocidad (directa) | según el orden | `rateConstant()` |
| $A,\ E$ | Factor preexponencial y energía de activación | —, cal/mol | `kinetics.A`, `kinetics.E` |
| $R$ | Constante de los gases | 1.987 cal/(mol·K) | `R` |
| $K_c$ | Constante de equilibrio en concentraciones | (mol/L)^Δν | `equilibriumConstant()` |
| $X_{eq}$ | Conversión de equilibrio | — | `equilibriumConversion()` |
| $\Delta H_{rx}$ | Calor de reacción por mol de A | cal/mol | `deltaH` |
| $\Delta G_f^0$ | Energía libre de formación | cal/mol | `Species.DGf` |
| $C_{p,j}$ | Capacidad calorífica molar de j | cal/(mol·K) | `Species.Cp` |
| $T,\ T_0$ | Temperatura (actual, inicial) | K | `T`, `energy.T0` |
| $V$ | Volumen de mezcla | L | `energy.V` |
| $\dot m,\ C_{p,c}$ | Caudal másico y Cp del refrigerante | kg/tiempo, cal/(kg·K) | `m_c`, `Cp_c` |
| $T_{a1},\ T_{a2}$ | Temperatura del refrigerante a la entrada y a la salida | K | `T_cool`, `T_cool_out` |
| $UA$ | Coeficiente global por área de intercambio | cal/(tiempo·K) | `energy.UA` |
| $\dot Q_{gb},\ \dot Q_{rb}$ | Calor generado y calor retirado | cal/tiempo | `series.Qg`, `series.Qr` |
| $P_k,\ PM_k$ | Producción deseada y masa molar del producto k | kg/h, g/mol | `P_kg_h`, `M_g_mol` |
| $t_{mcd}$ | Tiempo muerto (carga, descarga, limpieza) | tiempo | `volume.t_dead` |

## 2. Supuestos del modelo

Hipótesis de la tesis:

1. **Sistema cerrado:** no entra ni sale materia durante la reacción.
2. **Reacción única**, reversible o irreversible, sin reacciones paralelas ni consecutivas.
3. **Fase líquida homogénea**, sin formación de otras fases.
4. **Mezcla perfecta:** T y concentraciones uniformes en todo el volumen.
5. **Volumen constante:** cambios de densidad despreciables (Luyben, 2007).
6. **Sin trabajo de eje:** se desprecia la potencia del agitador.
7. **Capacidades caloríficas constantes** con la temperatura.

Hipótesis que el modelo usa pero la lista de la tesis no menciona:

8. **$\Delta H_{rx}$ constante** e igual a su valor a la temperatura de referencia, es decir $\Delta C_p \approx 0$ (Ec. 49).
9. **Capacidad calorífica de la mezcla constante:** $\sum N_j C_{p,j} \approx \sum N_{j0} C_{p,j}$ (Ec. 44).
10. **UA y área de intercambio constantes**, sin depender del nivel de líquido.
11. **Refrigerante en régimen cuasi-estacionario**, con propiedades constantes. La Ec. 40 lo requiere.
12. **Solución ideal:** el equilibrio se expresa con concentraciones, sin coeficientes de actividad.

> **Nota 2.0:** la 2.0 adopta los mismos supuestos. Mantiene $\Delta C_p \approx 0$ y el Cp de la mezcla igual al de la carga inicial (`mixtureHeatCapacity`, `model/thermo.ts`).

## 3. Balance de moles y conversión

Balance de la especie j en un sistema cerrado:

$$\frac{dN_j}{dt} = \int^{V} r_j\, dV \tag{1}$$

Con mezcla perfecta, $r_j$ es uniforme y sale de la integral:

$$\frac{dN_j}{dt} = r_j\, V \tag{2}$$

Se toma A como base de cálculo, normalmente el reactivo limitante:

$$aA + bB \rightleftharpoons cC + dD \tag{3}$$

$$A + \tfrac{b}{a}B \rightleftharpoons \tfrac{c}{a}C + \tfrac{d}{a}D \tag{4}$$

La conversión es el número de moles de A que reaccionaron por mol de A cargado:

$$X = \frac{N_{A0} - N_A(t)}{N_{A0}} \tag{5}$$

$$N_A(t) = N_{A0}\,(1 - X) \tag{6}$$

Balance de A, la derivada de la Ec. 6 y la ecuación de diseño del TAD:

$$\frac{dN_A}{dt} = r_A V \tag{7}$$

$$\frac{dN_A}{dt} = -N_{A0}\frac{dX}{dt} \tag{8}$$

$$\frac{dX}{dt} = \frac{-r_A\, V}{N_{A0}} \tag{9}$$

A volumen constante ($N_{A0} = C_{A0}V$):

$$\frac{dX}{dt} = \frac{-r_A}{C_{A0}} \tag{24}$$

**En el código:** `rhs` en `simulate.ts` calcula `dy[0] = r / CA0`. La especie clave se elige con `keySpecies` y no tiene por qué llamarse A.

## 4. Estequiometría y concentraciones

Moles de cada especie en función de X (Fogler, 2016):

$$N_j = N_{j0} + \nu_j\,\frac{N_{A0}}{-\nu_A}\,X \qquad (\nu_A = -a) \tag{14}$$

$$N_B = N_{B0} - \tfrac{b}{a}N_{A0}X \tag{15}$$

$$N_C = N_{C0} + \tfrac{c}{a}N_{A0}X \tag{16}$$

$$N_D = N_{D0} + \tfrac{d}{a}N_{A0}X \tag{17}$$

$$N_I = N_{I0} \tag{18}$$

A volumen constante, $C_j = N_j / V$ **(Ec. 19)**:

$$C_A = C_{A0}(1 - X) \tag{20}$$

$$C_B = C_{B0} - \tfrac{b}{a}C_{A0}X \tag{21}$$

$$C_C = C_{C0} + \tfrac{c}{a}C_{A0}X \tag{22}$$

$$C_D = C_{D0} + \tfrac{d}{a}C_{A0}X \tag{23}$$

**En el código:** la 2.0 generaliza estas ecuaciones con el avance de reacción $\xi = C_{A0}X/a$, de modo que $C_j = C_{j0} + \nu_j\,\xi$ vale para cualquier número de especies (`concentration()`, `model/kinetics.ts`). La conversión máxima estequiométrica `X_max` es la que agota primero a algún reactivo. Si B es limitante, $X_{max} < 1$ (`compileModel()`).

## 5. Ley de velocidad

Irreversible, ley de potencias empírica:

$$-r_A = k\,C_A^{n}\,C_B^{m} \tag{10}$$

Reversible, como diferencia entre la velocidad directa y la inversa:

$$-r_A = k_f\,C_A^{n}C_B^{m} - k_r\,C_C^{p}C_D^{q} \tag{11}$$

Escrita en función de la constante de equilibrio, con $K_c = k_f/k_r$ (Levenspiel, 1999):

$$-r_A = k\left(C_A^{n}C_B^{m} - \frac{C_C^{p}C_D^{q}}{K_c}\right) \tag{31}$$

> **Nota 2.0, consistencia termodinámica:** para que la Ec. 31 se anule exactamente en el equilibrio definido por la Ec. 30, los órdenes deben coincidir con la estequiometría: $n = a$, $m = b$, $p = c$, $q = d$. En general, la condición es $\beta_j - \alpha_j = \nu_j$. Si no se cumple, el equilibrio "cinético", donde $-r_A = 0$, no coincide con el $X_{eq}$ calculado con $K_c$. La 2.0 avisa en ese caso (`simulate.ts`, advertencia "Los órdenes de reacción no coinciden con la estequiometría").

### 5.1 Casos cinéticos de la tesis

| Ec. | Caso | Ley | Cómo se configura en la 2.0 |
|---|---|---|---|
| 53 | Primer orden global | $-r_A = k\,C_A$ | orden A = 1 |
| 54 | Segundo orden global, A + B | $-r_A = k\,C_A C_B$ | órdenes A = 1, B = 1 |
| 55 | Pseudo-primer orden (B en exceso) | $-r_A = k\,C_{B0}\,C_A = k'\,C_A$ | B con `constantInRate` (usa $C_{B0}$) |
| 56 | Segundo orden en A | $-r_A = k\,C_A^2$ | orden A = 2 |

### 5.2 Término inverso de la tesis (Ec. 57-59)

La tesis implementó la reacción reversible como:

$$-r_{inversa} = k_r\,C_C\,C_D \tag{57}$$

$$K_{eq} = \frac{k_f}{k_r} \tag{58}$$

$$-r_A = r_{directa} - k\,\frac{C_C\,C_D}{K_{eq}} \tag{59}$$

> **Nota 2.0 (F1/F2):**
> - La Ec. 59 fija el término inverso en $C_C C_D$. Si la reacción no tiene D (por ejemplo $A \rightleftharpoons C$), el término inverso vale 0 y la reacción se comporta como irreversible.
> - Tampoco respeta la condición de consistencia de la Ec. 31 cuando $c$ o $d$ son distintos de 1.
> - En el código v1, además, el signo de las concentraciones de producto quedó invertido, así que el término inverso *suma* velocidad.
> - La 2.0 usa la Ec. 31 generalizada, $-r_A = k\left(\prod C_j^{\alpha_j} - \prod C_j^{\beta_j}/K_c\right)$ (`rateAt()`, `model/kinetics.ts`).
>
> En la Ec. 58 la tesis escribe $k_d$ en lugar de $k_f$.
>
> La frase de la tesis "en fase líquida $K_{eq}$ es aproximadamente igual a $K_x$" no es correcta en general: $K_c = K_x\,C_{tot}^{\Delta\nu}$, y solo coinciden si $\Delta\nu = 0$. El modelo trabaja con $K_c$ en concentraciones.

## 6. Constante de velocidad: Arrhenius

$$k = A\,e^{-E/RT} \tag{12}$$

Forma equivalente, con k conocida a una temperatura de referencia:

$$k(T) = k(T_{ref})\,\exp\!\left[\frac{E}{R}\left(\frac{1}{T_{ref}} - \frac{1}{T}\right)\right] \tag{13}$$

En modo isotérmico, T es constante y k también. En modo no isotérmico, k se reevalúa en cada paso del integrador.

**En el código:** `rateConstant()` en `model/thermo.ts`, con `kinetics.mode = "arrhenius"` (Ec. 12) o `"direct"` (k fija, solo isotérmico).

> **Nota 2.0:**
> - La Ec. 13 es matemáticamente idéntica a la Ec. 12. En la v1 (`RateConstant.calculate_rate_constant`), $k(T_{ref})$ se calcula a partir de $A$ y después se aplica la Ec. 13, así que el resultado coincide con la Ec. 12. La 2.0 usa directamente la Ec. 12. Si el dato disponible es $k(T_{ref})$, se obtiene $A = k(T_{ref})\,e^{E/RT_{ref}}$.
> - La Tabla 1 de la tesis describe la Ec. 13 como "constante de equilibrio en función de la temperatura". Es la constante de **velocidad**.
> - La tesis alterna $E$ y $E_a$ para la energía de activación.

## 7. Equilibrio químico

Para una solución ideal, en concentraciones (Smith et al., 2005):

$$K_c = \frac{C_C^{c}\,C_D^{d}}{C_A^{a}\,C_B^{b}} \tag{30}$$

La conversión de equilibrio $X_{eq}$ es un límite que el reactor no puede superar, sin importar el tiempo de reacción.

### 7.1 Por energía libre de Gibbs

$$K_c(T) = \exp\!\left(\frac{-\Delta G^0_{rxn}}{RT}\right) \tag{32}$$

$$\Delta G^0_{rxn} = \sum_j \nu_j\,\Delta G^0_{f,j} \tag{33}$$

> **Nota 2.0:** la Ec. 32 da la constante termodinámica K, adimensional y en actividades. Coincide numéricamente con $K_c$ solo si el estado estándar es 1 mol/L y la solución es ideal. La 2.0 la usa con ese supuesto. Además, la Ec. 33 se aplica a una $\Delta G^0_f$ fija: no se corrige con la temperatura.

### 7.2 Por van't Hoff ($\Delta H$ constante)

$$\ln\frac{K_c(T)}{K_c(T_{ref})} = -\frac{\Delta H^0_{rxn}}{R}\left(\frac{1}{T} - \frac{1}{T_{ref}}\right) \tag{34}$$

$$K_c(T) = K_c(T_{ref})\,\exp\!\left[\frac{\Delta H^0_{rxn}}{R}\left(\frac{1}{T_{ref}} - \frac{1}{T}\right)\right] \tag{35}$$

> **Nota 2.0:** en la Ec. 35, $\Delta H^0_{rxn}$ es por **reacción tal como está escrita** en la Ec. 30, es decir, por $a$ moles de A. El modelo guarda $\Delta H$ por mol de A. Ambos coinciden si $a = 1$. Si $a \ne 1$, lo correcto es usar $a\,\Delta H_{rx}$ en la Ec. 35. Hoy la v1 y la 2.0 usan $\Delta H$ por mol de A (pendiente de revisar, ver §11).

**En el código:** `equilibriumConstant()` en `model/thermo.ts`, con `method = "direct" | "vant_hoff" | "gibbs"`.

### 7.3 Conversión de equilibrio

$X_{eq}$ es la raíz de:

$$K_c(T) = \prod_j C_j(X_{eq})^{\nu_j} \tag{36}$$

El producto recorre todas las especies, con $\nu_j$ con signo, así que los reactivos quedan en el denominador. Las concentraciones salen de las Ec. 20-23.

**En el código:** `equilibriumConversion()` en `model/kinetics.ts` resuelve $\ln Q(X) - \ln K_c = 0$ con Brent en $(0, X_{max})$. En modo isotérmico, si la conversión objetivo supera $X_{eq}$, la simulación devuelve `unreachable` (equivale al *warning* de equilibrio de la v1).

## 8. Balance de energía

Balance general en un sistema cerrado (Fogler, 2016):

$$\frac{dT}{dt} = \frac{\dot Q - \dot W_s + (-\Delta H_{rx})(-r_A V)}{\sum_j N_j C_{p,j}} \tag{37}$$

Sin trabajo de eje, y escribiendo el intercambio como calor **retirado**:

$$\frac{dT}{dt} = \frac{\dot Q_{gb} - \dot Q_{rb}}{\sum_j N_j C_{p,j}} \tag{38}$$

$$\dot Q_{gb} = (-\Delta H_{rx})(-r_A V) \tag{39}$$

### 8.1 Moles y capacidad calorífica en función de X

$$N_j = N_{A0}\left(\Theta_j + \frac{\nu_j}{a}X\right) \tag{41}$$

$$\frac{dT}{dt} = \frac{\dot Q_{gb} - \dot Q_{rb}}{N_{A0}\left(\sum_j \Theta_j C_{p,j} + \Delta C_p\,X\right)},\qquad \Delta C_p = \sum_j \frac{\nu_j}{a}C_{p,j} \tag{42}$$

$$C_{p,total} = \sum_j N_j C_{p,j} \;\approx\; \sum_j N_{j0} C_{p,j} \tag{43, 44}$$

> **Nota 2.0:** en las Ec. 41, 42 y 45 de la tesis faltaba dividir $\nu_j$ por $a$. Fogler usa coeficientes ya normalizados por A, que es lo mismo solo si $a = 1$. La Ec. 42 de la tesis, además, ponía $\Delta C_p$ dentro de la sumatoria sobre j.

### 8.2 Calor de reacción

$$\Delta H_{rx}(T) = \Delta H^0_{rx}(T_R) + \Delta C_p\,(T - T_R) \tag{45}$$

En este trabajo se desprecia $\Delta C_p$:

$$\Delta H_{rx}(T) \approx \Delta H^0_{rx}(T_R) \tag{49}$$

### 8.3 Forma usada en el simulador

Con $\Delta H_{rx}$ y $C_{p,total}$ constantes:

$$\frac{dT}{dt} = \frac{\dot Q_{gb} - \dot Q_{rb}}{C_{p,total}} \tag{50}$$

**En el código** (`rhs` en `simulate.ts`), dividiendo por V:

$$\frac{dT}{dt} = \frac{(-\Delta H)(-r_A)\,V - \dot Q_{rb}}{V\sum_j C_{j0}C_{p,j}}$$

> **Nota 2.0 (F3):** la v1 dejaba V implícito en 1 L dentro de este balance. En la 2.0, V es un parámetro explícito, y con V = 1 L se reproduce la v1.

### 8.4 Operación adiabática

$$\dot Q_{rb} = 0 \tag{46}$$

$$\frac{dT}{dt} = \frac{(-\Delta H_{rx})(-r_A V)}{\sum_j N_j C_{p,j}} \tag{47}$$

Si se combina con la Ec. 9 y se elimina el tiempo, sale la recta adiabática:

$$T = T_0 + \frac{[-\Delta H_{rx}(T_0)]\,X}{\sum_j \Theta_j C_{p,j} + X\,\Delta C_p} \tag{48}$$

Con $\Delta C_p = 0$:

$$T = T_0 + \frac{(-\Delta H_{rx})\,X}{\sum_j \Theta_j C_{p,j}} = T_0 + \frac{(-\Delta H_{rx})\,C_{A0}\,X}{\sum_j C_{j0}C_{p,j}} \tag{52}$$

> **Nota 2.0:** la tesis escribe la Ec. 52 con $C_{p,total}$ en el denominador, pero $C_{p,total} = \sum N_j C_{p,j}$ es extensivo (cal/K) y el numerador $(-\Delta H)X$ va por mol de A. Para que las unidades cierren, el denominador debe ser $\sum \Theta_j C_{p,j}$, o el numerador debe llevar $N_{A0}$.
>
> La 2.0 no usa la recta para simular: integra $[X, T]$ con $\dot Q_{rb} = 0$, lo que es matemáticamente equivalente. La recta se usa en el diagrama X–T (`xtDiagram()`, `analysis.ts`) y para $\Delta T_{ad} = (-\Delta H)C_{A0}X_{max}/\sum C_{j0}C_{p,j}$ (`summary.deltaT_ad`).

### 8.5 Operación con intercambiador de calor (ICQ)

Calor retirado por un fluido de servicio que entra a $T_{a1}$, con el intercambiador en régimen cuasi-estacionario:

$$\dot Q_{rb} = \dot m\,C_{p,c}\,(T - T_{a1})\left[1 - \exp\!\left(\frac{-UA}{\dot m\,C_{p,c}}\right)\right] \tag{40}$$

Temperatura de salida del refrigerante:

$$T_{a2} = T - (T - T_{a1})\exp\!\left(\frac{-UA}{\dot m\,C_{p,c}}\right)$$

> **Nota 2.0:** la tesis define la temperatura de la Ec. 40 como la de **salida** ($T_{a2}$). La fórmula solo es válida con la de **entrada** ($T_{a1}$), que es la que se conoce (Fogler, 2016). Además, con la Ec. 38, $\dot Q_{rb} > 0$ significa calor **retirado** (refrigeración) y $\dot Q_{rb} < 0$ significa calor suministrado. La tesis lo describe al revés.
>
> La 2.0 usa la temperatura de entrada (`T_cool`) y reporta la de salida como `T_cool_out`.
>
> **(F4):** en modo ICQ, la v1 devolvía $[0, 0]$ al llegar al equilibrio y congelaba también T. En la 2.0, el equilibrio surge de la cinética y T sigue evolucionando.

**Camisa a temperatura constante** (modo `jacket`, propio de la 2.0): $\dot Q_{rb} = UA\,(T - T_{a1})$. Es el límite de la Ec. 40 cuando $\dot m \to \infty$.

**En el código:** `heatRemoved()` en `simulate.ts`. El aviso de posible descontrol térmico (`runaway`) aparece cuando $T_{max} - \max(T_0, T_{a1}) > 0.5\,\Delta T_{ad}$.

## 9. Producción y volumen del reactor

$$P_k = \frac{\text{masa de } k \text{ formada}}{\text{tiempo de operación}} \tag{25}$$

$$t_{op} = (t_{reacción} + t_{mcd})\,N_{ciclos} \tag{26}$$

$$m_k = C_k\,V\,PM_k \tag{27}$$

$$P_k = \frac{C_k\,V\,PM_k}{t_{reacción} + t_{mcd}} \tag{28}$$

$$V = \frac{P_k\,(t_{reacción} + t_{mcd})}{C_k\,PM_k} \tag{29}$$

> **Nota 2.0:** la Ec. 28 es por ciclo. Con $N_{ciclos}$ ciclos, la masa también se multiplica por $N_{ciclos}$ y el factor se cancela, por eso desaparece en las Ec. 28-29.
>
> **(F7):** la v1 mezclaba la producción en kg/min con tiempos en s. La 2.0 toma $P_k$ en kg/h y la convierte a la unidad de tiempo elegida. Con $PM_k$ en g/mol y $C_k$ en mol/L, V sale en L. $t_{reacción}$ es el tiempo final de la simulación.

**En el código:** bloque `volume` en `simulate.ts` (`summary.volume`).

## 10. Sistema resuelto

| Modo | Estado integrado | Ecuaciones |
|---|---|---|
| Isotérmico | $X$ | Ec. 24, con k y $K_c$ evaluados a $T_0$ |
| Adiabático | $X,\ T$ | Ec. 24 + Ec. 50 con $\dot Q_{rb} = 0$ |
| ICQ | $X,\ T$ | Ec. 24 + Ec. 50 con la Ec. 40 |
| Camisa (2.0) | $X,\ T$ | Ec. 24 + Ec. 50 con $UA(T - T_{a1})$ |

**Solver de la 2.0** (`solvers/ode.ts`):

- Dormand–Prince 5(4) con `rtol = 1e-8`. Si detecta rigidez o llega al límite de pasos, pasa a Rosenbrock 2(3).
- Criterios de corte: tiempo fijo, conversión objetivo (evento terminal) o reacción completa.

> **(F5 y F10):** la v1 integraba el caso adiabático hasta t = 50 000 con `max_step = 1`, y usaba `rtol = 1e-3`.

## 11. Correspondencia ecuación ↔ código

| Ec. tesis | Contenido | 2.0 | Estado |
|---|---|---|---|
| 9, 24 | Diseño del TAD, $dX/dt$ | `rhs` en `simulate.ts` | Igual |
| 14-23 | Estequiometría y concentraciones | `concentration()`, `compileModel()` en `model/kinetics.ts` | Generalizada (avance $\xi$, `X_max`) |
| 10, 53-56 | Leyes de velocidad | `rateAt()` en `model/kinetics.ts` | Igual (ley de potencias general) |
| 31 | Reversible con $K_c$ | `rateAt()` | Igual, generalizada |
| 57-59 | Término inverso v1 | — | **Corregida** por Ec. 31 (F1/F2) |
| 12 | Arrhenius | `rateConstant()` en `model/thermo.ts` | Igual |
| 13 | Arrhenius con $T_{ref}$ | `rateConstant()` (vía Ec. 12) | Equivalente a la Ec. 12 |
| 30, 36 | $K_c$ y $X_{eq}$ | `equilibriumConversion()` en `model/kinetics.ts` | Igual |
| 32-33 | Gibbs | `equilibriumConstant()` en `model/thermo.ts` | Igual |
| 35 | van't Hoff | `equilibriumConstant()` | Igual. **Pendiente:** $\Delta H$ por mol de A vs. por reacción si $a \ne 1$ |
| 39, 50 | Balance de energía | `rhs` en `simulate.ts` | V explícito (F3) |
| 40 | Intercambiador ICQ | `heatRemoved()` en `simulate.ts` | Corregida en el texto: $T_{a1}$ de entrada, signo |
| 44, 49 | $C_p$ de la mezcla y $\Delta H$ constantes | `mixtureHeatCapacity()` en `model/thermo.ts` | Igual |
| 48, 52 | Recta adiabática | `xtDiagram()` en `analysis.ts`, `deltaT_ad` | Corregida en el texto (unidades) |
| 29 | Volumen del reactor | bloque `volume` en `simulate.ts` | Unidades explícitas (F7) |

## Referencias

- Fogler, H. S. (2016). *Elements of Chemical Reaction Engineering* (5.ª ed.). Prentice Hall.
- Levenspiel, O. (1999). *Chemical Reaction Engineering* (3.ª ed.). Wiley.
- Luyben, W. L. (2007). *Chemical Reactor Design and Control*. Wiley.
- Smith, J. M., Van Ness, H. C., Abbott, M. M. (2005). *Introduction to Chemical Engineering Thermodynamics* (7.ª ed.). McGraw-Hill.
