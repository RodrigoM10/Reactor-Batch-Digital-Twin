# Pendientes

Última actualización: 2026-11-12.

## Para la próxima sesión

1. **Probar la app** (`npm run dev`), en especial lo último:
   - Unidad de tiempo en Cinética: cambiar s / min / h y ver que el reactor sea el mismo (A, k, UA, caudal y tiempos convertidos). Revisar también el mapa de riesgo con otra unidad.
   - F11: armar 2A ⇌ C con van't Hoff y ver que K_c(T) y X_eq(T) cambien. Con a = 1 tiene que dar lo mismo que antes.
2. **Pushear `feat/ml`.** Hay tres commits sin subir: `9abeb5d` (teoría), `a125342` (unidad de tiempo) y `faff725` (F11). Después, decidir si se lleva a `master` (producción en Vercel).
3. **Decidir sobre cargar k a una T de referencia.** Sería una opción en Cinética para ingresar `k_ref` y `T_ref` en vez de `A`; la app calcula `A = k_ref·e^(E/RT_ref)`. Es solo pantalla y no cambia el motor. Si no interesa, se descarta.

## Correcciones al texto de la teoría (Cap. 2 de la tesis)

Quedan para una versión corregida del texto (por ejemplo, un paper o una nueva edición). Cada una está explicada en una **Nota 2.0** de [`teoria.md`](teoria.md); el original está en [`teoria-tesis-v1.md`](teoria-tesis-v1.md).

- [ ] **Ec. 40 (intercambiador):** la fórmula solo vale con la temperatura de **entrada** del refrigerante (T_a1), pero el texto dice que es la de salida. Además, la descripción del signo está al revés: con la Ec. 38, Q_rb positivo es calor retirado. La 2.0 ya usa la entrada.
- [ ] **Ec. 57-59 (término inverso):** es el problema F1/F2 del README. En la Ec. 58 aparece `k_d`, que debería ser `k_f`.
- [ ] **Ec. 31:** falta decir que los órdenes deben coincidir con la estequiometría. Si no, la velocidad no se anula en el equilibrio que define la Ec. 30.
- [ ] **"En fase líquida K_eq ≈ K_x":** es incorrecto en general. El modelo usa K_c, en concentraciones.
- [ ] **Ec. 41, 42 y 45:** falta dividir ν por *a*.
- [ ] **Ec. 52:** las unidades no cierran. El denominador tiene que ser ΣΘᵢCpᵢ, no `Cp,total`.
- [ ] **Tabla 1:** describe la Ec. 13 como constante de equilibrio, pero es la de velocidad. Además, la Ec. 13 es idéntica a la Ec. 12.
- [ ] **Ec. 26:** N_ciclos aparece y después desaparece. La Ec. 28 es por ciclo.
- [ ] **Hipótesis que faltan:** ΔH constante, UA constante, refrigerante cuasi-estacionario y solución ideal.
- [ ] **Erratas:** párrafo isotérmico duplicado ("la temperatura se del sistema"), "por que", "biomolecular", "psudo", "Dónde", `C_c`, restos de Word (`K¬¬_eq`, `T¬_a2`, la "D" suelta).

## Más adelante

- **Modelo híbrido (fase 5 de ML):** se descartó de la v1.0. Para retomarlo hace falta un modelo del sensor, porque el retraso del termómetro (τ_T ≈ 0.22 min) domina el error en la planta realista. El hook `corrections` de `simulate.ts` ya está listo y no afecta nada si no se usa.
- **Tesis v1 (demo):**
  - Configurar el ping de cron-job.org a Render para mantener el backend despierto.
  - Confirmar `NEXT_PUBLIC_V2_URL` en el front v1.
  - Borrar la rama sobrante del bot de Vercel (`vercel/react-server-components-cve-…`).
