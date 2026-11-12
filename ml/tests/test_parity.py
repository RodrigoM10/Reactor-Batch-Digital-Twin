"""Paridad entre el motor TypeScript (fuente de verdad de la app) y su espejo en Python.

Los fixtures se exportan desde Vitest: EXPORT_FIXTURES=1 npx vitest run tests/engine/v2-fixtures.test.ts
"""

import json
from pathlib import Path

import numpy as np
import pytest

from reactor_ml.engine import simulate

FIXTURES = sorted((Path(__file__).resolve().parents[2] / "tests" / "engine" / "fixtures" / "v2").glob("*.json"))


@pytest.mark.parametrize("path", FIXTURES, ids=[p.stem for p in FIXTURES])
def test_trayectoria_igual_a_typescript(path):
    fx = json.loads(path.read_text(encoding="utf-8"))
    r = simulate(fx["params"], sample_times=np.array(fx["t"]))
    np.testing.assert_allclose(r.X, fx["X"], atol=1e-6)
    np.testing.assert_allclose(r.T, fx["T"], atol=1e-4)


def test_evento_de_conversion_objetivo():
    fx = json.loads(next(p for p in FIXTURES if p.stem == "conversion_objetivo").read_text(encoding="utf-8"))
    r = simulate(fx["params"])
    assert r.t_end == pytest.approx(fx["t_end"], rel=1e-6)
    assert r.X[-1] == pytest.approx(fx["params"]["stop"]["X_target"], abs=1e-8)
