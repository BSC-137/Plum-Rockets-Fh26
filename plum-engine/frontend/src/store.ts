import { create } from 'zustand';
import type { UploadDatasetResponse, Voxel, VoxelsResponse } from './types';

const API_BASE = 'http://localhost:3000/api';

export type ViewMode = 'LIVE' | 'TEMPORAL_HINDSIGHT';

export interface EngineMetrics {
  VOXEL_COUNT: number;
  SEQ_ID: number;
  LATEST_SIGNAL: number | null;
}

const clampTickOffset = (tickOffset: number) => Math.max(0, Math.min(31, tickOffset));

const computeStructuralHealth = (voxels: Voxel[]) => {
  if (voxels.length === 0) return 1;
  const averageEntropy = voxels.reduce((sum, voxel) => sum + voxel.entropy, 0) / voxels.length;
  return Math.max(0, Math.min(1, 1 - averageEntropy));
};

const buildIngestPayload = (voxels: Voxel[]) => ({
  points: voxels
    .filter((voxel) => voxel.occupied)
    .map(({ x, y, z }) => ({ x, y, z })),
});

export const getVoxelVisibility = (history: number, tickOffset: number): 0 | 1 => {
  const safeTickOffset = clampTickOffset(tickOffset);
  return ((history >>> safeTickOffset) & 1) as 0 | 1;
};

interface WorldState {
  voxels: Voxel[];
  metrics: EngineMetrics;
  mode: ViewMode;
  tickOffset: number;
  structuralHealth: number;
  uploadStatus: string;
  uploadInFlight: boolean;
  syncWorld: () => Promise<void>;
  setMode: (mode: ViewMode) => void;
  setTickOffset: (tickOffset: number) => void;
  resetVolumetrics: () => Promise<void>;
  ingestLastData: () => Promise<void>;
  uploadDataset: (file: File) => Promise<UploadDatasetResponse | null>;
}

export const useWorldStore = create<WorldState>((set, get) => ({
  voxels: [],
  metrics: {
    VOXEL_COUNT: 0,
    SEQ_ID: 0,
    LATEST_SIGNAL: null,
  },
  mode: 'LIVE',
  tickOffset: 0,
  structuralHealth: 1,
  uploadStatus: 'EXPECT_DATASET',
  uploadInFlight: false,

  async syncWorld() {
    try {
      const response = await fetch(`${API_BASE}/world/voxels`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload: VoxelsResponse = await response.json();
      const structuralHealth = computeStructuralHealth(payload.voxels);
      const latestSignal = Date.now();

      set((state) => {
        if (state.metrics.SEQ_ID === payload.sequence_id && state.voxels.length === payload.voxels.length) {
          return {
            metrics: {
              ...state.metrics,
              LATEST_SIGNAL: latestSignal,
            },
          };
        }

        return {
          voxels: payload.voxels,
          structuralHealth,
          metrics: {
            VOXEL_COUNT: payload.voxels.length,
            SEQ_ID: payload.sequence_id,
            LATEST_SIGNAL: latestSignal,
          },
        };
      });
    } catch (error) {
      console.warn('World sync failed', error);
    }
  },

  setMode(mode) {
    set((state) => ({
      mode,
      tickOffset: mode === 'LIVE' ? 0 : clampTickOffset(state.tickOffset || 1),
    }));
  },

  setTickOffset(tickOffset) {
    const safeTickOffset = clampTickOffset(tickOffset);
    set({
      tickOffset: safeTickOffset,
      mode: safeTickOffset === 0 ? 'LIVE' : 'TEMPORAL_HINDSIGHT',
    });
  },

  async resetVolumetrics() {
    set({ mode: 'LIVE', tickOffset: 0 });
    await get().syncWorld();
  },

  async ingestLastData() {
    const { voxels, syncWorld } = get();

    try {
      const response = await fetch(`${API_BASE}/world/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildIngestPayload(voxels)),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await syncWorld();
    } catch (error) {
      console.warn('Data ingest failed', error);
    }
  },

  async uploadDataset(file) {
    const formData = new FormData();
    formData.append('dataset', file);
    formData.append('format', file.name.split('.').pop()?.toLowerCase() ?? 'unknown');

    set({
      uploadInFlight: true,
      uploadStatus: `UPLINKING_${file.name.toUpperCase()}`,
    });

    try {
      const response = await fetch(`${API_BASE}/world/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload: UploadDatasetResponse = await response.json();
      set({
        uploadInFlight: false,
        uploadStatus: `QUEUED_${payload.format.toUpperCase()}`,
      });
      return payload;
    } catch (error) {
      console.warn('Dataset upload failed', error);
      set({
        uploadInFlight: false,
        uploadStatus: 'UPLOAD_FAULT',
      });
      return null;
    }
  },
}));
