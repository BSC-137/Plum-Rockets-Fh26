import { create } from 'zustand';
import { Voxel, VoxelsResponse, DeltaResponse } from './types';

const API_BASE = "http://localhost:3000/api";

// Top-tier helper: Create a unique string key from coordinates.
// This is more reliable in JS than bit-shifted u64s.
const getVoxelKey = (v: { x: number; y: number; z: number }) => `${v.x}:${v.y}:${v.z}`;

interface WorldState {
  voxels: Map<string, Voxel>;
  voxelsArray: Voxel[];
  count: number;
  sequenceId: number;
  fetchInitial: () => Promise<void>;
  pollDeltas: () => Promise<void>;
}

export const useWorldStore = create<WorldState>((set, get) => ({
  voxels: new Map(),
  voxelsArray: [],
  count: 0,
  sequenceId: 0,

  fetchInitial: async () => {
    try {
      const res = await fetch(`${API_BASE}/world/voxels`);
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      
      const data: VoxelsResponse = await res.json();
      const voxelMap = new Map<string, Voxel>();
      
      data.voxels.forEach(v => {
        // Generate key manually since the base Voxel struct doesn't have it
        const key = getVoxelKey(v);
        voxelMap.set(key, { ...v, key }); // Inject key into the object
      });
      
      const array = Array.from(voxelMap.values());
      
      set({ 
        voxels: voxelMap, 
        voxelsArray: array,
        count: array.length,
        sequenceId: data.sequence_id 
      });
      console.log(`✅ Initial Sync: ${array.length} voxels`);
    } catch (e) { 
      console.error("❌ Initial Sync Failed:", e); 
    }
  },

  pollDeltas: async () => {
    const { sequenceId, voxels } = get();
    try {
      const res = await fetch(`${API_BASE}/world/delta?since=${sequenceId}`);
      if (!res.ok) return;
      
      const data: DeltaResponse = await res.json();
      
      if (data.changed.length > 0) {
        const newMap = new Map(voxels);
        
        data.changed.forEach(v => {
          const key = getVoxelKey(v);
          newMap.set(key, { ...v, key });
        });
        
        const array = Array.from(newMap.values());
        
        set({ 
          voxels: newMap, 
          voxelsArray: array,
          count: array.length,
          sequenceId: data.sequence_id 
        });
      }
    } catch (e) {
      console.warn("⚠️ Telemetry Dropout");
    }
  }
}));