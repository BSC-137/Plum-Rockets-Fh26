use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use glam::Vec3;
use parking_lot::RwLock;

use crate::{
    models::{ChangedVoxel, DeltaResponse, Voxel},
    spatial_hash::{spatial_key, SpatialHash},
};

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

const MAX_HISTORY: usize = 50;
const INITIAL_CAPACITY: usize = 16384;
const ANOMALY_THRESHOLD: f32 = 0.4;
const INTEGRITY_BOOTSTRAP_SEQ: u64 = 30;
const ENTROPY_NOISE_FLOOR: f64 = 0.3;
const STRUCTURAL_OCCUPANCY_TICKS: u32 = 16;
const STRUCTURAL_STABILITY_WEIGHT: f64 = 0.5;
const BASELINE_MIN_VOXELS: usize = 256;
const MISSING_VOXEL_WEIGHT: f64 = 0.8;
const ENTROPY_DRIFT_WEIGHT: f64 = 0.2;

#[derive(Debug, Clone)]
struct BaselineLock {
    baseline_seq: u64,
    voxels: HashMap<u64, f32>,
}

#[derive(Debug, Clone)]
pub struct Snapshot {
    pub sequence_id: u64,
    pub structural_integrity: f64,
    pub voxels: Vec<Voxel>,
}

// ---------------------------------------------------------------------------
// WorldModel
// ---------------------------------------------------------------------------

pub struct WorldModel {
    /// Atomic sequence allows &self ingestion (no global write lock needed)
    sequence_id: AtomicU64,
    voxels: SpatialHash,
    history: RwLock<VecDeque<Snapshot>>,
    baseline_lock: RwLock<Option<BaselineLock>>,
}

impl WorldModel {
    pub fn new_seeded() -> Self {
        let world = Self {
            sequence_id: AtomicU64::new(0),
            voxels: SpatialHash::with_capacity(INITIAL_CAPACITY),
            history: RwLock::new(VecDeque::with_capacity(MAX_HISTORY)),
            baseline_lock: RwLock::new(None),
        };

        let seed_coords: &[(i32, i32, i32)] = &[
            (0, 0, 0), (1, 0, 0), (2, 0, 0),
            (0, 1, 0), (1, 1, 0), (2, 1, 0),
            (0, 2, 0), (1, 2, 0), (2, 2, 0),
            (1, 1, 1),
        ];

        for &(x, y, z) in seed_coords {
            let key = spatial_key(x, y, z);
            world.voxels.insert_and_activate(key, Voxel::new(x, y, z, true, 0));
        }

        world.push_snapshot();
        world
    }

    #[inline]
    pub fn sequence_id(&self) -> u64 {
        self.sequence_id.load(Ordering::Relaxed)
    }

    #[inline]
    pub fn voxel_count(&self) -> usize {
        self.voxels.len()
    }

    pub fn all_voxels(&self) -> Vec<Voxel> {
        let mut v = self.voxels.collect_all();
        // Sorting is expensive; only call this when a full UI refresh is needed
        v.sort_unstable_by_key(|v| (v.z, v.y, v.x));
        v
    }

    pub fn latest_snapshot(&self) -> Snapshot {
        self.history.read().back().cloned().unwrap_or_else(|| Snapshot {
            sequence_id: self.sequence_id(),
            structural_integrity: self.structural_integrity_score(),
            voxels: self.all_voxels(),
        })
    }

    #[inline]
    pub fn calculate_entropy(history: u32) -> f32 {
        let ones = history.count_ones();
        if ones == 0 || ones == 32 { return 0.0; }
        let p = ones as f32 / 32.0;
        let q = 1.0 - p;
        let h = -(p * p.log2() + q * q.log2());
        h.clamp(0.0, 1.0)
    }

    pub fn structural_integrity_score(&self) -> f64 {
        let current_seq = self.sequence_id();
        let current_voxel_count = self.voxel_count();

        if current_seq < INTEGRITY_BOOTSTRAP_SEQ && current_voxel_count < BASELINE_MIN_VOXELS {
            return 1.0;
        }

        if current_voxel_count == 0 {
            return 1.0;
        }

        if self.baseline_lock.read().is_none() && current_voxel_count >= BASELINE_MIN_VOXELS {
            let baseline_voxels = self.voxels
                .inner
                .iter()
                .map(|entry| (*entry.key(), entry.value().entropy))
                .collect::<HashMap<u64, f32>>();

            *self.baseline_lock.write() = Some(BaselineLock {
                baseline_seq: current_seq,
                voxels: baseline_voxels,
            });

            return 1.0;
        }

        let baseline_guard = self.baseline_lock.read();
        let Some(baseline) = baseline_guard.as_ref() else {
            let all = self.voxels.inner.iter();
            let mut total_penalty = 0.0;
            let mut count = 0;
            for entry in all {
                let voxel = entry.value();
                let mut penalty = ((voxel.entropy as f64) - ENTROPY_NOISE_FLOOR).max(0.0);
                if voxel.occupancy_history.count_ones() > STRUCTURAL_OCCUPANCY_TICKS {
                    penalty *= STRUCTURAL_STABILITY_WEIGHT;
                }
                total_penalty += penalty;
                count += 1;
            }
            if count == 0 { return 1.0; }
            return (1.0 - (total_penalty / count as f64)).clamp(0.0, 1.0);
        };

        if current_seq <= baseline.baseline_seq {
            return 1.0;
        }

        let baseline_count = baseline.voxels.len();
        if baseline_count == 0 {
            return 1.0;
        }

        let mut missing_count = 0usize;
        let mut entropy_drift = 0.0f64;

        for (key, baseline_entropy) in &baseline.voxels {
            match self.voxels.inner.get(key) {
                Some(current_voxel) => {
                    let mut drift = ((current_voxel.entropy as f64) - (*baseline_entropy as f64)).max(0.0);
                    drift = (drift - ENTROPY_NOISE_FLOOR).max(0.0);

                    if current_voxel.occupancy_history.count_ones() > STRUCTURAL_OCCUPANCY_TICKS {
                        drift *= STRUCTURAL_STABILITY_WEIGHT;
                    }

                    entropy_drift += drift;
                }
                None => {
                    missing_count += 1;
                }
            }
        }

        let missing_penalty = missing_count as f64 / baseline_count as f64;
        let entropy_penalty = (entropy_drift / baseline_count as f64).clamp(0.0, 1.0);
        let total_penalty = (missing_penalty * MISSING_VOXEL_WEIGHT) + (entropy_penalty * ENTROPY_DRIFT_WEIGHT);

        (1.0 - total_penalty).clamp(0.0, 1.0)
    }

    /// Primary Ingestion Loop: Processes raw points and updates the 4D model.
    /// Now uses a Sparse Active Set to avoid O(N) full-table scans.
    pub fn ingest_point_cloud(&self, points: Vec<Vec3>) {
        let seq = self.sequence_id.fetch_add(1, Ordering::SeqCst) + 1;
        let mut touched_keys = HashSet::with_capacity(points.len());

        // 1. Mark incoming points as occupied
        for point in points {
            let floored = point.floor();
            let (x, y, z) = (floored.x as i32, floored.y as i32, floored.z as i32);
            let key = spatial_key(x, y, z);
            touched_keys.insert(key);

            if let Some(mut voxel) = self.voxels.get_mut_by_key(key) {
                Self::update_voxel_temporal(voxel.value_mut(), true, seq);
            } else {
                let mut v = Voxel::new(x, y, z, true, seq);
                v.occupancy_history = 1;
                v.entropy = Self::calculate_entropy(v.occupancy_history);
                self.voxels.insert_and_activate(key, v);
            }
        }

        // 2. Sparse Aging Loop: Only update voxels that are currently "Active"
        let mut to_deactivate = Vec::new();
        for key_ref in self.voxels.active_keys.iter() {
            let key = *key_ref;
            if !touched_keys.contains(&key) {
                if let Some(mut voxel) = self.voxels.get_mut_by_key(key) {
                    Self::update_voxel_temporal(voxel.value_mut(), false, seq);
                    
                    // Optimization: If a voxel has been empty for 32 ticks, stop tracking it in the active set.
                    if voxel.occupancy_history == 0 {
                        to_deactivate.push(key);
                    }
                }
            }
        }

        // Clean up inactive voxels
        for key in to_deactivate {
            self.voxels.active_keys.remove(&key);
        }

        self.push_snapshot();
    }

    #[inline]
    fn update_voxel_temporal(voxel: &mut Voxel, occupied: bool, seq: u64) {
        voxel.occupancy_history = (voxel.occupancy_history << 1) | (occupied as u32);
        voxel.occupied = occupied;
        voxel.entropy = Self::calculate_entropy(voxel.occupancy_history);
        
        // Use 32.0 as the window for anomaly detection
        let historical_p = voxel.occupancy_history.count_ones() as f32 / 32.0;
        voxel.anomaly = ((occupied as u32 as f32) - historical_p).abs() > ANOMALY_THRESHOLD;
        voxel.last_updated_seq = seq;
    }

    // Replace the .map(|v| { ... }) block in delta_since with this:
    pub fn delta_since(&self, since: u64) -> DeltaResponse {
        let current_seq = self.sequence_id();
        if since >= current_seq {
            return DeltaResponse { sequence_id: current_seq, changed: vec![] };
        }

        let mut changed: Vec<ChangedVoxel> = self.voxels
            .collect_changed_since(since)
            .into_iter()
            .map(|v| ChangedVoxel::from_voxel(&v)) // <--- Use our helper here!
            .collect();

        changed.sort_unstable_by_key(|c| c.key);
        DeltaResponse { sequence_id: current_seq, changed }
    }

    pub fn tick_demo(&self) {
        let synthetic_points = vec![
            Vec3::new(1.4, 1.2, 1.0),
            Vec3::new(2.6, 1.0, 0.3),
            Vec3::new(0.5, 2.1, 0.0),
        ];
        self.ingest_point_cloud(synthetic_points);
    }

    fn push_snapshot(&self) {
        // Warning: push_snapshot() is currently O(N). 
        // In a production world-class engine, you should only snapshot every X seconds 
        // or use an Incremental Snapshot strategy.
        let voxels = self.all_voxels();
        let structural_integrity = self.structural_integrity_score();

        let snap = Snapshot {
            sequence_id: self.sequence_id(),
            structural_integrity,
            voxels,
        };

        let mut history = self.history.write();
        if history.len() >= MAX_HISTORY { history.pop_front(); }
        history.push_back(snap);
    }
}
