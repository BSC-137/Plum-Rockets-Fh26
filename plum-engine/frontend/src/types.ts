export interface Voxel {
  key: string; // We treat u64 as string in JS to avoid precision loss
  x: number;
  y: number;
  z: number;
  occupied: boolean;
  entropy: number;
  anomaly: boolean;
  seq: number;
}

export interface DeltaResponse {
  sequence_id: number;
  changed: Voxel[];
}

export interface VoxelsResponse {
  sequence_id: number;
  voxels: Voxel[];
}