use std::collections::{HashSet, VecDeque};
use glam::Vec3;
use parking_lot::RwLock;

use crate::{
    models::{ChangedVoxel, DeltaResponse, Voxel},
    spatial_hash::{spatial_key, SpatialHash},
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_HISTORY: usize = 20;
const INITIAL_CAPACITY: usize = 4096;
const ANOMALY_THRESHOLD: f32 = 0.4;

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

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
    sequence_id: u64,
    voxels: SpatialHash,
    history: RwLock<VecDeque<Snapshot>>,
}

impl WorldModel {
    pub fn new_seeded() -> Self {
        let world = Self {
            sequence_id: 0,
            voxels: SpatialHash::with_capacity(INITIAL_CAPACITY),
            history: RwLock::new(VecDeque::with_capacity(MAX_HISTORY)),
        };

        let seed_coords: &[(i32, i32, i32)] = &[
            (0, 0, 0), (1, 0, 0), (2, 0, 0),
            (0, 1, 0), (1, 1, 0), (2, 1, 0),
            (0, 2, 0), (1, 2, 0), (2, 2, 0),
            (1, 1, 1),
        ];

        for &(x, y, z) in seed_coords {
            let key = spatial_key(x, y, z);
            world.voxels.insert_by_key(key, Voxel::new(x, y, z, true, 0));
        }

        world.push_snapshot();
        world
    }

    #[inline]
    pub fn sequence_id(&self) -> u64 { self.sequence_id }

    #[inline]
    pub fn voxel_count(&self) -> usize { self.voxels.len() }

    pub fn all_voxels(&self) -> Vec<Voxel> {
        let mut v = self.voxels.collect_all();
        v.sort_unstable_by_key(|v| (v.z, v.y, v.x));
        v
    }

    pub fn latest_snapshot(&self) -> Snapshot {
        self.history.read().back().cloned().unwrap_or_else(|| Snapshot {
            sequence_id: self.sequence_id,
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
        let all = self.voxels.collect_all();
        if all.is_empty() { return 1.0; }
        let mean_entropy: f64 = all.iter().map(|v| v.entropy as f64).sum::<f64>() / all.len() as f64;
        (1.0 - mean_entropy).clamp(0.0, 1.0)
    }

    pub fn ingest_point_cloud(&mut self, points: Vec<Vec3>) {
        self.sequence_id += 1;
        let seq = self.sequence_id;
        let mut touched_keys = HashSet::new();

        for point in points {
            let floored = point.floor();
            let x = floored.x as i32;
            let y = floored.y as i32;
            let z = floored.z as i32;
            let key = spatial_key(x, y, z);
            
            touched_keys.insert(key);

            if let Some(mut voxel) = self.voxels.get_mut_by_key(key) {
                Self::update_voxel_temporal(voxel.value_mut(), true, seq);
            } else {
                let mut v = Voxel::new(x, y, z, true, seq);
                v.occupancy_history = 1; 
                v.entropy = Self::calculate_entropy(v.occupancy_history);
                self.voxels.insert_by_key(key, v);
            }
        }

        self.voxels.iter_mut().for_each(|mut entry| {
            let key = *entry.key();
            if !touched_keys.contains(&key) {
                Self::update_voxel_temporal(entry.value_mut(), false, seq);
            }
        });

        self.push_snapshot();
    }

    #[inline]
    fn update_voxel_temporal(voxel: &mut Voxel, occupied: bool, seq: u64) {
        voxel.occupancy_history = (voxel.occupancy_history << 1) | (occupied as u32);
        voxel.occupied = occupied;
        voxel.entropy = Self::calculate_entropy(voxel.occupancy_history);
        let historical_p = voxel.occupancy_history.count_ones() as f32 / 32.0;
        voxel.anomaly = ((occupied as u32 as f32) - historical_p).abs() > ANOMALY_THRESHOLD;
        voxel.last_updated_seq = seq;
    }

    pub fn delta_since(&self, since: u64) -> DeltaResponse {
        if since >= self.sequence_id {
            return DeltaResponse { sequence_id: self.sequence_id, changed: vec![] };
        }

        let mut changed: Vec<ChangedVoxel> = self.voxels
            .collect_changed_since(since)
            .into_iter()
            .map(|v| ChangedVoxel {
                key: spatial_key(v.x, v.y, v.z),
                x: v.x, y: v.y, z: v.z,
                occupied: v.occupied, entropy: v.entropy,
                anomaly: v.anomaly, seq: v.last_updated_seq,
            })
            .collect();

        changed.sort_unstable_by_key(|c| c.key);
        DeltaResponse { sequence_id: self.sequence_id, changed }
    }

    pub fn tick_demo(&mut self) {
        let synthetic_points = vec![
            Vec3::new(1.4, 1.2, 1.0),
            Vec3::new(2.6, 1.0, 0.3),
            Vec3::new(0.5, 2.1, 0.0),
        ];

        self.ingest_point_cloud(synthetic_points);

        let toggle_key = spatial_key(3, 1, 0);
        if let Some(mut voxel) = self.voxels.get_mut_by_key(toggle_key) {
            let next_state = !voxel.occupied;
            Self::update_voxel_temporal(voxel.value_mut(), next_state, self.sequence_id);
        } else {
            let v = Voxel::new(3, 1, 0, true, self.sequence_id);
            self.voxels.insert_by_key(toggle_key, v);
        }
        
        self.push_snapshot();
    }

    fn push_snapshot(&self) {
        let voxels = self.all_voxels();
        let structural_integrity = self.structural_integrity_score();

        let snap = Snapshot {
            sequence_id: self.sequence_id,
            structural_integrity,
            voxels,
        };

        let mut history = self.history.write();
        if history.len() == MAX_HISTORY { history.pop_front(); }
        history.push_back(snap);
    }
}