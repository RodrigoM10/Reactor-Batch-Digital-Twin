"use client";

import { create } from "zustand";
import { DEFAULT_PRESET, PRESETS, type ReactorParams } from "@/engine";

interface ReactorStore {
  params: ReactorParams;
  presetId: string | null;
  update: (fn: (draft: ReactorParams) => void) => void;
  loadPreset: (id: string) => void;
  replace: (params: ReactorParams) => void;
}

export const useReactorStore = create<ReactorStore>((set) => ({
  params: structuredClone(DEFAULT_PRESET.params),
  presetId: DEFAULT_PRESET.id,
  update: (fn) =>
    set((s) => {
      const draft = structuredClone(s.params);
      fn(draft);
      return { params: draft, presetId: null };
    }),
  loadPreset: (id) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (preset) set({ params: structuredClone(preset.params), presetId: id });
  },
  replace: (params) => set({ params, presetId: null }),
}));
