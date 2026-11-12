"""Exporta un MLP (scikit-learn o PyTorch) a JSON para evaluarlo en TypeScript (src/engine/mlp.ts).

Formato:
{ "output": "identity" | "logistic", "activation": "tanh" | "relu", "x_mean": [...], "x_std": [...], "y_mean": float, "y_scale": float,
  "layers": [ { "W": [[in × out]], "b": [out] }, ... ] }   # la última capa es lineal
Predicción: y = y_mean + y_scale · f((x − x_mean)/x_std)
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np


def sklearn_mlp_to_dict(model, x_mean, x_std, y_mean=0.0, y_scale=1.0) -> dict:
    # MLPClassifier binario usa salida logística; MLPRegressor, identidad.
    out = "logistic" if getattr(model, "out_activation_", "identity") == "logistic" else "identity"
    return {
        "output": out,
        "activation": model.activation,
        "x_mean": np.asarray(x_mean, float).tolist(),
        "x_std": np.asarray(x_std, float).tolist(),
        "y_mean": np.asarray(y_mean, float).tolist(),
        "y_scale": np.asarray(y_scale, float).tolist(),
        "layers": [{"W": W.tolist(), "b": b.tolist()} for W, b in zip(model.coefs_, model.intercepts_)],
    }


def predict(d: dict, X: np.ndarray) -> np.ndarray:
    """Evaluación de referencia en NumPy (misma cuenta que mlp.ts)."""
    h = (np.asarray(X, float) - np.array(d["x_mean"])) / np.array(d["x_std"])
    act = np.tanh if d["activation"] == "tanh" else (lambda z: np.maximum(z, 0))
    for i, layer in enumerate(d["layers"]):
        h = h @ np.array(layer["W"]) + np.array(layer["b"])
        if i < len(d["layers"]) - 1:
            h = act(h)
    if d.get("output") == "logistic":
        h = 1 / (1 + np.exp(-h))
    out = h if h.shape[1] > 1 else h[:, 0]
    return np.asarray(d["y_mean"]) + np.asarray(d["y_scale"]) * out


def write(d: dict, path: Path, extra: dict | None = None, digits: int = 7) -> None:
    def rnd(x):
        if isinstance(x, float):
            return float(f"{x:.{digits}g}")
        if isinstance(x, list):
            return [rnd(v) for v in x]
        if isinstance(x, dict):
            return {k: rnd(v) for k, v in x.items()}
        return x

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({**(extra or {}), "mlp": rnd(d)}, separators=(",", ":")), encoding="utf-8")
