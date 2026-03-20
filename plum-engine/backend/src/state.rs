use std::sync::Arc;
use tokio::sync::RwLock;

use crate::world::WorldModel;

#[derive(Clone)]
pub struct AppState {
    pub world: Arc<RwLock<WorldModel>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            world: Arc::new(RwLock::new(WorldModel::new_seeded())),
        }
    }
}