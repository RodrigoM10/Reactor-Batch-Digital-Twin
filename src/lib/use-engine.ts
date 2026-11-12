"use client";

import * as Comlink from "comlink";
import { useEffect, useRef, useState } from "react";
import type { ReactorParams } from "@/engine";
import type { EngineApi, EngineOutput } from "@/workers/engine.worker";

/** Worker propio para tareas puntuales (ajuste, pronóstico): se crea al montar y se termina al desmontar. */
export function useEngineWorker() {
  const apiRef = useRef<Comlink.Remote<EngineApi> | null>(null);
  useEffect(() => {
    const worker = new Worker(new URL("../workers/engine.worker.ts", import.meta.url), { type: "module" });
    apiRef.current = Comlink.wrap<EngineApi>(worker);
    return () => {
      worker.terminate();
      apiRef.current = null;
    };
  }, []);
  return apiRef;
}

/**
 * Corre el motor en un Web Worker cada vez que cambian los parámetros.
 * Si llegan cambios mientras calcula, solo se procesa el último (los intermedios se descartan).
 */
export function useEngine(params: ReactorParams) {
  const apiRef = useRef<Comlink.Remote<EngineApi> | null>(null);
  const busy = useRef(false);
  const queued = useRef<ReactorParams | null>(null);
  const [output, setOutput] = useState<EngineOutput | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/engine.worker.ts", import.meta.url), { type: "module" });
    apiRef.current = Comlink.wrap<EngineApi>(worker);
    return () => {
      worker.terminate();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    queued.current = params;
    const pump = async () => {
      const api = apiRef.current;
      if (!api || busy.current) return;
      busy.current = true;
      setPending(true);
      try {
        while (queued.current) {
          const next = queued.current;
          queued.current = null;
          const out = await api.run(next);
          if (!queued.current) setOutput(out);
        }
      } finally {
        busy.current = false;
        setPending(false);
      }
    };
    // El worker se crea en el primer efecto; si todavía no existe, esperamos un tick.
    const id = setTimeout(pump, apiRef.current ? 0 : 30);
    return () => clearTimeout(id);
  }, [params]);

  return { output, pending };
}
