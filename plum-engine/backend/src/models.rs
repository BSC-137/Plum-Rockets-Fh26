use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Voxel {
    pub id: String,
    pub x: i32,
    pub y: i32,
    pub z: i32,
    pub occupied: bool,
    pub entropy: f32,
    pub last_updated_seq: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PingResponse {
    pub ok: bool,
    pub service: String,
    pub sequence_id: u64,
    pub voxel_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct VoxelsResponse {
    pub sequence_id: u64,
    pub voxels: Vec<Voxel>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeltaResponse {
    pub sequence_id: u64,
    pub added: Vec<Voxel>,
    pub updated: Vec<Voxel>,
    pub removed: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeltaQuery {
    pub since: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SnapshotResponse {
    pub sequence_id: u64,
    pub voxels: Vec<Voxel>,
}
