"""Planta virtual: un reactor "real" simulado, con parámetros ocultos y efectos que el modelo de la app no incluye.

Mientras no haya datos de laboratorio o sensores, es la fuente de datos "medidos" para:
ajustar parámetros, pronosticar corridas, entrenar sustitutos y aprender el término híbrido.
Las corridas se exportan como CSV `t,T,X` (X vacío donde no se midió), el mismo formato que se espera de datos reales.
"""

from __future__ import annotations

import copy
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from .engine import Extras, SimResult, simulate

FIXTURES_V2 = Path(__file__).resolve().parents[2] / "tests" / "engine" / "fixtures" / "v2"


def load_preset(preset_id: str) -> dict:
    """Parámetros de un preset de la app (exportados por Vitest a tests/engine/fixtures/v2)."""
    return json.loads((FIXTURES_V2 / f"preset_{preset_id}.json").read_text(encoding="utf-8"))["params"]


@dataclass
class PlantConfig:
    # Diferencias entre la planta y el modelo nominal (lo que un ajuste debería descubrir)
    A_factor: float = 1.0
    dE: float = 0.0  # cal/mol
    dDeltaH: float = 0.0  # cal/mol
    UA_factor: float = 1.0
    # Efectos que el modelo de la app no tiene (lo que un modelo híbrido debería aprender)
    deltaCp: float = 0.0  # ΔH(T) = ΔH + ΔCp·(T − T0)  [cal/(mol·K)]
    k_d: float = 0.0  # desactivación del catalizador: k·e^(−k_d·t)  [1/tiempo]
    UA_amb: float = 0.0  # pérdidas al ambiente [cal/(tiempo·K)]
    T_amb: float = 298.15
    # Sensores
    sigma_T: float = 0.2  # K
    tau_T: float = 0.0  # retardo de primer orden del termómetro [tiempo]
    dt_T: float | None = None  # intervalo de muestreo de T (None → 1/100 de la corrida)
    sigma_X: float = 0.01
    dt_X: float | None = None  # intervalo de muestras de X (None → sin X medida)


def true_params(nominal: dict, cfg: PlantConfig) -> dict:
    p = copy.deepcopy(nominal)
    p["kinetics"]["A"] *= cfg.A_factor
    p["kinetics"]["E"] += cfg.dE
    p["deltaH"] += cfg.dDeltaH
    p["energy"]["UA"] *= cfg.UA_factor
    return p


def plant_extras(p: dict, cfg: PlantConfig) -> Extras:
    T0 = p["energy"]["T0"]
    dH0 = p["deltaH"]
    return Extras(
        k_factor=(lambda t: math.exp(-cfg.k_d * t)) if cfg.k_d else None,
        deltaH_of_T=(lambda T: dH0 + cfg.deltaCp * (T - T0)) if cfg.deltaCp else None,
        extra_heat_loss=(lambda T: cfg.UA_amb * (T - cfg.T_amb)) if cfg.UA_amb else None,
    )


@dataclass
class PlantRun:
    nominal: dict
    true: dict
    config: PlantConfig
    clean: SimResult  # trayectoria verdadera, sin ruido
    measured: pd.DataFrame  # columnas t, T, X (X con NaN donde no hay muestra)


def run_plant(nominal: dict, cfg: PlantConfig, t_end: float, rng: np.random.Generator) -> PlantRun:
    p = true_params(nominal, cfg)
    fine = np.linspace(0, t_end, 2001)
    clean = simulate(p, sample_times=fine, extras=plant_extras(p, cfg))

    # Termómetro con retardo de primer orden: dTm/dt = (T − Tm)/τ
    Tm = clean.T.copy()
    if cfg.tau_T > 0:
        dt = fine[1] - fine[0]
        a = dt / (cfg.tau_T + dt)
        for i in range(1, len(Tm)):
            Tm[i] = Tm[i - 1] + a * (clean.T[i] - Tm[i - 1])

    dt_T = cfg.dt_T or t_end / 100
    tT = np.arange(0, t_end + 1e-12, dt_T)
    T_meas = np.interp(tT, fine, Tm) + rng.normal(0, cfg.sigma_T, tT.size)
    df = pd.DataFrame({"t": np.round(tT, 9), "T": T_meas})

    if cfg.dt_X:
        tX = np.arange(0, t_end + 1e-12, cfg.dt_X)
        X_meas = np.clip(np.interp(tX, fine, clean.X) + rng.normal(0, cfg.sigma_X, tX.size), 0, 1)
        df = df.merge(pd.DataFrame({"t": np.round(tX, 9), "X": X_meas}), on="t", how="outer")
    else:
        df["X"] = np.nan
    return PlantRun(nominal=nominal, true=p, config=cfg, clean=clean, measured=df.sort_values("t").reset_index(drop=True))


def random_config(rng: np.random.Generator, realism: str = "realista") -> PlantConfig:
    """'ideal': solo parámetros distintos y ruido. 'realista': además efectos fuera del modelo."""
    cfg = PlantConfig(
        A_factor=float(np.exp(rng.normal(0, 0.3))),
        dE=float(rng.normal(0, 300)),
        dDeltaH=float(rng.normal(0, 800)),
        UA_factor=float(np.exp(rng.normal(0, 0.15))),
    )
    if realism == "realista":
        cfg.deltaCp = float(rng.uniform(-15, 15))
        cfg.k_d = float(rng.uniform(0, 0.01))
        cfg.UA_amb = float(rng.uniform(0, 40))
        cfg.tau_T = float(rng.uniform(0, 0.3))
    return cfg


def write_run(run: PlantRun, path: Path) -> None:
    """CSV de mediciones + JSON con la "verdad oculta" (para evaluar, nunca para entrenar el ajuste)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    run.measured.to_csv(path, index=False, float_format="%.6g")
    path.with_suffix(".truth.json").write_text(
        json.dumps({"config": asdict(run.config), "true_params": run.true}, indent=1), encoding="utf-8"
    )
