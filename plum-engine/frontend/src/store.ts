import { create } from 'zustand';
import type { DeltaResponse, Voxel, VoxelsResponse } from './types';
import { generateGeminiAudit } from './utils/geminiAudit';

const API_BASE = 'http://localhost:3000/api';
const REPORT_CACHE_KEY = 'plum_engine_cached_reports_v1';
const SCANLINE_DURATION_MS = 2000;

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
  anomalyDensity: number;
  volatilityIndex: number;
  saturationVelocity: number;
  newAnomalyCount: number;
  shannonEntropyCoefficient: number;
  sectorMapping: {
    denseClusters: number;
    sparseNoise: number;
  };
  volatileVoxels: Array<{
    key: string;
    x: number;
    y: number;
    z: number;
    entropy: number;
    volatilityScore: number;
    sector: 'DENSE_CLUSTER' | 'SPARSE_NOISE';
  }>;
  anomalyKeys: string[];
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
const computeXBounds = (voxels: Voxel[]) => {
  if (voxels.length === 0) return { minX: 0, maxX: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (const voxel of voxels) {
    if (voxel.x < minX) minX = voxel.x;
    if (voxel.x > maxX) maxX = voxel.x;
  }
  return { minX, maxX };
};

const buildVoxelKey = (voxel: Pick<Voxel, 'x' | 'y' | 'z'>) => `${voxel.x}:${voxel.y}:${voxel.z}`;
const buildVoxelKeyFromCoords = (x: number, y: number, z: number) => `${x}:${y}:${z}`;

const advanceOccupancyHistory = (history: number, occupied: boolean, seqDelta: number) => {
  if (seqDelta <= 0) return history >>> 0;
  const shift = Math.max(1, Math.min(32, seqDelta));
  const shifted = shift >= 32 ? 0 : (history << shift) >>> 0;
  return (shifted | (occupied ? 1 : 0)) >>> 0;
};

const buildVoxelIndex = (voxels: Voxel[]) =>
  voxels.reduce<Record<string, number>>((acc, voxel, index) => {
    acc[buildVoxelKey(voxel)] = index;
    return acc;
  }, {});

const popCount32 = (value: number) => {
  let x = value >>> 0;
  let count = 0;
  while (x !== 0) {
    x &= x - 1;
    count += 1;
  }
  return count;
};

const variance = (values: number[]) => {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squaredDistance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return squaredDistance / values.length;
};

const clusterAnomalies = (anomalies: Voxel[]) => {
  const radiusSquared = 2.25;

  return anomalies.map((voxel) => {
    let neighbors = 0;
    for (const other of anomalies) {
      if (voxel === other) continue;
      const dx = voxel.x - other.x;
      const dy = voxel.y - other.y;
      const dz = voxel.z - other.z;
      if (dx * dx + dy * dy + dz * dz <= radiusSquared) {
        neighbors += 1;
      }
    }
    return {
      voxel,
      neighbors,
      sector: (neighbors >= 3 ? 'DENSE_CLUSTER' : 'SPARSE_NOISE') as 'DENSE_CLUSTER' | 'SPARSE_NOISE',
    };
  });
};

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

const loadCachedReports = (): Record<number, string> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(REPORT_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.entries(parsed).reduce<Record<number, string>>((acc, [key, value]) => {
      const tick = Number(key);
      if (Number.isFinite(tick) && typeof value === 'string') {
        acc[tick] = value;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
};

interface WorldState {
  voxels: Voxel[];
  voxelIndex: Record<string, number>;
  metrics: EngineMetrics;
  mode: ViewMode;
  tickOffset: number;
  scanlineStartMs: number | null;
  scanlineDurationMs: number;
  scanlineMinX: number;
  scanlineMaxX: number;
  structuralHealth: number;
  uploadStatus: string;
  isUploading: boolean;
  uploadProgress: number;
  auditLogs: string[];
  queuedFileName: string;
  history: HistoryEntry[];
  isReportOpen: boolean;
  reportAnalysis: string;
  reportLoading: boolean;
  cachedReports: Record<number, string>;
  pollDeltas: () => Promise<void>;
  generateAuditReport: () => Promise<void>;
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
  voxelIndex: {},
  metrics: {
    VOXEL_COUNT: 0,
    SEQ_ID: 0,
    LATEST_SIGNAL: null,
  },
  mode: 'LIVE',
  tickOffset: 0,
  scanlineStartMs: null,
  scanlineDurationMs: SCANLINE_DURATION_MS,
  scanlineMinX: 0,
  scanlineMaxX: 0,
  structuralHealth: 1,
  uploadStatus: 'EXPECT_DATASET',
  isUploading: false,
  uploadProgress: 0,
  auditLogs: [],
  queuedFileName: 'NONE',
  history: [],
  isReportOpen: false,
  reportAnalysis: 'Awaiting Gemini structural interpretation...',
  reportLoading: false,
  cachedReports: loadCachedReports(),

  async pollDeltas() {
    try {
      const since = get().metrics.SEQ_ID;
      const deltaResponse = await fetch(`${API_BASE}/world/delta?since=${since}`);
      if (!deltaResponse.ok) throw new Error(`HTTP ${deltaResponse.status}`);

      const deltaPayload: DeltaResponse = await deltaResponse.json();
      const shouldBootstrapFromSnapshot =
        get().voxels.length === 0 && deltaPayload.sequence_id === 0 && deltaPayload.changed.length === 0;

      let snapshotPayload: VoxelsResponse | null = null;
      if (shouldBootstrapFromSnapshot) {
        const snapshotResponse = await fetch(`${API_BASE}/world/voxels`);
        if (!snapshotResponse.ok) throw new Error(`HTTP ${snapshotResponse.status}`);
        snapshotPayload = await snapshotResponse.json();
      }

      const latestSignal = Date.now();

      set((state) => {
        const nextSequenceId = snapshotPayload?.sequence_id ?? deltaPayload.sequence_id;
        const sequenceUnchanged = state.metrics.SEQ_ID === nextSequenceId;
        const hasDeltaChanges = deltaPayload.changed.length > 0;
        const hasSnapshot = Boolean(snapshotPayload);

        if (!hasSnapshot && !hasDeltaChanges && sequenceUnchanged) {
          return {
            metrics: {
              ...state.metrics,
              LATEST_SIGNAL: latestSignal,
            },
          };
        }

        let nextVoxels = state.voxels;
        let nextVoxelIndex = state.voxelIndex;
        let nextScanlineStartMs = state.scanlineStartMs;
        let nextScanlineDurationMs = state.scanlineDurationMs;
        let nextScanlineMinX = state.scanlineMinX;
        let nextScanlineMaxX = state.scanlineMaxX;

        if (snapshotPayload) {
          nextVoxels = snapshotPayload.voxels;
          nextVoxelIndex = buildVoxelIndex(nextVoxels);
        } else if (hasDeltaChanges) {
          let workingVoxels = state.voxels;
          let workingIndex =
            Object.keys(state.voxelIndex).length === 0 && state.voxels.length > 0
              ? buildVoxelIndex(state.voxels)
              : state.voxelIndex;

          let voxelsCloned = false;
          let indexCloned = false;

          for (const changed of deltaPayload.changed) {
            const voxelKey = buildVoxelKeyFromCoords(changed.x, changed.y, changed.z);
            let index = workingIndex[voxelKey];

            if (index === undefined) {
              if (!voxelsCloned) {
                workingVoxels = state.voxels.slice();
                voxelsCloned = true;
              }
              if (!indexCloned) {
                workingIndex = { ...workingIndex };
                indexCloned = true;
              }

              index = workingVoxels.length;
              workingVoxels.push({
                x: changed.x,
                y: changed.y,
                z: changed.z,
                occupied: changed.occupied,
                entropy: changed.entropy,
                anomaly: changed.anomaly,
                occupancy_history: changed.occupied ? 1 : 0,
                last_updated_seq: changed.seq,
              });
              workingIndex[voxelKey] = index;
              continue;
            }

            const current = workingVoxels[index];
            const seqDelta = Math.max(1, changed.seq - current.last_updated_seq);
            const occupancyHistory = advanceOccupancyHistory(current.occupancy_history, changed.occupied, seqDelta);
            const hasChanged =
              current.occupied !== changed.occupied ||
              current.entropy !== changed.entropy ||
              current.anomaly !== changed.anomaly ||
              current.last_updated_seq !== changed.seq ||
              current.occupancy_history !== occupancyHistory;

            if (!hasChanged) continue;

            if (!voxelsCloned) {
              workingVoxels = state.voxels.slice();
              voxelsCloned = true;
            }

            workingVoxels[index] = {
              ...current,
              occupied: changed.occupied,
              entropy: changed.entropy,
              anomaly: changed.anomaly,
              occupancy_history: occupancyHistory,
              last_updated_seq: changed.seq,
            };
          }

          nextVoxels = workingVoxels;
          nextVoxelIndex = workingIndex;
        }

        const voxelCount = nextVoxels.length;
        if (voxelCount > state.voxels.length && voxelCount > 64) {
          const bounds = computeXBounds(nextVoxels);
          nextScanlineStartMs = latestSignal;
          nextScanlineDurationMs = SCANLINE_DURATION_MS;
          nextScanlineMinX = bounds.minX;
          nextScanlineMaxX = bounds.maxX;
        } else if (
          nextScanlineStartMs !== null &&
          latestSignal - nextScanlineStartMs > nextScanlineDurationMs + 120
        ) {
          nextScanlineStartMs = null;
        }

        const meanEntropy = computeMeanEntropy(nextVoxels);
        const anomalyCount = computeAnomalyCount(nextVoxels);
        const integrity = computeStructuralHealth(nextVoxels);
        const previousEntry = state.history[state.history.length - 1];
        const deltaTicks = previousEntry ? Math.max(1, nextSequenceId - previousEntry.tick) : 1;
        const previousMeanEntropy = previousEntry?.meanEntropy ?? meanEntropy;
        const entropySlope = (meanEntropy - previousMeanEntropy) / deltaTicks;
        const anomalyDensity = voxelCount === 0 ? 0 : anomalyCount / voxelCount;

        const anomalies = nextVoxels.filter((voxel) => voxel.anomaly);
        const clustered = clusterAnomalies(anomalies);
        const denseClusters = clustered.filter((item) => item.sector === 'DENSE_CLUSTER').length;
        const sparseNoise = clustered.length - denseClusters;

        const previousAnomalyKeys = new Set(previousEntry?.anomalyKeys ?? []);
        const anomalyKeys = anomalies.map((voxel) => buildVoxelKey(voxel));
        const newAnomalyCount = anomalyKeys.reduce(
          (sum, key) => sum + (previousAnomalyKeys.has(key) ? 0 : 1),
          0,
        );
        const saturationVelocity = newAnomalyCount / deltaTicks;

        const recentEntropy = [...state.history.slice(-9).map((entry) => entry.meanEntropy), meanEntropy];
        const volatilityIndex = variance(recentEntropy);

        const volatileVoxels = clustered
          .map((item) => {
            const occupancyTransitions = popCount32(
              (item.voxel.occupancy_history ^ (item.voxel.occupancy_history >>> 1)) & 0x7fffffff,
            );
            const volatilityScore =
              item.voxel.entropy * 0.7 + occupancyTransitions * 0.18 + (item.neighbors === 0 ? 0.25 : 0);
            return {
              key: buildVoxelKey(item.voxel),
              x: item.voxel.x,
              y: item.voxel.y,
              z: item.voxel.z,
              entropy: item.voxel.entropy,
              volatilityScore,
              sector: item.sector,
            };
          })
          .sort((a, b) => b.volatilityScore - a.volatilityScore)
          .slice(0, 20);

        const nextEntry: HistoryEntry = {
          tick: nextSequenceId,
          integrity,
          meanEntropy,
          entropySlope,
          anomalyCount,
          voxelCount,
          anomalyDensity,
          volatilityIndex,
          saturationVelocity,
          newAnomalyCount,
          shannonEntropyCoefficient: meanEntropy,
          sectorMapping: {
            denseClusters,
            sparseNoise,
          },
          volatileVoxels,
          anomalyKeys,
        };

        return {
          voxels: nextVoxels,
          voxelIndex: nextVoxelIndex,
          structuralHealth: integrity,
          scanlineStartMs: nextScanlineStartMs,
          scanlineDurationMs: nextScanlineDurationMs,
          scanlineMinX: nextScanlineMinX,
          scanlineMaxX: nextScanlineMaxX,
          metrics: {
            VOXEL_COUNT: voxelCount,
            SEQ_ID: nextSequenceId,
            LATEST_SIGNAL: latestSignal,
          },
          history: sequenceUnchanged ? state.history : [...state.history, nextEntry].slice(-50),
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

  async generateAuditReport() {
    const { history, cachedReports } = get();
    const latest = history[history.length - 1];

    if (!latest) {
      set({
        reportLoading: false,
        reportAnalysis: 'No telemetry history is available yet.',
      });
      return;
    }

    const currentSequenceId = latest.tick;
    const cached = cachedReports[currentSequenceId];
    if (cached) {
      set({
        reportLoading: false,
        reportAnalysis: cached,
      });
      return;
    }

    set({ reportLoading: true });
    try {
      const report = await generateGeminiAudit({ history, latest });
      const nextCache = {
        ...get().cachedReports,
        [currentSequenceId]: report,
      };
      set({
        reportAnalysis: report,
        reportLoading: false,
        cachedReports: nextCache,
      });

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify(nextCache));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Gemini error';
      set({
        reportLoading: false,
        reportAnalysis: `## EXECUTIVE SUMMARY\nGemini analysis failed: ${message}`,
      });
    }
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
