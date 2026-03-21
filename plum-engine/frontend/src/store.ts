import { create } from 'zustand';
import type { Voxel, VoxelsResponse } from './types';

const API_BASE = 'http://localhost:3000/api';

export type ViewMode = 'LIVE' | 'TEMPORAL_HINDSIGHT';

export interface EngineMetrics {
  VOXEL_COUNT: number;
  SEQ_ID: number;
  LATEST_SIGNAL: number | null;
}

export interface HistoryEntry {
  tick: number;
  integrity: number;
  meanEntropy: number;
  entropySlope: number;
  anomalyCount: number;
  voxelCount: number;
}

const clampTickOffset = (tickOffset: number) => Math.max(0, Math.min(31, tickOffset));

const computeStructuralHealth = (voxels: Voxel[]) => {
  if (voxels.length === 0) return 1;
  const averageEntropy = voxels.reduce((sum, voxel) => sum + voxel.entropy, 0) / voxels.length;
  return Math.max(0, Math.min(1, 1 - averageEntropy));
};

const computeMeanEntropy = (voxels: Voxel[]) => {
  if (voxels.length === 0) return 0;
  return voxels.reduce((sum, voxel) => sum + voxel.entropy, 0) / voxels.length;
};

const computeAnomalyCount = (voxels: Voxel[]) => voxels.reduce((sum, voxel) => sum + (voxel.anomaly ? 1 : 0), 0);

const buildIngestPayload = (voxels: Voxel[]) => ({
  points: voxels
    .filter((voxel) => voxel.occupied)
    .map(({ x, y, z }) => ({ x, y, z })),
});

const formatLogTimestamp = () =>
  new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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
  isUploading: boolean;
  uploadProgress: number;
  auditLogs: string[];
  queuedFileName: string;
  history: any[];
  isReportOpen: boolean;
  pollDeltas: () => Promise<void>;
  setUploadStatus: (status: string) => void;
  setQueuedFileName: (fileName: string) => void;
  setUploadProgress: (progress: number) => void;
  setIsUploading: (uploading: boolean) => void;
  pushLog: (message: string) => void;
  toggleReport: (open: boolean) => void;
  syncWorld: () => Promise<void>;
  setMode: (mode: ViewMode) => void;
  setTickOffset: (tickOffset: number) => void;
  resetVolumetrics: () => Promise<void>;
  ingestLastData: () => Promise<void>;
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
  isUploading: false,
  uploadProgress: 0,
  auditLogs: [],
  queuedFileName: 'NONE',
  history: [],
  isReportOpen: false,

  async pollDeltas() {
    try {
      const response = await fetch(`${API_BASE}/world/voxels`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload: VoxelsResponse = await response.json();
      const latestSignal = Date.now();
      const voxelCount = payload.voxels.length;
      const meanEntropy = computeMeanEntropy(payload.voxels);
      const anomalyCount = computeAnomalyCount(payload.voxels);
      const integrity = computeStructuralHealth(payload.voxels);

      set((state) => {
        const sequenceUnchanged =
          state.metrics.SEQ_ID === payload.sequence_id && state.voxels.length === payload.voxels.length;

        if (sequenceUnchanged) {
          return {
            metrics: {
              ...state.metrics,
              LATEST_SIGNAL: latestSignal,
            },
          };
        }

        const previousEntry = state.history[state.history.length - 1] as HistoryEntry | undefined;
        const deltaTicks = previousEntry ? Math.max(1, payload.sequence_id - previousEntry.tick) : 1;
        const previousMeanEntropy = previousEntry?.meanEntropy ?? meanEntropy;
        const entropySlope = (meanEntropy - previousMeanEntropy) / deltaTicks;

        const nextEntry: HistoryEntry = {
          tick: payload.sequence_id,
          integrity,
          meanEntropy,
          entropySlope,
          anomalyCount,
          voxelCount,
        };

        return {
          voxels: payload.voxels,
          structuralHealth: integrity,
          metrics: {
            VOXEL_COUNT: voxelCount,
            SEQ_ID: payload.sequence_id,
            LATEST_SIGNAL: latestSignal,
          },
          history: [...state.history, nextEntry].slice(-50),
        };
      });
    } catch (error) {
      console.warn('World delta polling failed', error);
    }
  },

  setUploadStatus(status) {
    set({ uploadStatus: status });
  },

  setQueuedFileName(fileName) {
    set({ queuedFileName: fileName });
  },

  setUploadProgress(progress) {
    const normalized = Math.max(0, Math.min(100, progress));
    set({ uploadProgress: normalized });
  },

  setIsUploading(uploading) {
    set({ isUploading: uploading });
  },

  pushLog(message) {
    const entry = `[${formatLogTimestamp()}] ${message}`;
    set((state) => ({ auditLogs: [...state.auditLogs.slice(-39), entry] }));
  },

  toggleReport(open) {
    set({ isReportOpen: open });
  },

  async syncWorld() {
    await get().pollDeltas();
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
}));
