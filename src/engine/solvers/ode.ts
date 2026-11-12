import { brent } from "./brent";

/**
 * Integradores de EDO con paso adaptativo, salida densa (Hermite cúbica) y eventos.
 *  - Dormand–Prince 5(4) (equivalente a solve_ivp RK45) con detección de rigidez de Hairer.
 *  - Rosenbrock 2(3) (equivalente a ode23s de MATLAB) para problemas rígidos, con Jacobiano numérico.
 */

export type Rhs = (t: number, y: Float64Array, dy: Float64Array) => void;

export interface OdeEvent {
  g: (t: number, y: Float64Array) => number;
  direction: -1 | 0 | 1; // −1: cruza de + a −, 1: de − a +, 0: ambos
  terminal: boolean;
}

export interface OdeOptions {
  t0: number;
  tEnd: number;
  y0: number[];
  rtol: number;
  atol: number[];
  hMax?: number;
  maxSteps?: number;
  events?: OdeEvent[];
  /** Se llama después de cada paso aceptado; devolver true detiene la integración. */
  onStep?: (t: number, y: Float64Array, f: Float64Array) => boolean;
}

export type OdeStatus = "done" | "event" | "stopped" | "maxSteps" | "stiff" | "failed";

export interface OdeSolution {
  status: OdeStatus;
  ts: number[];
  ys: Float64Array[];
  fs: Float64Array[];
  eventIndex: number | null;
  nSteps: number;
  nEvals: number;
  /** Evalúa la solución densa en t (dentro de [t0, tFinal]). */
  at: (t: number, out?: Float64Array) => Float64Array;
}

function hermite(
  t0: number,
  t1: number,
  y0: Float64Array,
  y1: Float64Array,
  f0: Float64Array,
  f1: Float64Array,
  t: number,
  out: Float64Array,
  rc5: Float64Array | null = null,
) {
  // Forma de Hairer: y0 + θ(Δ + (1−θ)(c3 + θ(c4 + (1−θ)·rc5))). Con rc5 = 0 es la Hermite cúbica;
  // con el rc5 de Dormand–Prince es la salida densa de 4.º orden.
  const h = t1 - t0;
  const th = h === 0 ? 0 : (t - t0) / h;
  const th1 = 1 - th;
  for (let i = 0; i < out.length; i++) {
    const dy = y1[i] - y0[i];
    const c3 = h * f0[i] - dy;
    const c4 = dy - h * f1[i] - c3;
    const c5 = rc5 ? rc5[i] : 0;
    out[i] = y0[i] + th * (dy + th1 * (c3 + th * (c4 + th1 * c5)));
  }
  return out;
}

class Recorder {
  ts: number[] = [];
  ys: Float64Array[] = [];
  fs: Float64Array[] = [];
  rc: (Float64Array | null)[] = []; // coeficiente denso del paso que termina en cada punto
  prevG: number[] = [];

  constructor(
    private n: number,
    private rhs: Rhs,
    private events: OdeEvent[],
  ) {}

  push(t: number, y: Float64Array, f: Float64Array, rc5: Float64Array | null = null) {
    this.ts.push(t);
    this.ys.push(Float64Array.from(y));
    this.fs.push(Float64Array.from(f));
    this.rc.push(rc5 ? Float64Array.from(rc5) : null);
  }

  initEvents(t: number, y: Float64Array) {
    this.prevG = this.events.map((e) => e.g(t, y));
  }

  /** Revisa eventos en el último paso; si hay uno terminal, recorta la solución allí. */
  checkEvents(): number | null {
    const k = this.ts.length - 1;
    const t0 = this.ts[k - 1];
    const t1 = this.ts[k];
    const y0 = this.ys[k - 1];
    const y1 = this.ys[k];
    const f0 = this.fs[k - 1];
    const f1 = this.fs[k];
    const rc5 = this.rc[k];
    const tmp = new Float64Array(this.n);
    let first: { idx: number; t: number } | null = null;

    for (let i = 0; i < this.events.length; i++) {
      const ev = this.events[i];
      const g0 = this.prevG[i];
      const g1 = ev.g(t1, y1);
      this.prevG[i] = g1;
      const crosses =
        (g0 > 0 && g1 <= 0 && ev.direction !== 1) || (g0 < 0 && g1 >= 0 && ev.direction !== -1);
      if (!crosses || !ev.terminal) continue;
      const tStar =
        g1 === 0 ? t1 : brent((t) => ev.g(t, hermite(t0, t1, y0, y1, f0, f1, t, tmp, rc5)), t0, t1, 1e-14 * Math.max(1, Math.abs(t1)));
      if (!first || tStar < first.t) first = { idx: i, t: tStar };
    }

    if (!first) return null;
    const yStar = hermite(t0, t1, y0, y1, f0, f1, first.t, new Float64Array(this.n), rc5);
    const fStar = new Float64Array(this.n);
    this.rhs(first.t, yStar, fStar);
    this.ts[k] = first.t;
    this.ys[k] = yStar;
    this.fs[k] = fStar;
    this.rc[k] = null; // el paso recortado se interpola con Hermite cúbica
    return first.idx;
  }

  solution(status: OdeStatus, eventIndex: number | null, nSteps: number, nEvals: number): OdeSolution {
    const { ts, ys, fs, rc, n } = this;
    return {
      status,
      ts,
      ys,
      fs,
      eventIndex,
      nSteps,
      nEvals,
      at: (t, out = new Float64Array(n)) => {
        if (t <= ts[0]) return out.set(ys[0]), out;
        const last = ts.length - 1;
        if (t >= ts[last]) return out.set(ys[last]), out;
        let lo = 0;
        let hi = last;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (ts[mid] <= t) lo = mid;
          else hi = mid;
        }
        return hermite(ts[lo], ts[hi], ys[lo], ys[hi], fs[lo], fs[hi], t, out, rc[hi]);
      },
    };
  }
}

function errNorm(err: Float64Array, y0: Float64Array, y1: Float64Array, rtol: number, atol: number[]) {
  let s = 0;
  for (let i = 0; i < err.length; i++) {
    const sc = atol[i] + rtol * Math.max(Math.abs(y0[i]), Math.abs(y1[i]));
    const r = err[i] / sc;
    s += r * r;
  }
  return Math.sqrt(s / err.length);
}

function initialStep(rhs: Rhs, t0: number, y0: Float64Array, f0: Float64Array, o: OdeOptions, order: number) {
  const n = y0.length;
  let d0 = 0;
  let d1 = 0;
  for (let i = 0; i < n; i++) {
    const sc = o.atol[i] + o.rtol * Math.abs(y0[i]);
    d0 += (y0[i] / sc) ** 2;
    d1 += (f0[i] / sc) ** 2;
  }
  d0 = Math.sqrt(d0 / n);
  d1 = Math.sqrt(d1 / n);
  let h0 = d0 < 1e-5 || d1 < 1e-5 ? 1e-6 : (0.01 * d0) / d1;
  h0 = Math.min(h0, Math.abs(o.tEnd - t0));
  const y1 = new Float64Array(n);
  for (let i = 0; i < n; i++) y1[i] = y0[i] + h0 * f0[i];
  const f1 = new Float64Array(n);
  rhs(t0 + h0, y1, f1);
  let d2 = 0;
  for (let i = 0; i < n; i++) {
    const sc = o.atol[i] + o.rtol * Math.abs(y0[i]);
    d2 += ((f1[i] - f0[i]) / sc) ** 2;
  }
  d2 = Math.sqrt(d2 / n) / h0;
  const h1 =
    Math.max(d1, d2) <= 1e-15 ? Math.max(1e-6, h0 * 1e-3) : Math.pow(0.01 / Math.max(d1, d2), 1 / (order + 1));
  return Math.min(100 * h0, h1, o.hMax ?? Infinity);
}

// ---------------------------------------------------------------- Dormand–Prince 5(4)

const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
const B1 = 35 / 384, B3 = 500 / 1113, B4 = 125 / 192, B5 = -2187 / 6784, B6 = 11 / 84;
const E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920, E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40;
const D1 = -12715105075 / 11282082432, D3 = 87487479700 / 32700410799, D4 = -10690763975 / 1880347072;
const D5 = 701980252875 / 199316789632, D6 = -1453857185 / 822651844, D7 = 69997945 / 29380423;
const C2 = 1 / 5, C3 = 3 / 10, C4 = 4 / 5, C5 = 8 / 9;

export function dopri5(rhs: Rhs, o: OdeOptions): OdeSolution {
  const n = o.y0.length;
  const maxSteps = o.maxSteps ?? 100000;
  const events = o.events ?? [];
  const rec = new Recorder(n, rhs, events);

  let t = o.t0;
  const y = Float64Array.from(o.y0);
  const k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n);
  const k4 = new Float64Array(n), k5 = new Float64Array(n), k6 = new Float64Array(n), k7 = new Float64Array(n);
  const yt = new Float64Array(n), y1 = new Float64Array(n), err = new Float64Array(n);
  const rc5 = new Float64Array(n);
  let nEvals = 1;
  rhs(t, y, k1);
  rec.push(t, y, k1);
  rec.initEvents(t, y);
  if (o.onStep?.(t, y, k1)) return rec.solution("stopped", null, 0, nEvals);

  let h = initialStep(rhs, t, y, k1, o, 5);
  nEvals++;
  const hMax = o.hMax ?? Math.abs(o.tEnd - o.t0);
  let nSteps = 0;
  let stiffCount = 0;
  let nonStiffCount = 0;

  while (t < o.tEnd) {
    if (nSteps >= maxSteps) return rec.solution("maxSteps", null, nSteps, nEvals);
    if (h < 1e-14 * Math.max(1, Math.abs(t))) return rec.solution("failed", null, nSteps, nEvals);
    h = Math.min(h, hMax);
    let last = false;
    if (t + h >= o.tEnd) {
      h = o.tEnd - t;
      last = true;
    }

    for (let i = 0; i < n; i++) yt[i] = y[i] + h * A21 * k1[i];
    rhs(t + C2 * h, yt, k2);
    for (let i = 0; i < n; i++) yt[i] = y[i] + h * (A31 * k1[i] + A32 * k2[i]);
    rhs(t + C3 * h, yt, k3);
    for (let i = 0; i < n; i++) yt[i] = y[i] + h * (A41 * k1[i] + A42 * k2[i] + A43 * k3[i]);
    rhs(t + C4 * h, yt, k4);
    for (let i = 0; i < n; i++) yt[i] = y[i] + h * (A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]);
    rhs(t + C5 * h, yt, k5);
    for (let i = 0; i < n; i++)
      yt[i] = y[i] + h * (A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]);
    rhs(t + h, yt, k6);
    for (let i = 0; i < n; i++)
      y1[i] = y[i] + h * (B1 * k1[i] + B3 * k3[i] + B4 * k4[i] + B5 * k5[i] + B6 * k6[i]);
    rhs(t + h, y1, k7);
    nEvals += 6;

    for (let i = 0; i < n; i++)
      err[i] = h * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]);
    const en = errNorm(err, y, y1, o.rtol, o.atol);

    if (!Number.isFinite(en)) {
      h *= 0.25;
      continue;
    }

    if (en <= 1) {
      // Detección de rigidez (Hairer): h·|λ| ≈ h·‖k7 − k6‖ / ‖y1 − yt‖
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (k7[i] - k6[i]) ** 2;
        den += (y1[i] - yt[i]) ** 2;
      }
      if (den > 0 && h * Math.sqrt(num / den) > 3.25) {
        nonStiffCount = 0;
        if (++stiffCount >= 15) return rec.solution("stiff", null, nSteps, nEvals);
      } else if (++nonStiffCount >= 6) {
        stiffCount = 0;
      }

      for (let i = 0; i < n; i++)
        rc5[i] = h * (D1 * k1[i] + D3 * k3[i] + D4 * k4[i] + D5 * k5[i] + D6 * k6[i] + D7 * k7[i]);
      t = last ? o.tEnd : t + h;
      y.set(y1);
      k1.set(k7);
      nSteps++;
      rec.push(t, y, k1, rc5);
      const ev = rec.checkEvents();
      if (ev !== null) return rec.solution("event", ev, nSteps, nEvals);
      if (o.onStep?.(t, y, k1)) return rec.solution("stopped", null, nSteps, nEvals);
      const fac = en === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * Math.pow(en, -0.2)));
      h *= fac;
    } else {
      h *= Math.max(0.2, 0.9 * Math.pow(en, -0.2));
    }
  }
  return rec.solution("done", null, nSteps, nEvals);
}

// ---------------------------------------------------------------- Rosenbrock 2(3) (ode23s)

function luSolveInPlace(M: Float64Array, n: number, b: Float64Array) {
  // Eliminación gaussiana con pivoteo parcial sobre una copia de M (n pequeño: 2–3 estados).
  const a = Float64Array.from(M);
  const x = b;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r * n + c]) > Math.abs(a[p * n + c])) p = r;
    if (p !== c) {
      for (let j = 0; j < n; j++) {
        const tmp = a[c * n + j];
        a[c * n + j] = a[p * n + j];
        a[p * n + j] = tmp;
      }
      const tb = x[c];
      x[c] = x[p];
      x[p] = tb;
    }
    const piv = a[c * n + c];
    if (piv === 0) throw new Error("Matriz singular en Rosenbrock");
    for (let r = c + 1; r < n; r++) {
      const fct = a[r * n + c] / piv;
      if (fct === 0) continue;
      for (let j = c; j < n; j++) a[r * n + j] -= fct * a[c * n + j];
      x[r] -= fct * x[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = x[r];
    for (let j = r + 1; j < n; j++) s -= a[r * n + j] * x[j];
    x[r] = s / a[r * n + r];
  }
}

export function rosenbrock23(rhs: Rhs, o: OdeOptions): OdeSolution {
  const n = o.y0.length;
  const maxSteps = o.maxSteps ?? 100000;
  const rec = new Recorder(n, rhs, o.events ?? []);
  const d = 1 / (2 + Math.SQRT2);
  const e32 = 6 + Math.SQRT2;

  let t = o.t0;
  const y = Float64Array.from(o.y0);
  const F0 = new Float64Array(n), F1 = new Float64Array(n), F2 = new Float64Array(n);
  const k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n);
  const yt = new Float64Array(n), y1 = new Float64Array(n), err = new Float64Array(n);
  const J = new Float64Array(n * n), W = new Float64Array(n * n), fp = new Float64Array(n);
  const dfdt = new Float64Array(n);
  let nEvals = 1;
  rhs(t, y, F0);
  rec.push(t, y, F0);
  rec.initEvents(t, y);
  if (o.onStep?.(t, y, F0)) return rec.solution("stopped", null, 0, nEvals);

  let h = initialStep(rhs, t, y, F0, o, 2);
  const hMax = o.hMax ?? Math.abs(o.tEnd - o.t0);
  let nSteps = 0;
  let needJac = true;

  while (t < o.tEnd) {
    if (nSteps >= maxSteps) return rec.solution("maxSteps", null, nSteps, nEvals);
    if (h < 1e-14 * Math.max(1, Math.abs(t))) return rec.solution("failed", null, nSteps, nEvals);

    if (needJac) {
      for (let j = 0; j < n; j++) {
        const yj = y[j];
        const dy = Math.sqrt(Number.EPSILON) * Math.max(Math.abs(yj), o.atol[j] * 1e3, 1e-8);
        y[j] = yj + dy;
        rhs(t, y, fp);
        y[j] = yj;
        for (let i = 0; i < n; i++) J[i * n + j] = (fp[i] - F0[i]) / dy;
      }
      const dt = Math.sqrt(Number.EPSILON) * Math.max(Math.abs(t), 1e-3);
      rhs(t + dt, y, fp);
      for (let i = 0; i < n; i++) dfdt[i] = (fp[i] - F0[i]) / dt;
      nEvals += n + 1;
      needJac = false;
    }

    h = Math.min(h, hMax);
    let last = false;
    if (t + h >= o.tEnd) {
      h = o.tEnd - t;
      last = true;
    }

    for (let i = 0; i < n * n; i++) W[i] = -h * d * J[i];
    for (let i = 0; i < n; i++) W[i * n + i] += 1;

    try {
      for (let i = 0; i < n; i++) k1[i] = F0[i] + h * d * dfdt[i];
      luSolveInPlace(W, n, k1);
      for (let i = 0; i < n; i++) yt[i] = y[i] + 0.5 * h * k1[i];
      rhs(t + 0.5 * h, yt, F1);
      for (let i = 0; i < n; i++) k2[i] = F1[i] - k1[i];
      luSolveInPlace(W, n, k2);
      for (let i = 0; i < n; i++) {
        k2[i] += k1[i];
        y1[i] = y[i] + h * k2[i];
      }
      rhs(t + h, y1, F2);
      for (let i = 0; i < n; i++) k3[i] = F2[i] - e32 * (k2[i] - F1[i]) - 2 * (k1[i] - F0[i]) + h * d * dfdt[i];
      luSolveInPlace(W, n, k3);
    } catch {
      h *= 0.5;
      continue;
    }
    nEvals += 2;

    for (let i = 0; i < n; i++) err[i] = (h / 6) * (k1[i] - 2 * k2[i] + k3[i]);
    const en = errNorm(err, y, y1, o.rtol, o.atol);
    if (!Number.isFinite(en)) {
      h *= 0.25;
      continue;
    }

    if (en <= 1) {
      t = last ? o.tEnd : t + h;
      y.set(y1);
      F0.set(F2);
      nSteps++;
      needJac = true;
      rec.push(t, y, F0);
      const ev = rec.checkEvents();
      if (ev !== null) return rec.solution("event", ev, nSteps, nEvals);
      if (o.onStep?.(t, y, F0)) return rec.solution("stopped", null, nSteps, nEvals);
      h *= en === 0 ? 5 : Math.min(5, Math.max(0.2, 0.8 * Math.pow(en, -1 / 3)));
    } else {
      h *= Math.max(0.2, 0.8 * Math.pow(en, -1 / 3));
    }
  }
  return rec.solution("done", null, nSteps, nEvals);
}
