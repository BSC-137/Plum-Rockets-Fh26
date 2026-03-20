use std::sync::Arc;
use crate::world::WorldModel;

#[derive(Clone)]
pub struct AppState {
    /// WorldModel is now internally thread-safe. No more global RwLock!
    pub world: Arc<WorldModel>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            world: Arc::new(WorldModel::new_seeded()),
        }
    }
}