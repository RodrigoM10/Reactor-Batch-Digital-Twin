"""Modelo sustituto del mapa de operación segura para el caso "Camisa ICQ" (preset runaway).

    ml/.venv/Scripts/python -B ml/scripts/train_risk_surrogate.py [--n 24000]

1. Muestrea condiciones de operación (Latin hypercube): T0, T_cool, ln m_c, ln UA.
2. Simula cada punto con el motor Python (espejo del TS) y registra T_max.
3. Entrena un MLP (64×64×64, tanh) y exporta sus pesos a JSON para evaluarlo en TypeScript (src/engine/mlp.ts).
   Con 24 000 corridas superó a un HistGradientBoosting (error medio 0.38 K vs 0.50 K) y evita cargar
   onnxruntime-web (~10 MB) en el navegador; además skl2onnx falla con árboles en scikit-learn 1.9.
Escribe public/models/risk-icq.json (pesos, rangos, métricas, criterio de runaway) y un fixture de paridad TS↔Python.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import qmc

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml"))

from reactor_ml.engine import compile_model, mixture_heat_capacity, simulate  # noqa: E402
from reactor_ml.plant import load_preset  # noqa: E402

PRESET = "runaway"
FEATURES = ["T0", "T_cool", "ln_m_c", "ln_UA"]
RANGES = {"T0": (285.0, 345.0), "T_cool": (280.0, 340.0), "ln_m_c": (math.log(0.05), math.log(20.0)),
          "ln_UA": (math.log(100.0), math.log(10000.0))}
HORIZON = 150.0  # min


def apply(base: dict, x: np.ndarray) -> dict:
    p = copy.deepcopy(base)
    p["energy"]["T0"] = float(x[0])
    p["energy"]["T_cool"] = float(x[1])
    p["energy"]["m_c"] = float(math.exp(x[2]))
    p["energy"]["UA"] = float(math.exp(x[3]))
    return p


def t_max_of(x: np.ndarray) -> float:
    p = apply(load_preset(PRESET), x)
    r = simulate(p, sample_times=np.linspace(0, HORIZON, 1500), rtol=1e-8, atol=(1e-10, 1e-8))
    return float(np.max(r.T))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=24000)
    args = ap.parse_args()

    base = load_preset(PRESET)
    m = compile_model(base)
    dT_ad = (-base["deltaH"]) * m.CA0 * m.X_max / mixture_heat_capacity(base)

    lo = np.array([RANGES[f][0] for f in FEATURES])
    hi = np.array([RANGES[f][1] for f in FEATURES])
    X = qmc.scale(qmc.LatinHypercube(d=4, seed=0).random(args.n), lo, hi)

    data_dir = ROOT / "ml" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    cache = data_dir / f"risk-{PRESET}-{args.n}.csv"
    t0 = time.perf_counter()
    if cache.exists():
        df = pd.read_csv(cache)
    else:
        with Pool() as pool:
            y = pool.map(t_max_of, list(X), chunksize=64)
        df = pd.DataFrame(X, columns=FEATURES)
        df["T_max"] = y
        df.to_csv(cache, index=False)
    print(f"dataset: {len(df)} simulaciones en {time.perf_counter() - t0:.1f} s")

    from sklearn.model_selection import train_test_split
    from sklearn.neural_network import MLPRegressor

    from reactor_ml.mlp_export import predict, sklearn_mlp_to_dict, write

    Xa = df[FEATURES].to_numpy()
    # Objetivo: aumento de T sobre la referencia, normalizado por ΔT_ad (suaviza el aprendizaje).
    ref = np.maximum(df["T0"], df["T_cool"]).to_numpy()
    ya = (df["T_max"].to_numpy() - ref) / dT_ad
    Xtr, Xte, ytr, yte, rtr, rte = train_test_split(Xa, ya, ref, test_size=0.15, random_state=0)
    mu, sd = Xtr.mean(0), Xtr.std(0)
    model = MLPRegressor(hidden_layer_sizes=(64, 64, 64), activation="tanh", learning_rate_init=2e-3, max_iter=600,
                         early_stopping=True, n_iter_no_change=30, random_state=0, batch_size=256, alpha=1e-6)
    model.fit((Xtr - mu) / sd, ytr)
    d = sklearn_mlp_to_dict(model, mu, sd)

    pred_T = predict(d, Xte) * dT_ad + rte
    true_T = yte * dT_ad + rte
    err = np.abs(pred_T - true_T)
    run_true = (true_T - rte) > 0.5 * dT_ad
    run_pred = (pred_T - rte) > 0.5 * dT_ad
    metrics = {
        "n_train": int(len(Xtr)), "n_test": int(len(Xte)),
        "mae_K": float(err.mean()), "p95_K": float(np.percentile(err, 95)), "max_K": float(err.max()),
        "runaway_accuracy": float((run_true == run_pred).mean()),
        "runaway_fraction": float(run_true.mean()),
    }
    print(json.dumps(metrics, indent=1))

    meta = {
        "preset": PRESET,
        "features": FEATURES,
        "ranges": RANGES,
        "target": "(T_max − max(T0, T_cool)) / ΔT_ad",
        "deltaT_ad": dT_ad,
        "runaway_threshold": 0.5,
        "horizon_min": HORIZON,
        "metrics": metrics,
    }
    out = ROOT / "public" / "models" / "risk-icq.json"
    write(d, out, meta)
    print("modelo:", out, f"{out.stat().st_size / 1024:.0f} KB")

    # Fixture de paridad: 50 puntos de prueba con la predicción de Python y el T_max verdadero
    idx = np.random.default_rng(0).choice(len(Xte), 50, replace=False)
    fx = {"x": Xte[idx].tolist(), "pred": predict(d, Xte[idx]).tolist(), "T_max": true_T[idx].tolist(),
          "ref": rte[idx].tolist()}
    fx_path = ROOT / "tests" / "engine" / "fixtures" / "ml" / "risk-icq-samples.json"
    fx_path.parent.mkdir(parents=True, exist_ok=True)
    fx_path.write_text(json.dumps(fx), encoding="utf-8")


if __name__ == "__main__":
    main()
