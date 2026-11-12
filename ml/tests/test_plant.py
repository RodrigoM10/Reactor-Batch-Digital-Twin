import numpy as np

from reactor_ml.engine import simulate
from reactor_ml.plant import PlantConfig, load_preset, random_config, run_plant


def test_planta_ideal_sin_ruido_es_el_modelo():
    p = load_preset("runaway")
    run = run_plant(p, PlantConfig(sigma_T=0.0), t_end=40, rng=np.random.default_rng(0))
    ref = simulate(p, sample_times=run.measured["t"].to_numpy())
    np.testing.assert_allclose(run.measured["T"], ref.T, atol=1e-6)


def test_efectos_ocultos_cambian_la_trayectoria():
    p = load_preset("runaway")
    rng = np.random.default_rng(1)
    cfg = PlantConfig(sigma_T=0.0, deltaCp=10, k_d=0.01, UA_amb=30)
    run = run_plant(p, cfg, t_end=40, rng=rng)
    ref = simulate(p, sample_times=run.measured["t"].to_numpy())
    assert np.max(np.abs(run.measured["T"].to_numpy() - ref.T)) > 1.0


def test_muestras_de_X_y_formato_csv():
    p = load_preset("runaway")
    run = run_plant(p, PlantConfig(dt_T=0.5, dt_X=5), t_end=40, rng=np.random.default_rng(2))
    df = run.measured
    assert list(df.columns) == ["t", "T", "X"]
    assert df["X"].notna().sum() == 9  # t = 0, 5, …, 40
    assert df["T"].notna().all()


def test_configuracion_aleatoria_reproducible():
    a = random_config(np.random.default_rng(7))
    b = random_config(np.random.default_rng(7))
    assert a == b and a.k_d > 0
