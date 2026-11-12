# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Reactor Batch 2.0: a client-side batch-reactor digital twin (Next.js 16 + React 19 + Tailwind 4, Vercel). It reimplements the thesis engine (`../Batch-Reactor-Simulate`, Python/SciPy, frozen; do not modify it) in TypeScript, fixing model issues F1–F10 by design. The user is the thesis author. UI text, comments and messages are in Spanish; keep the thesis naming (`C_A0`, `X`, `deltaH`, `T_cool`, `m_c`, …).

## Commands

```bash
npm run dev | build | lint
npx vitest run                                   # all tests
npx vitest run tests/engine/analytical.test.ts   # one file
npx vitest run -t "Levenspiel"                   # by name
../Batch-Reactor-Simulate/.venv/Scripts/python -B tools/generate_v1_fixtures.py ../Batch-Reactor-Simulate
```

Always use `python -B` for the fixture generator: the v1 repo tracks `__pycache__/*.pyc`, so a plain run dirties it.

## Architecture

- `src/engine/` is a pure TypeScript module with no React or DOM. `simulate(params)` validates the parameters, compiles the model (`model/kinetics.ts`), integrates the state `y = [X, T]` and samples the dense output into `SimSeries` plus a `SimSummary`. It returns `{ok:false, code, error}` for invalid or unreachable cases and never throws for user input.
  - Stoichiometry works by extent: `C_i = C_i0 + ν_i·C_key0·X/|ν_key|`. The rate is a power law, `−r_key = k·(Π C^order − Π C^reverseOrder / K_c)`. `constantInRate` uses C0, which is the thesis "excess B" case.
  - Energy: `dT/dt = ((−ΔH)·r·V − Q_r)/(V·Σ C_i0·Cp_i)`. `icq` is the thesis exchanger formula and `jacket` is `UA·(T − T_cool)`.
  - Solvers (`solvers/ode.ts`): Dormand–Prince 5(4) with native 4th-order dense output, events and Hairer stiffness detection. It falls back to Rosenbrock 2(3) (ode23s) when it detects stiffness or hits the step limit.
  - Stop modes: `time`, `conversion` (terminal event) and `complete` (an `onStep` check: X ≥ 0.999·X_lim, or the rate stalls).
  - `analysis.ts` builds the X–T diagram (equilibrium, adiabatic line, optimal-T locus) and the Levenspiel data. `v1-compat.ts` maps the thesis `SimParams` payload to `ReactorParams`.
- `src/workers/engine.worker.ts` exposes `run(params)` through Comlink. `src/lib/use-engine.ts` keeps only the latest pending request, so live sliders don't queue stale runs.
- State lives in Zustand (`src/lib/store.ts`). Each `update(fn)` mutates a `structuredClone` draft and marks the preset as custom.
- Theme: CSS tokens in `globals.css` (light by default, dark via `prefers-color-scheme` or `data-theme`), mapped to Tailwind colors (`bg-surface`, `text-muted`, `text-accent`, …). Charts and SVG use `var(--…)` directly.

## Tests

- `tests/engine/analytical.test.ts` and `solvers.test.ts` check against closed-form solutions at about 1e-7.
- `tests/engine/v1-reference.test.ts` runs every fixture on the v1 time grid. `match` cases must agree within 2e-3 in X. `divergent` cases must still differ, and each has its documented reason, so if one starts matching, investigate.
- Any change to the model must keep both suites green. If it changes a documented divergence, update the fixture reason, the README table and the landing page `DIFFS` table.
