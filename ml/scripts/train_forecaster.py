"""Pronosticador de corridas en curso, entrenado con la planta virtual realista.

Reactor: el caso "Camisa ICQ" con la escala de tiempo estirada S = 40 veces (A, m_c y UA divididos por S:
misma física, pico entre ~10 y ~40 min), para que haya margen real de aviso anticipado.

    ml/.venv/Scripts/python -B ml/scripts/train_forecaster.py [--runs 3000]

Para un instante de corte t_c, las entradas son el punto de operación y la ventana reciente de T medida
(ver build_features, que src/engine/forecast.ts replica exactamente). Salidas:
  - regresión: T(t_c + h) − T_ventana_final para h en HORIZONS, y T_max futura − T0;
  - clasificación: probabilidad de runaway de la corrida.
Escribe public/models/forecast-icq.json, corridas de demostración en public/data/live/ y un fixture de paridad.
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

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml"))

from reactor_ml.engine import compile_model, mixture_heat_capacity  # noqa: E402
from reactor_ml.mlp_export import predict, sklearn_mlp_to_dict, write  # noqa: E402
from reactor_ml.plant import load_preset, random_config, run_plant  # noqa: E402

PRESET = "runaway"
TIME_SCALE = 40.0
T_END = 90.0  # min
DT_MEAS = 0.1
SIGMA_T = 0.3
WINDOW = 12  # muestras de la ventana
DT_WIN = 0.25  # min entre muestras de la ventana
HORIZONS = [0.5, 1, 2, 3, 5, 8, 12]  # min
CUTS_PER_RUN = 8
RANGES = {"T0": (290.0, 320.0), "T_cool": (285.0, 312.0),
          "ln_m_c": (math.log(0.15 / TIME_SCALE), math.log(12.0 / TIME_SCALE)),
          "ln_UA": (math.log(300.0 / TIME_SCALE), math.log(6000.0 / TIME_SCALE))}


def nominal() -> dict:
    p = load_preset(PRESET)
    p["kinetics"]["A"] /= TIME_SCALE
    p["energy"]["m_c"] /= TIME_SCALE
    p["energy"]["UA"] /= TIME_SCALE
    p["stop"] = {**p["stop"], "mode": "time", "t_final": T_END}
    return p


def build_features(op: dict, t_meas: np.ndarray, T_meas: np.ndarray, t_c: float) -> np.ndarray:
    """Misma construcción que forecastFeatures() en src/engine/forecast.ts."""
    tw = t_c - DT_WIN * np.arange(WINDOW - 1, -1, -1)
    m = t_meas <= t_c + 1e-9
    Tw = np.interp(np.maximum(tw, t_meas[0]), t_meas[m], T_meas[m])
    return np.concatenate([[op["T0"], op["T_cool"], op["ln_m_c"], op["ln_UA"], t_c], Tw - op["T0"]])


def sample_op(rng: np.random.Generator) -> dict:
    return {k: float(rng.uniform(*v)) for k, v in RANGES.items()}


def apply(base: dict, op: dict) -> dict:
    p = copy.deepcopy(base)
    p["energy"].update(T0=op["T0"], T_cool=op["T_cool"], m_c=math.exp(op["ln_m_c"]), UA=math.exp(op["ln_UA"]))
    return p


def one_run(seed: int):
    rng = np.random.default_rng(seed)
    base = nominal()
    op = sample_op(rng)
    cfg = random_config(rng, "realista")
    # Los efectos ocultos se escalan igual que el reactor (pérdidas de calor y desactivación son "por minuto").
    cfg.UA_amb /= TIME_SCALE
    cfg.k_d /= TIME_SCALE
    cfg.dt_T, cfg.sigma_T = DT_MEAS, SIGMA_T
    run = run_plant(apply(base, op), cfg, T_END, rng)
    return op, run.measured["t"].to_numpy(), run.measured["T"].to_numpy(), run.clean.t, run.clean.T


def labels(op, tc_list, ct, cT, dT_ad):
    ref = max(op["T0"], op["T_cool"])
    runaway = float(cT.max() - ref > 0.5 * dT_ad)
    out = []
    for tc in tc_list:
        Tc = np.interp(tc, ct, cT)
        fut = [np.interp(min(tc + h, ct[-1]), ct, cT) - Tc for h in HORIZONS]
        tmax_future = cT[ct >= tc].max() - op["T0"]
        out.append(fut + [tmax_future])
    return np.array(out), runaway


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=3000)
    args = ap.parse_args()

    base = nominal()
    m = compile_model(base)
    dT_ad = (-base["deltaH"]) * m.CA0 * m.X_max / mixture_heat_capacity(base)

    t0 = time.perf_counter()
    with Pool() as pool:
        runs = pool.map(one_run, range(args.runs), chunksize=16)
    print(f"{len(runs)} corridas de la planta en {time.perf_counter() - t0:.1f} s")

    rng = np.random.default_rng(123)
    X, Y, C, G, LEAD = [], [], [], [], []
    for r_id, (op, tm, Tm, ct, cT) in enumerate(runs):
        t_peak = float(ct[np.argmax(cT)])
        # Cortes concentrados antes del pico (donde pronosticar importa) y algunos después
        before = rng.uniform(0.5, max(t_peak, 3.0), CUTS_PER_RUN - 2)
        after = rng.uniform(min(t_peak, 60.0), 60.0, 2)
        tcs = np.sort(np.concatenate([before, after]))
        y, runaway = labels(op, tcs, ct, cT, dT_ad)
        for tc, yy in zip(tcs, y):
            X.append(build_features(op, tm, Tm, tc))
            Y.append(yy)
            C.append(runaway)
            G.append(r_id)
            LEAD.append(t_peak - tc)
    X, Y, C, G, LEAD = map(np.array, (X, Y, C, G, LEAD))
    test_runs = G >= int(0.85 * args.runs)  # separación por corrida (no por fila) para no filtrar información
    print(f"{len(X)} ejemplos; runaway en {C[~test_runs].mean():.0%} de las corridas de entrenamiento")

    from sklearn.neural_network import MLPClassifier, MLPRegressor

    mu, sd = X[~test_runs].mean(0), X[~test_runs].std(0) + 1e-9
    ym, ys = Y[~test_runs].mean(0), Y[~test_runs].std(0) + 1e-9
    reg = MLPRegressor(hidden_layer_sizes=(96, 96, 64), activation="tanh", learning_rate_init=1.5e-3, max_iter=500,
                       early_stopping=True, n_iter_no_change=25, random_state=0, batch_size=256, alpha=1e-5)
    reg.fit((X[~test_runs] - mu) / sd, (Y[~test_runs] - ym) / ys)
    clf = MLPClassifier(hidden_layer_sizes=(64, 64), activation="tanh", learning_rate_init=1.5e-3, max_iter=500,
                        early_stopping=True, n_iter_no_change=25, random_state=0, batch_size=256, alpha=1e-5)
    clf.fit((X[~test_runs] - mu) / sd, C[~test_runs])

    d_reg = sklearn_mlp_to_dict(reg, mu, sd, ym, ys)
    d_clf = sklearn_mlp_to_dict(clf, mu, sd)
    Yp = predict(d_reg, X[test_runs])
    Pp = predict(d_clf, X[test_runs])
    err = np.abs(Yp - Y[test_runs])
    lead = LEAD[test_runs]
    pre = lead > 0
    hit = (Pp > 0.5) == (C[test_runs] > 0.5)
    pos = C[test_runs] > 0.5

    def rates(mask):
        return {"detección": float((Pp[mask & pos] > 0.5).mean()), "falsa_alarma": float((Pp[mask & ~pos] > 0.5).mean())}

    metrics = {
        "n_train": int((~test_runs).sum()), "n_test": int(test_runs.sum()),
        "mae_by_horizon_K_before_peak": dict(zip([str(h) for h in HORIZONS], err[pre, :-1].mean(0).round(3).tolist())),
        "mae_Tmax_K_before_peak": float(err[pre, -1].mean()),
        "runaway_accuracy_by_lead_min": {
            ">10": float(hit[lead > 10].mean()), "5-10": float(hit[(lead > 5) & (lead <= 10)].mean()),
            "0-5": float(hit[(lead > 0) & (lead <= 5)].mean()), "after_peak": float(hit[lead <= 0].mean()),
        },
        "alarm_by_lead_min": {">10": rates(lead > 10), "5-10": rates((lead > 5) & (lead <= 10)),
                              "0-5": rates((lead > 0) & (lead <= 5))},
        "runaway_fraction": float(pos.mean()),
    }
    print(json.dumps(metrics, indent=1))

    meta = {"preset": PRESET, "time_scale": TIME_SCALE, "nominal": base, "window": WINDOW, "dt_window": DT_WIN, "horizons": HORIZONS, "deltaT_ad": dT_ad,
            "ranges": RANGES, "metrics": metrics}
    out = ROOT / "public" / "models" / "forecast-icq.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({**meta, "regressor": json.loads(json.dumps(d_reg)), "classifier": d_clf}), encoding="utf-8")
    write(d_reg, ROOT / "ml" / "data" / "forecast-reg.json")  # copia redondeada para inspección
    print("modelo:", out, f"{out.stat().st_size / 1024:.0f} KB")

    # Fixture de paridad TS ↔ Python (incluye la construcción de features desde mediciones crudas)
    op, tm, Tm, ct, cT = runs[-1]
    fx = {"op": op, "t": tm.tolist(), "T": Tm.tolist(), "cuts": [2.0, 6.5, 14.0],
          "features": [build_features(op, tm, Tm, tc).tolist() for tc in (2.0, 6.5, 14.0)]}
    fx["reg"] = predict(d_reg, np.array(fx["features"])).tolist()
    fx["clf"] = predict(d_clf, np.array(fx["features"])).tolist()
    (ROOT / "tests" / "engine" / "fixtures" / "ml" / "forecast-icq-samples.json").write_text(json.dumps(fx), encoding="utf-8")

    # Corridas de demostración para "En vivo": una segura, una al borde y una con runaway (de las de prueba)
    test_ids = range(int(0.85 * args.runs), args.runs)
    picks = {}
    for i in test_ids:
        op, tm, Tm, ct, cT = runs[i]
        rise = (cT.max() - max(op["T0"], op["T_cool"])) / dT_ad
        kind = "segura" if rise < 0.2 else "borde" if 0.4 < rise < 0.48 else "runaway" if 0.56 < rise < 0.75 else None
        if kind and kind not in picks and 8 < ct[np.argmax(cT)] < 45:
            picks[kind] = i
    live = ROOT / "public" / "data" / "live"
    live.mkdir(parents=True, exist_ok=True)
    titles = {"segura": "Corrida segura", "borde": "Corrida al borde", "runaway": "Corrida con runaway"}
    for kind, i in picks.items():
        op, tm, Tm, ct, cT = runs[i]
        keep = tm <= 60
        (live / f"{kind}.json").write_text(json.dumps({
            "id": kind, "title": titles[kind], "op": op,
            "measured": {"t": np.round(tm[keep], 4).tolist(), "T": np.round(Tm[keep], 3).tolist()},
            "clean": {"t": np.round(ct[ct <= 60][::4], 4).tolist(), "T": np.round(cT[ct <= 60][::4], 3).tolist()},
        }), encoding="utf-8")
    print("demos en vivo:", {k: int(v) for k, v in picks.items()})


if __name__ == "__main__":
    main()
