/**
 * Red neuronal densa (MLP) entrenada en Python y exportada a JSON (ml/reactor_ml/mlp_export.py).
 * Se evalúa en TypeScript de forma síncrona: sirve dentro del integrador (modelo híbrido) y para
 * miles de predicciones por segundo (mapa de riesgo) sin cargar runtimes externos.
 */

export interface MlpJson {
  output?: "identity" | "logistic"; // logística: clasificador binario (probabilidad)
  activation: "tanh" | "relu";
  x_mean: number[];
  x_std: number[];
  y_mean: number | number[]; // escalar o uno por salida
  y_scale: number | number[];
  layers: { W: number[][]; b: number[] }[]; // W: [entrada][salida]
}

export interface Mlp {
  nIn: number;
  nOut: number;
  /** Predice para una entrada; reutiliza buffers internos (no es reentrante). */
  predict: (x: ArrayLike<number>) => Float64Array;
}

export function loadMlp(d: MlpJson): Mlp {
  const layers = d.layers.map((l) => {
    const nIn = l.W.length;
    const nOut = l.b.length;
    const W = new Float64Array(nIn * nOut); // fila-mayor por salida para recorrer contiguo
    for (let i = 0; i < nIn; i++) for (let o = 0; o < nOut; o++) W[o * nIn + i] = l.W[i][o];
    return { nIn, nOut, W, b: Float64Array.from(l.b), out: new Float64Array(nOut) };
  });
  const xm = Float64Array.from(d.x_mean);
  const xs = Float64Array.from(d.x_std);
  const nIn = xm.length;
  const input = new Float64Array(nIn);
  const tanh = d.activation === "tanh";
  const last = layers.length - 1;
  const result = new Float64Array(layers[last].nOut);
  const logistic = d.output === "logistic";
  const nOut = layers[last].nOut;
  const ym = Float64Array.from({ length: nOut }, (_, o) => (Array.isArray(d.y_mean) ? d.y_mean[o] : d.y_mean));
  const ys = Float64Array.from({ length: nOut }, (_, o) => (Array.isArray(d.y_scale) ? d.y_scale[o] : d.y_scale));

  return {
    nIn,
    nOut: layers[last].nOut,
    predict(x) {
      for (let i = 0; i < nIn; i++) input[i] = (x[i] - xm[i]) / xs[i];
      let h: Float64Array = input;
      layers.forEach((L, li) => {
        for (let o = 0; o < L.nOut; o++) {
          let s = L.b[o];
          const row = o * L.nIn;
          for (let i = 0; i < L.nIn; i++) s += L.W[row + i] * h[i];
          L.out[o] = li === last ? s : tanh ? Math.tanh(s) : s > 0 ? s : 0;
        }
        h = L.out;
      });
      for (let o = 0; o < result.length; o++) {
        const v = logistic ? 1 / (1 + Math.exp(-h[o])) : h[o];
        result[o] = ym[o] + ys[o] * v;
      }
      return result;
    },
  };
}
