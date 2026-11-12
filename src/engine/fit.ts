import { R } from "./model/thermo";
import { simulate } from "./simulate";
import type { ReactorParams } from "./types";

/**
 * Ajuste de parámetros a datos medidos (Levenberg–Marquardt, mínimos cuadrados ponderados).
 *
 * Para desacoplar A y E (muy correlacionados) se ajustan ln k(T_ref) y E, con T_ref = T0,
 * y se informa A = k_ref·e^(E/(R·T_ref)). Es la misma parametrización que ml/reactor_ml/fit.py.
 */

export type FitParam = "k" | "E" | "deltaH" | "UA";

export interface Measurements {
  t: number[];
  T?: (number | null)[]; // temperatura medida [K]
  X?: (number | null)[]; // conversión medida
}

export interface FitOptions {
  params: FitParam[];
  sigmaT?: number; // desvío estándar del termómetro [K]
  sigmaX?: number;
  maxIter?: number;
}

export interface FitEstimate {
  name: FitParam;
  label: string;
  value: number; // en unidades físicas (k es k(T_ref))
  stdErr: number; // en unidades físicas (propagado)
  relErr: number;
}

export interface FitResult {
  ok: boolean;
  message: string;
  params: ReactorParams; // parámetros ajustados listos para simular
  estimates: FitEstimate[];
  A: number | null; // factor preexponencial resultante (si se ajustó k o E)
  correlation: number[][];
  cost: number; // Σ residuos ponderados²
  chi2red: number; // cost / (n − p)
  rmseT: number | null;
  rmseX: number | null;
  iterations: number;
  nPoints: number;
}

const LABELS: Record<FitParam, string> = {
  k: "k(T₀)",
  E: "E [cal/mol]",
  deltaH: "ΔH [cal/mol]",
  UA: "U·A",
};

/** Vector interno θ: ln k_ref, E/1e4, ΔH/1e4, ln UA (escalas de orden 1 para el LM). */
function toTheta(p: ReactorParams, names: FitParam[], Tref: number): number[] {
  const kref = p.kinetics.A * Math.exp(-p.kinetics.E / (R * Tref));
  return names.map((n) => {
    switch (n) {
      case "k":
        return Math.log(kref);
      case "E":
        return p.kinetics.E / 1e4;
      case "deltaH":
        return p.deltaH / 1e4;
      case "UA":
        return Math.log(p.energy.UA);
    }
  });
}

function fromTheta(base: ReactorParams, names: FitParam[], theta: number[], Tref: number): ReactorParams {
  const p = structuredClone(base);
  const kref0 = base.kinetics.A * Math.exp(-base.kinetics.E / (R * Tref));
  let lnk = Math.log(kref0);
  let E = base.kinetics.E;
  names.forEach((n, i) => {
    if (n === "k") lnk = theta[i];
    if (n === "E") E = theta[i] * 1e4;
    if (n === "deltaH") p.deltaH = theta[i] * 1e4;
    if (n === "UA") p.energy.UA = Math.exp(theta[i]);
  });
  p.kinetics.E = E;
  p.kinetics.A = Math.exp(lnk + E / (R * Tref));
  return p;
}

function solve(M: number[][], b: number[]): number[] {
  const n = b.length;
  const a = M.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    [a[c], a[piv]] = [a[piv], a[c]];
    if (Math.abs(a[c][c]) < 1e-300) throw new Error("singular");
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      for (let j = c; j <= n; j++) a[r][j] -= f * a[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = a[r][n];
    for (let j = r + 1; j < n; j++) s -= a[r][j] * x[j];
    x[r] = s / a[r][r];
  }
  return x;
}

function invert(M: number[][]): number[][] {
  const n = M.length;
  return Array.from({ length: n }, (_, j) => solve(M, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)))).map(
    (_, i, cols) => cols.map((col) => col[i]),
  );
}

export function fitParameters(base: ReactorParams, data: Measurements, opts: FitOptions): FitResult {
  const names = opts.params.filter((n) => n !== "UA" || base.energy.mode === "icq" || base.energy.mode === "jacket");
  const sigmaT = opts.sigmaT ?? 0.5;
  const sigmaX = opts.sigmaX ?? 0.02;
  const Tref = base.energy.T0;
  const nonIso = base.energy.mode !== "isothermal";

  // Puntos válidos ordenados por tiempo
  const rows = data.t
    .map((t, i) => ({ t, T: data.T?.[i] ?? null, X: data.X?.[i] ?? null }))
    .filter((r) => Number.isFinite(r.t) && r.t >= 0 && (Number.isFinite(r.T ?? NaN) || Number.isFinite(r.X ?? NaN)))
    .sort((a, b) => a.t - b.t);
  const useT = nonIso && rows.some((r) => r.T !== null && Number.isFinite(r.T));
  const times = rows.map((r) => r.t);
  const tEnd = times.at(-1) ?? 0;
  const nPoints = rows.reduce(
    (acc, r) => acc + (useT && Number.isFinite(r.T ?? NaN) ? 1 : 0) + (Number.isFinite(r.X ?? NaN) ? 1 : 0),
    0,
  );

  const fail = (message: string): FitResult => ({
    ok: false,
    message,
    params: base,
    estimates: [],
    A: null,
    correlation: [],
    cost: NaN,
    chi2red: NaN,
    rmseT: null,
    rmseX: null,
    iterations: 0,
    nPoints,
  });
  if (base.kinetics.mode !== "arrhenius" && names.some((n) => n === "k" || n === "E"))
    return fail("Para ajustar k o E la cinética debe estar en modo Arrhenius.");
  if (!names.length) return fail("Elegí al menos un parámetro para ajustar.");
  if (nPoints <= names.length) return fail("Hay muy pocos datos para la cantidad de parámetros elegidos.");

  const residuals = (theta: number[]): number[] | null => {
    const p = fromTheta(base, names, theta, Tref);
    p.stop = { ...p.stop, mode: "time", t_final: tEnd };
    const r = simulate(p, { sampleTimes: times });
    if (!r.ok) return null;
    const res: number[] = [];
    rows.forEach((row, i) => {
      if (useT && row.T !== null && Number.isFinite(row.T)) res.push((r.series.T[i] - row.T) / sigmaT);
      if (row.X !== null && Number.isFinite(row.X)) res.push((r.series.X[i] - row.X) / sigmaX);
    });
    return res.every(Number.isFinite) ? res : null;
  };
  const sumSq = (r: number[]) => r.reduce((a, v) => a + v * v, 0);

  let theta = toTheta(base, names, Tref);
  let r = residuals(theta);
  if (!r) return fail("El modelo no se puede simular con los parámetros iniciales.");
  let cost = sumSq(r);
  let lambda = 1e-3;
  let J: number[][] = [];
  let it = 0;
  const maxIter = opts.maxIter ?? 60;

  // Diferencias finitas: hacia adelante durante la iteración; centradas (paso 1e-4) para la covarianza final,
  // porque el error del integrador (~1e-8 relativo) contamina las derivadas con pasos más chicos.
  const jacobian = (th: number[], r0: number[], central = false) => {
    const cols = th.map((_, j) => {
      const h = (central ? 1e-4 : 1e-5) * Math.max(1, Math.abs(th[j]));
      const tp = [...th];
      tp[j] += h;
      const rp = residuals(tp);
      if (!rp) return r0.map(() => 0);
      if (!central) return rp.map((v, i) => (v - r0[i]) / h);
      const tm = [...th];
      tm[j] -= h;
      const rm = residuals(tm);
      return rm ? rp.map((v, i) => (v - rm[i]) / (2 * h)) : rp.map((v, i) => (v - r0[i]) / h);
    });
    return r0.map((_, i) => cols.map((c) => c[i]));
  };

  for (; it < maxIter; it++) {
    J = jacobian(theta, r);
    const p = theta.length;
    const JtJ = Array.from({ length: p }, (_, a) =>
      Array.from({ length: p }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0)),
    );
    const Jtr = Array.from({ length: p }, (_, a) => J.reduce((s, row, i) => s + row[a] * r![i], 0));
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const M = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
      let delta: number[];
      try {
        delta = solve(M, Jtr.map((v) => -v));
      } catch {
        lambda *= 10;
        continue;
      }
      const cand = theta.map((v, i) => v + delta[i]);
      const rc = residuals(cand);
      const cc = rc ? sumSq(rc) : Infinity;
      if (cc < cost) {
        const rel = (cost - cc) / Math.max(cost, 1e-300);
        theta = cand;
        r = rc!;
        cost = cc;
        lambda = Math.max(lambda / 3, 1e-9);
        improved = true;
        if (rel < 1e-10 || Math.max(...delta.map(Math.abs)) < 1e-10) it = maxIter;
        break;
      }
      lambda *= 4;
    }
    if (!improved) break;
  }

  J = jacobian(theta, r, true);
  const p = theta.length;
  const JtJ = Array.from({ length: p }, (_, a) =>
    Array.from({ length: p }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0)),
  );
  const dof = Math.max(nPoints - p, 1);
  const chi2red = cost / dof;
  let cov: number[][];
  try {
    // Con σ conocidos la covarianza es (JᵀJ)⁻¹; se escala por χ²_red para no subestimar si los σ son optimistas.
    cov = invert(JtJ).map((row) => row.map((v) => v * Math.max(chi2red, 1)));
  } catch {
    cov = JtJ.map((row) => row.map(() => NaN));
  }
  const sd = cov.map((row, i) => Math.sqrt(Math.max(row[i], 0)));
  const fitted = fromTheta(base, names, theta, Tref);

  const estimates: FitEstimate[] = names.map((n, i) => {
    let value: number;
    let stdErr: number;
    switch (n) {
      case "k":
        value = Math.exp(theta[i]);
        stdErr = value * sd[i];
        break;
      case "E":
      case "deltaH":
        value = theta[i] * 1e4;
        stdErr = sd[i] * 1e4;
        break;
      case "UA":
        value = Math.exp(theta[i]);
        stdErr = value * sd[i];
        break;
    }
    return { name: n, label: LABELS[n], value, stdErr, relErr: Math.abs(stdErr / value) };
  });

  // RMSE en unidades físicas
  const final = simulate({ ...fitted, stop: { ...fitted.stop, mode: "time", t_final: tEnd } }, { sampleTimes: times });
  let seT = 0, nT = 0, seX = 0, nX = 0;
  if (final.ok)
    rows.forEach((row, i) => {
      if (useT && row.T !== null && Number.isFinite(row.T)) {
        seT += (final.series.T[i] - row.T) ** 2;
        nT++;
      }
      if (row.X !== null && Number.isFinite(row.X)) {
        seX += (final.series.X[i] - row.X) ** 2;
        nX++;
      }
    });

  return {
    ok: true,
    message: "Ajuste completado.",
    params: fitted,
    estimates,
    A: names.includes("k") || names.includes("E") ? fitted.kinetics.A : null,
    correlation: cov.map((row, i) => row.map((v, j) => v / (sd[i] * sd[j]))),
    cost,
    chi2red,
    rmseT: nT ? Math.sqrt(seT / nT) : null,
    rmseX: nX ? Math.sqrt(seX / nX) : null,
    iterations: it,
    nPoints,
  };
}

/** Lee un CSV con columnas t, T, X (X o T pueden faltar o venir vacías). Acepta coma o punto y coma. */
export function parseMeasurementsCsv(text: string): Measurements {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (lines.length < 2) throw new Error("El CSV no tiene datos.");
  const sep = lines[0].includes(";") ? ";" : ",";
  // "t" (minúscula) es tiempo y "T" (mayúscula) temperatura; se ignoran unidades entre corchetes.
  const head = lines[0].split(sep).map((h) => h.trim().replace(/\s*[[(].*[\])]$/, ""));
  const find = (exact: string[], loose: string[]) =>
    head.findIndex((h) => exact.includes(h) || loose.includes(h.toLowerCase()));
  const it = find(["t"], ["tiempo", "time"]);
  const idxT = find(["T"], ["temperatura", "temp", "temperature"]);
  const iX = find(["X", "x"], ["conversion", "conversión"]);
  if (it < 0) throw new Error("Falta la columna de tiempo 't'.");
  const num = (s: string | undefined) => {
    if (s === undefined || s.trim() === "") return null;
    const v = Number(sep === ";" ? s.replace(",", ".") : s);
    return Number.isFinite(v) ? v : null;
  };
  const t: number[] = [], T: (number | null)[] = [], X: (number | null)[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(sep);
    const tv = num(c[it]);
    if (tv === null) continue;
    t.push(tv);
    T.push(idxT >= 0 ? num(c[idxT]) : null);
    X.push(iX >= 0 ? num(c[iX]) : null);
  }
  return { t, T, X };
}
