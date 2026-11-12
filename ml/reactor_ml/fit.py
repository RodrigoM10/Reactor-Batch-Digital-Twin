"""Ajuste de parámetros con scipy.optimize.least_squares: referencia para src/engine/fit.ts.

Misma parametrización que TypeScript: θ = [ln k(T_ref), E/1e4, ΔH/1e4, ln UA], con T_ref = T0.
"""

from __future__ import annotations

import copy
import math

import numpy as np
from scipy.optimize import least_squares

from .engine import R, simulate


def to_theta(p: dict, names: list[str]) -> np.ndarray:
    Tref = p["energy"]["T0"]
    kref = p["kinetics"]["A"] * math.exp(-p["kinetics"]["E"] / (R * Tref))
    out = []
    for n in names:
        out.append({"k": math.log(kref), "E": p["kinetics"]["E"] / 1e4, "deltaH": p["deltaH"] / 1e4,
                    "UA": math.log(p["energy"]["UA"])}[n])
    return np.array(out)


def from_theta(base: dict, names: list[str], theta: np.ndarray) -> dict:
    p = copy.deepcopy(base)
    Tref = base["energy"]["T0"]
    lnk = math.log(base["kinetics"]["A"] * math.exp(-base["kinetics"]["E"] / (R * Tref)))
    E = base["kinetics"]["E"]
    for n, v in zip(names, theta):
        if n == "k":
            lnk = v
        elif n == "E":
            E = v * 1e4
        elif n == "deltaH":
            p["deltaH"] = v * 1e4
        elif n == "UA":
            p["energy"]["UA"] = math.exp(v)
    p["kinetics"]["E"] = E
    p["kinetics"]["A"] = math.exp(lnk + E / (R * Tref))
    return p


def fit(base: dict, t: np.ndarray, T: np.ndarray | None, X: np.ndarray | None, names: list[str],
        sigma_T: float = 0.5, sigma_X: float = 0.02) -> dict:
    t = np.asarray(t, float)
    iso = base["energy"]["mode"] == "isothermal"

    def residuals(theta):
        p = from_theta(base, names, theta)
        r = simulate(p, sample_times=t)
        res = []
        if T is not None and not iso:
            m = ~np.isnan(T)
            res.append((r.T[m] - T[m]) / sigma_T)
        if X is not None:
            m = ~np.isnan(X)
            res.append((r.X[m] - X[m]) / sigma_X)
        return np.concatenate(res)

    sol = least_squares(residuals, to_theta(base, names), method="lm", xtol=1e-12, ftol=1e-12, diff_step=1e-5)
    # Covarianza con Jacobiano centrado (paso 1e-4): con pasos menores domina el error del integrador.
    J = np.empty((sol.fun.size, sol.x.size))
    for j in range(sol.x.size):
        h = 1e-4 * max(1.0, abs(sol.x[j]))
        tp, tm = sol.x.copy(), sol.x.copy()
        tp[j] += h
        tm[j] -= h
        J[:, j] = (residuals(tp) - residuals(tm)) / (2 * h)
    dof = max(sol.fun.size - len(names), 1)
    chi2red = float(np.sum(sol.fun ** 2) / dof)
    cov = np.linalg.inv(J.T @ J) * max(chi2red, 1.0)
    sd = np.sqrt(np.diag(cov))

    values, errs = [], []
    for n, v, s in zip(names, sol.x, sd):
        if n in ("k", "UA"):
            values.append(math.exp(v))
            errs.append(math.exp(v) * s)
        else:
            values.append(v * 1e4)
            errs.append(s * 1e4)
    return {"names": names, "values": values, "std": errs, "chi2red": chi2red, "params": from_theta(base, names, sol.x)}
