use glam::Vec3;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Core spatial types
// ---------------------------------------------------------------------------

/// A 3-D point from an incoming point cloud.
///
/// Serializes as `{"x": f32, "y": f32, "z": f32}` for human-readable JSON
/// on the wire, while `to_vec3()` hands off to glam for SIMD math.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Point {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Point {
    /// Convert to a `glam::Vec3` for SIMD-accelerated vector arithmetic.
    #[inline(always)]
    pub fn to_vec3(&self) -> Vec3 {
        Vec3::new(self.x, self.y, self.z)
    }
}

// ---------------------------------------------------------------------------
// Voxel — core world primitive
// ---------------------------------------------------------------------------

/// A single voxel in the 4D World Model.
///
/// `occupancy_history` is a u32 bitmask where bit 0 = most recent tick.
/// On each update the mask is shifted left by 1 and the new state is OR'd
/// into bit 0.  This gives a rolling 32-tick occupancy history at zero
/// heap cost.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Voxel {
    pub x: i32,
    pub y: i32,
    pub z: i32,
    /// true  = occupied this tick
    pub occupied: bool,
    /// Shannon entropy derived from occupancy_history [0.0, 1.0]
    pub entropy: f32,
    /// true when current state strongly deviates from historical probability
    pub anomaly: bool,
    /// Rolling 32-tick occupancy bitmask (bit 0 = latest)
    pub occupancy_history: u32,
    pub last_updated_seq: u64,
}

impl Voxel {
    pub fn new(x: i32, y: i32, z: i32, occupied: bool, seq: u64) -> Self {
        let history: u32 = if occupied { 1 } else { 0 };
        Self {
            x,
            y,
            z,
            occupied,
            entropy: 0.0,
            anomaly: false,
            occupancy_history: history,
            last_updated_seq: seq,
        }
    }
}

// ---------------------------------------------------------------------------
// Compact delta payload
// ---------------------------------------------------------------------------

/// Compact representation of a single changed voxel for delta responses.
/// Omits `occupancy_history` to minimise JSON payload size.
#[derive(Debug, Clone, Serialize)]
pub struct ChangedVoxel {
    /// Spatial hash key — integer sort is radix-efficient
    pub key: u64,
    pub x: i32,
    pub y: i32,
    pub z: i32,
    pub occupied: bool,
    pub entropy: f32,
    pub anomaly: bool,
    pub seq: u64,
}

impl ChangedVoxel {
    pub fn from_voxel(v: &Voxel) -> Self {
        Self {
            // Using the spatial_key utility from our spatial_hash module
            key: crate::spatial_hash::spatial_key(v.x, v.y, v.z),
            x: v.x, 
            y: v.y, 
            z: v.z,
            occupied: v.occupied,
            entropy: v.entropy,
            anomaly: v.anomaly,
            seq: v.last_updated_seq,
        }
    }
}

// ---------------------------------------------------------------------------
// API request / response types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct IngestRequest {
    pub points: Vec<Point>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeltaQuery {
    pub since: Option<u64>,
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

/// Compact delta — single `changed` array sorted by spatial key.
#[derive(Debug, Clone, Serialize)]
pub struct DeltaResponse {
    pub sequence_id: u64,
    /// All voxels with `last_updated_seq > since`, sorted by key ascending.
    pub changed: Vec<ChangedVoxel>,
}

/// Full snapshot including structural integrity score.
#[derive(Debug, Clone, Serialize)]
pub struct SnapshotResponse {
    pub sequence_id: u64,
    /// 1.0 = perfectly predictable world; 0.0 = maximum entropic chaos.
    pub structural_integrity: f64,
    pub voxels: Vec<Voxel>,
}
