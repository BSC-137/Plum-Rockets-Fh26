export interface Voxel {
  x: number;
  y: number;
  z: number;
  occupied: boolean;
  entropy: number;
  anomaly: boolean;
  occupancy_history: number;
  last_updated_seq: number;
}

export interface DeltaVoxel {
  key: number;
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
  changed: DeltaVoxel[];
}

export interface VoxelsResponse {
  sequence_id: number;
  voxels: Voxel[];
}

export interface SnapshotResponse {
  sequence_id: number;
  structural_integrity: number;
  voxels: Voxel[];
}

export interface UploadDatasetResponse {
  ok: boolean;
  file_name: string;
  format: string;
  bytes_received: number;
  message: string;
}
