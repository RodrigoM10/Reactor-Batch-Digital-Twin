"""Genera corridas de la planta virtual y el ajuste de referencia de SciPy para validar src/engine/fit.ts.

    ml/.venv/Scripts/python -B ml/scripts/make_fit_fixtures.py

Escribe tests/engine/fixtures/fit/<caso>.csv (mediciones) y <caso>.json (configuración, verdad y ajuste SciPy).
También copia corridas de ejemplo a public/data/plant/ para la pestaña "Calibrar con datos".
"""

import copy
import json
import sys
from dataclasses import asdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml"))

from reactor_ml.fit import fit, to_theta  # noqa: E402
from reactor_ml.plant import PlantConfig, load_preset, random_config, run_plant, write_run  # noqa: E402
from reactor_ml.plant import true_params as true_params_of  # noqa: E402


def isothermal_variant():
    p = load_preset("adiabatica")
    p["energy"]["mode"] = "isothermal"
    p["energy"]["T0"] = 320
    return p


CASES = {
    "icq_ideal": dict(
        nominal=load_preset("runaway"),
        cfg=PlantConfig(A_factor=1.4, dE=300, UA_factor=0.9, sigma_T=0.2, dt_T=0.4),
        t_end=40, names=["k", "E", "UA"], sigma_T=0.2, sigma_X=0.02,
    ),
    "adiabatica_deltaH": dict(
        nominal=load_preset("adiabatica"),
        cfg=PlantConfig(A_factor=0.7, dE=-200, dDeltaH=-1200, sigma_T=0.2, dt_T=0.1),
        t_end=12, names=["k", "E", "deltaH"], sigma_T=0.2, sigma_X=0.02,
    ),
    "isotermica_X": dict(
        nominal=isothermal_variant(),
        cfg=PlantConfig(A_factor=1.6, sigma_X=0.01, dt_X=1.0, dt_T=1.0),
        t_end=40, names=["k"], sigma_T=0.2, sigma_X=0.01,
    ),
}


def main():
    out = ROOT / "tests" / "engine" / "fixtures" / "fit"
    out.mkdir(parents=True, exist_ok=True)
    for name, c in CASES.items():
        rng = np.random.default_rng(42)
        run = run_plant(c["nominal"], c["cfg"], c["t_end"], rng)
        write_run(run, out / f"{name}.csv")
        df = run.measured
        res = fit(c["nominal"], df["t"].to_numpy(), df["T"].to_numpy(), df["X"].to_numpy(), c["names"],
                  c["sigma_T"], c["sigma_X"])
        true_theta = to_theta(run.true, c["names"])
        true_vals = [float(np.exp(v)) if n in ("k", "UA") else float(v * 1e4) for n, v in zip(c["names"], true_theta)]
        (out / f"{name}.json").write_text(json.dumps({
            "case": name,
            "nominal": c["nominal"],
            "fitParams": c["names"],
            "sigmaT": c["sigma_T"],
            "sigmaX": c["sigma_X"],
            "truth": dict(zip(c["names"], true_vals)),
            "scipy": {"values": res["values"], "std": res["std"], "chi2red": res["chi2red"]},
        }, indent=1), encoding="utf-8")
        print(f"{name:20s} verdad={np.round(true_vals, 4)}  scipy={np.round(res['values'], 4)} ± {np.round(res['std'], 4)}")

    # Corridas de ejemplo para la UI: planta "realista" (con efectos fuera del modelo)
    demo = ROOT / "public" / "data" / "plant"
    nominal = load_preset("runaway")
    k_nom = to_theta(nominal, ["k"])[0]
    seed, made = 0, 0
    while made < 2:
        rng = np.random.default_rng(seed)
        seed += 1
        cfg = random_config(rng, "realista")
        # Se eligen realizaciones con cinética parecida a la nominal (|Δ ln k| < 0.35) para que la demo sea legible.
        if abs(to_theta(true_params_of(nominal, cfg), ["k"])[0] - k_nom) > 0.35:
            continue
        cfg.dt_T, cfg.sigma_T = 0.25, 0.3
        run = run_plant(nominal, cfg, 40, rng)
        made += 1
        write_run(run, demo / f"corrida-icq-{made}.csv")
        print(f"ejemplo realista {made}: semilla {seed - 1}")
    run = run_plant(copy.deepcopy(CASES["icq_ideal"]["nominal"]), CASES["icq_ideal"]["cfg"], 40, np.random.default_rng(42))
    write_run(run, demo / "corrida-icq-ideal.csv")
    print("ejemplos en", demo)


if __name__ == "__main__":
    main()
