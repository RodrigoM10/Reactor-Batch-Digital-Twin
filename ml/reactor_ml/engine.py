"""Espejo en Python del motor TypeScript (src/engine/simulate.ts).

Recibe los mismos ReactorParams (dict con las claves de src/engine/types.ts) y reproduce el modelo:
    ξ = C_clave0·X/|ν_clave|,  C_i = C_i0 + ν_i·ξ
    −r_clave = k·(Π C_i^α_i − Π C_j^β_j / K_c)
    dX/dt = −r/C_clave0
    dT/dt = ((−ΔH)·(−r)·V − Q_r) / (V·Σ C_i0·Cp_i)
La paridad con TypeScript se verifica en tests/test_parity.py con fixtures exportados desde Vitest.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq

R = 1.987  # cal/(mol·K), igual que la tesis


@dataclass
class Model:
    ids: list[str]
    nu: np.ndarray
    C0: np.ndarray
    order: np.ndarray
    reverse_order: np.ndarray
    constant: np.ndarray
    key_index: int
    CA0: float
    xi_per_X: float
    X_max: float
    reversible: bool


def compile_model(p: dict) -> Model:
    sp = p["species"]
    key_index = next(i for i, s in enumerate(sp) if s["id"] == p["keySpecies"])
    key = sp[key_index]
    CA0 = key["C0"]
    xi_per_X = CA0 / abs(key["nu"])
    X_max = 1.0
    for s in sp:
        if s["nu"] < 0:
            X_max = min(X_max, s["C0"] / (abs(s["nu"]) * xi_per_X))
    return Model(
        ids=[s["id"] for s in sp],
        nu=np.array([s["nu"] for s in sp], float),
        C0=np.array([s["C0"] for s in sp], float),
        order=np.array([s["order"] for s in sp], float),
        reverse_order=np.array([s["reverseOrder"] for s in sp], float),
        constant=np.array([bool(s.get("constantInRate", False)) for s in sp]),
        key_index=key_index,
        CA0=CA0,
        xi_per_X=xi_per_X,
        X_max=X_max,
        reversible=bool(p["reversible"]),
    )


def rate_constant(p: dict, T: float) -> float:
    kin = p["kinetics"]
    if kin["mode"] == "direct":
        return kin["k"]
    return kin["A"] * math.exp(-kin["E"] / (R * T))


def equilibrium_constant(p: dict, T: float) -> float:
    eq = p["equilibrium"]
    if eq["method"] == "direct":
        return eq["Keq"]
    if eq["method"] == "vant_hoff":
        return eq["Keq_ref"] * math.exp((p["deltaH"] / R) * (1 / eq["T_ref"] - 1 / T))
    dG = sum(s["nu"] * s.get("DGf", 0.0) for s in p["species"])
    return math.exp(-dG / (R * T))


def mixture_heat_capacity(p: dict) -> float:
    return sum(s["C0"] * s["Cp"] for s in p["species"])


def rate_at(m: Model, X: float, k: float, Kc: float | None) -> float:
    C = np.where(m.constant, m.C0, np.maximum(m.C0 + m.nu * m.xi_per_X * X, 0.0))
    fwd = float(np.prod(np.where(m.order != 0, C ** m.order, 1.0)))
    if not m.reversible or Kc is None:
        return k * fwd
    rev = float(np.prod(np.where(m.reverse_order != 0, C ** m.reverse_order, 1.0)))
    return k * (fwd - rev / Kc)


def equilibrium_conversion(m: Model, Kc: float) -> float | None:
    if not (Kc > 0) or not math.isfinite(Kc):
        return None
    lnK = math.log(Kc)
    mask = m.nu != 0

    def f(X: float) -> float:
        C = np.maximum(m.C0 + m.nu * m.xi_per_X * X, 1e-300)
        return float(np.sum(m.nu[mask] * np.log(C[mask]))) - lnK

    lo, hi = 1e-12, m.X_max * (1 - 1e-12)
    if f(lo) > 0:
        return 0.0
    if f(hi) < 0:
        return m.X_max
    return brentq(f, lo, hi, xtol=1e-14)


@dataclass
class Extras:
    """Efectos adicionales sobre el balance (los usa la planta virtual; el motor de la app no los tiene)."""

    k_factor: Callable[[float], float] | None = None  # multiplica k en función de t (desactivación)
    deltaH_of_T: Callable[[float], float] | None = None  # ΔH(T) (ΔCp ≠ 0)
    extra_heat_loss: Callable[[float], float] | None = None  # Q adicional removido(T) [cal/tiempo]
    dT_correction: Callable[[float, float, float], float] | None = None  # término híbrido f(t, X, T)


@dataclass
class SimResult:
    t: np.ndarray
    X: np.ndarray
    T: np.ndarray
    C: dict[str, np.ndarray]
    rate: np.ndarray
    Qg: np.ndarray
    Qr: np.ndarray
    T_cool_out: np.ndarray | None
    t_end: float
    status: str
    meta: dict = field(default_factory=dict)


def make_rhs(p: dict, m: Model, extras: Extras | None = None):
    e = p["energy"]
    iso = e["mode"] == "isothermal"
    V = e["V"]
    sumCp = mixture_heat_capacity(p)
    T0 = e["T0"]
    mode = e["mode"]
    icq_factor = 1 - math.exp(-e["UA"] / (e["m_c"] * e["Cp_c"])) if mode == "icq" else 0.0
    ex = extras or Extras()

    def heat_removed(T: float) -> float:
        q = 0.0
        if mode == "icq":
            q = e["m_c"] * e["Cp_c"] * (T - e["T_cool"]) * icq_factor
        elif mode == "jacket":
            q = e["UA"] * (T - e["T_cool"])
        if ex.extra_heat_loss is not None and not iso:
            q += ex.extra_heat_loss(T)
        return q

    def rate(t: float, X: float, T: float) -> float:
        k = rate_constant(p, T)
        if ex.k_factor is not None:
            k *= ex.k_factor(t)
        Kc = equilibrium_constant(p, T) if p["reversible"] else None
        return rate_at(m, X, k, Kc)

    def rhs(t: float, y: np.ndarray) -> list[float]:
        X = min(max(y[0], 0.0), m.X_max)
        T = T0 if iso else max(y[1], 1.0)
        r = rate(t, X, T)
        if (X >= m.X_max and r > 0) or (X <= 0 and r < 0):
            r = 0.0
        dX = r / m.CA0
        if iso:
            return [dX, 0.0]
        dH = ex.deltaH_of_T(T) if ex.deltaH_of_T is not None else p["deltaH"]
        dT = (-dH * r * V - heat_removed(T)) / (V * sumCp)
        if ex.dT_correction is not None:
            dT += ex.dT_correction(t, X, T)
        return [dX, dT]

    return rhs, rate, heat_removed


def simulate(
    p: dict,
    sample_times: np.ndarray | None = None,
    t_end: float | None = None,
    n_samples: int = 300,
    extras: Extras | None = None,
    rtol: float = 1e-10,
    atol: tuple[float, float] = (1e-12, 1e-10),
) -> SimResult:
    """Integra hasta t_end (o hasta el evento de conversión objetivo). Muestras uniformes si no se dan tiempos."""
    m = compile_model(p)
    rhs, rate, heat_removed = make_rhs(p, m, extras)
    e = p["energy"]
    stop = p["stop"]
    if t_end is None:
        t_end = float(sample_times[-1]) if sample_times is not None else (
            stop["t_final"] if stop["mode"] == "time" else stop["t_max"]
        )

    events = None
    if stop["mode"] == "conversion" and sample_times is None:
        Xt = stop["X_target"]

        def ev(t, y):
            return y[0] - Xt

        ev.terminal = True
        ev.direction = 1
        events = [ev]

    sol = solve_ivp(rhs, (0.0, t_end), [0.0, e["T0"]], method="LSODA", rtol=rtol, atol=list(atol),
                    dense_output=True, events=events)
    t_stop = float(sol.t_events[0][0]) if events and sol.t_events[0].size else float(sol.t[-1])
    ts = np.asarray(sample_times, float) if sample_times is not None else np.linspace(0, t_stop, n_samples)
    Y = sol.sol(ts)
    X = np.clip(Y[0], 0.0, m.X_max)
    T = np.full_like(X, e["T0"]) if e["mode"] == "isothermal" else Y[1]
    r = np.array([rate(t, x, temp) for t, x, temp in zip(ts, X, T)])
    dH = np.array([extras.deltaH_of_T(temp) for temp in T]) if extras and extras.deltaH_of_T else p["deltaH"]
    C = {sid: np.maximum(m.C0[i] + m.nu[i] * m.xi_per_X * X, 0.0) for i, sid in enumerate(m.ids)}
    T_cool_out = None
    if e["mode"] == "icq":
        T_cool_out = T - (T - e["T_cool"]) * math.exp(-e["UA"] / (e["m_c"] * e["Cp_c"]))
    return SimResult(
        t=ts, X=X, T=T, C=C, rate=r,
        Qg=-dH * r * e["V"], Qr=np.array([heat_removed(temp) for temp in T]),
        T_cool_out=T_cool_out, t_end=t_stop, status=sol.message,
    )
