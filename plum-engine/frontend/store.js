import { create } from 'zustand';

export const useStore = create((set) => ({
  sequenceId: 0,
  signalIntegrity: "100%",
  voxelsActive: 0,
  entropy: 0.142,
  setTelemetry: (data) => set((state) => ({ ...state, ...data })),
}));