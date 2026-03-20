use std::collections::{HashMap, VecDeque};

use crate::models::{DeltaResponse, Voxel};

const MAX_HISTORY: usize = 20;

#[derive(Debug, Clone)]
pub struct Snapshot {
    pub sequence_id: u64,
    pub voxels: Vec<Voxel>,
}

#[derive(Debug)]
pub struct WorldModel {
    sequence_id: u64,
    voxels: HashMap<String, Voxel>,
    history: VecDeque<Snapshot>,
}

impl WorldModel {
    pub fn new_seeded() -> Self {
        let mut world = Self {
            sequence_id: 0,
            voxels: HashMap::new(),
            history: VecDeque::with_capacity(MAX_HISTORY),
        };

        // Seed some dummy data in a shape that is easy to render in R3F.
        let seed_voxels = vec![
            Self::make_voxel(0, 0, 0, true, 0.02, 0),
            Self::make_voxel(1, 0, 0, true, 0.04, 0),
            Self::make_voxel(2, 0, 0, true, 0.08, 0),
            Self::make_voxel(0, 1, 0, true, 0.10, 0),
            Self::make_voxel(1, 1, 0, true, 0.12, 0),
            Self::make_voxel(2, 1, 0, true, 0.16, 0),
            Self::make_voxel(0, 2, 0, true, 0.18, 0),
            Self::make_voxel(1, 2, 0, true, 0.20, 0),
            Self::make_voxel(2, 2, 0, true, 0.24, 0),
            Self::make_voxel(1, 1, 1, true, 0.30, 0),
        ];

        for voxel in seed_voxels {
            world.voxels.insert(voxel.id.clone(), voxel);
        }

        world.push_snapshot();
        world
    }

    fn make_voxel(x: i32, y: i32, z: i32, occupied: bool, entropy: f32, seq: u64) -> Voxel {
        Voxel {
            id: format!("{x}:{y}:{z}"),
            x,
            y,
            z,
            occupied,
            entropy,
            last_updated_seq: seq,
        }
    }

    pub fn sequence_id(&self) -> u64 {
        self.sequence_id
    }

    pub fn voxel_count(&self) -> usize {
        self.voxels.len()
    }

    pub fn all_voxels(&self) -> Vec<Voxel> {
        let mut voxels: Vec<Voxel> = self.voxels.values().cloned().collect();
        voxels.sort_by_key(|v| (v.z, v.y, v.x));
        voxels
    }

    pub fn delta_since(&self, since: u64) -> DeltaResponse {
        if since >= self.sequence_id {
            return DeltaResponse {
                sequence_id: self.sequence_id,
                added: vec![],
                updated: vec![],
                removed: vec![],
            };
        }

        let mut changed: Vec<Voxel> = self
            .voxels
            .values()
            .filter(|v| v.last_updated_seq > since)
            .cloned()
            .collect();

        changed.sort_by_key(|v| (v.z, v.y, v.x));

        if since == 0 {
            DeltaResponse {
                sequence_id: self.sequence_id,
                added: changed,
                updated: vec![],
                removed: vec![],
            }
        } else {
            DeltaResponse {
                sequence_id: self.sequence_id,
                added: vec![],
                updated: changed,
                removed: vec![],
            }
        }
    }
    pub fn latest_snapshot(&self) -> Snapshot {
        self.history.back().cloned().unwrap_or_else(|| Snapshot {
            sequence_id: self.sequence_id,
            voxels: self.all_voxels(),
        })
    }

    pub fn tick_demo(&mut self) {
        self.sequence_id += 1;
        let seq = self.sequence_id;

        // Simulate a few changing voxels so the frontend has something live to poll.
        let targets = [
            ("1:1:1", 0.78_f32),
            ("2:1:0", 0.62_f32),
            ("0:2:0", 0.55_f32),
        ];

        for (id, entropy) in targets {
            if let Some(voxel) = self.voxels.get_mut(id) {
                voxel.entropy = entropy;
                voxel.last_updated_seq = seq;
            }
        }

        // Toggle one voxel on/off to make movement visible.
        let moving_id = "3:1:0".to_string();
        if let Some(existing) = self.voxels.get_mut(&moving_id) {
            existing.occupied = !existing.occupied;
            existing.last_updated_seq = seq;
            existing.entropy = if existing.occupied { 0.81 } else { 0.15 };
        } else {
            let voxel = Voxel {
                id: moving_id.clone(),
                x: 3,
                y: 1,
                z: 0,
                occupied: true,
                entropy: 0.81,
                last_updated_seq: seq,
            };
            self.voxels.insert(moving_id, voxel);
        }

        self.push_snapshot();
    }

    fn push_snapshot(&mut self) {
        let snapshot = Snapshot {
            sequence_id: self.sequence_id,
            voxels: self.all_voxels(),
        };

        if self.history.len() == MAX_HISTORY {
            self.history.pop_front();
        }

        self.history.push_back(snapshot);
    }
}