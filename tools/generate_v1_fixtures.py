"""Genera casos de referencia corriendo el motor original de la tesis (v1).

Uso (desde la raíz de Batch-Reactor-Twin, con el .venv de la v1):

    ../Batch-Reactor-Simulate/.venv/Scripts/python -B tools/generate_v1_fixtures.py ../Batch-Reactor-Simulate

`-B` evita escribir .pyc dentro del repo de la v1 (ahí están versionados).

Solo importa y ejecuta `SimulateBR.SimulateBatchReactor.simulate_batch_reactor`: no modifica la v1.
Escribe tests/engine/fixtures/v1/<caso>.json con los parámetros (formato v1) y la respuesta.
"""

import contextlib
import io
import json
import sys
import time
from pathlib import Path

V1_KEYS = [
    "mode_op", "k_eq_method", "K_eq_direct", "K_det", "T_iso", "A", "E", "option", "X_A_desired",
    "t_reaction_det", "C_A0", "C_B0", "C_C0", "C_D0", "C_I", "order", "reversible", "stoichiometry",
    "excess_B", "ans_volume", "P_k", "t_mcd", "product_k", "m_k", "T_ref", "T0", "K_eq_ref",
    "delta_H_rxn", "DG_dict", "C_p_dict", "mode_energy", "U", "A_ICQ", "T_cool", "m_c", "Cp_ref",
]


def params(**kw):
    p = {k: None for k in V1_KEYS}
    p.update({"C_A0": 0, "C_B0": 0, "C_C0": 0, "C_D0": 0, "C_I": 0, "excess_B": False, "ans_volume": "n"})
    p.update(kw)
    return p


ISO = dict(mode_op="isothermal", k_eq_method="direct", T_iso=350)
NONISO = dict(mode_op="non-isothermal", k_eq_method="direct", T_ref=298)

# expected: "match" (debe coincidir) o "divergent" (diferencia documentada, con el motivo)
CASES = {
    "iso_1er_orden_tiempo": dict(
        expected="match",
        params=params(**ISO, K_det=0.1, option="T", t_reaction_det=40, C_A0=2,
                      order=1, reversible=False, stoichiometry={"A": -1, "B": 1}),
    ),
    "iso_2do_orden_conversion": dict(
        expected="match",
        params=params(**ISO, K_det=0.05, option="X", X_A_desired=0.85, C_A0=2, C_B0=3,
                      order=2, reversible=False, stoichiometry={"A": -1, "B": -1, "C": 1, "D": 1}),
    ),
    "iso_exceso_B_arrhenius": dict(
        expected="divergent",
        reason="F10: la v1 integra con la tolerancia por defecto de solve_ivp (rtol = 1e-3) y se aparta ~5e-3 "
               "de la solución exacta X = 1 − e^(−k·C_B0·t); la v2 coincide con la analítica.",
        params=params(**ISO, A=3.0e6, E=12000, option="T", t_reaction_det=60, C_A0=1, C_B0=15,
                      order=2, excess_B=True, reversible=False, stoichiometry={"A": -1, "B": -1, "C": 1},
                      ans_volume="s", P_k=0.5, t_mcd=20, product_k="C", m_k=60),
    ),
    "iso_2do_orden_solo_A": dict(
        expected="match",
        params=params(**ISO, K_det=0.2, option="T", t_reaction_det=30, C_A0=1.5,
                      order=2, reversible=False, stoichiometry={"A": -1, "C": 1}),
    ),
    "tesis_sim_params": dict(
        expected="divergent",
        reason="F1: en reaction_rate las concentraciones de productos usan ν_C/ν_A sin abs(), así que el "
               "término inverso tiene el signo cambiado; la v1 solo se frena por el recorte en X_eq.",
        params=None,  # se carga de SimulateBR/sim_params.json
    ),
    "adiabatica_1er_orden": dict(
        expected="match",
        params=params(**NONISO, A=4.3e9, E=15000, C_A0=2, C_I=20, order=1, reversible=False,
                      stoichiometry={"A": -1, "B": 1}, T0=300, delta_H_rxn=-10000,
                      C_p_dict={"A": 30, "B": 30, "I": 18}, mode_energy="adiabatic"),
    ),
    "icq_2do_orden": dict(
        expected="match",
        params=params(**NONISO, A=2.0e10, E=16000, C_A0=2, C_B0=2.5, C_I=25, order=2, reversible=False,
                      stoichiometry={"A": -1, "B": -1, "C": 1}, T0=305, delta_H_rxn=-18000,
                      C_p_dict={"A": 35, "B": 30, "C": 50, "I": 18}, mode_energy="icq",
                      U=300, A_ICQ=2, T_cool=295, m_c=2, Cp_ref=1000),
    ),
    "icq_reversible_vant_hoff": dict(
        expected="divergent",
        reason="F2/F4: para A ⇌ B la v1 no tiene término inverso (usa C_C·C_D, que vale 0) y, al llegar a X_eq(T) la v1 devuelve [0, 0] y "
               "congela también la temperatura aunque el intercambiador siga enfriando.",
        params=params(mode_op="non-isothermal", k_eq_method="vant_hoff", A=5e7, E=13000, C_A0=1, C_I=10, order=1,
                      reversible=True, stoichiometry={"A": -1, "B": 1}, T0=330, T_ref=298, K_eq_ref=50,
                      delta_H_rxn=-20000, C_p_dict={"A": 50, "B": 50, "I": 18}, mode_energy="icq",
                      U=100, A_ICQ=1, T_cool=320, m_c=1, Cp_ref=1000),
    ),
}


def main():
    v1_root = Path(sys.argv[1] if len(sys.argv) > 1 else "../Batch-Reactor-Simulate").resolve()
    sys.path.insert(0, str(v1_root))
    from SimulateBR.SimulateBatchReactor import simulate_batch_reactor  # noqa: E402

    out_dir = Path(__file__).resolve().parent.parent / "tests" / "engine" / "fixtures" / "v1"
    out_dir.mkdir(parents=True, exist_ok=True)

    for name, case in CASES.items():
        p = case["params"]
        if p is None:
            p = json.loads((v1_root / "SimulateBR" / "sim_params.json").read_text(encoding="utf-8"))
        start = time.perf_counter()
        with contextlib.redirect_stdout(io.StringIO()):
            result = simulate_batch_reactor(dict(p))
        elapsed = time.perf_counter() - start
        fixture = {
            "case": name,
            "expected": case["expected"],
            "reason": case.get("reason"),
            "v1_elapsed_s": round(elapsed, 4),
            "params": p,
            "result": result,
        }
        (out_dir / f"{name}.json").write_text(json.dumps(fixture, indent=1, default=float), encoding="utf-8")
        print(f"{name:32s} success={result['success']}  {elapsed:7.3f} s")


if __name__ == "__main__":
    main()
