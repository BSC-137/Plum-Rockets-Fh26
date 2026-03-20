use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};

use crate::{
    state::AppState,
    models::{DeltaQuery, PingResponse, SnapshotResponse, VoxelsResponse},
};

pub async fn ping(State(state): State<AppState>) -> Json<PingResponse> {
    let world = state.world.read().await;

    Json(PingResponse {
        ok: true,
        service: "plum-rockets-backend".to_string(),
        sequence_id: world.sequence_id(),
        voxel_count: world.voxel_count(),
    })
}

pub async fn get_voxels(State(state): State<AppState>) -> Json<VoxelsResponse> {
    let world = state.world.read().await;

    Json(VoxelsResponse {
        sequence_id: world.sequence_id(),
        voxels: world.all_voxels(),
    })
}

pub async fn get_world_delta(
    State(state): State<AppState>,
    Query(query): Query<DeltaQuery>,
) -> Json<crate::models::DeltaResponse> {
    let since = query.since.unwrap_or(0);
    let world = state.world.read().await;

    Json(world.delta_since(since))
}

pub async fn get_latest_history(State(state): State<AppState>) -> Json<SnapshotResponse> {
    let world = state.world.read().await;
    let snapshot = world.latest_snapshot();

    Json(SnapshotResponse {
        sequence_id: snapshot.sequence_id,
        voxels: snapshot.voxels,
    })
}

pub async fn dev_tick(State(state): State<AppState>) -> StatusCode {
    let mut world = state.world.write().await;
    world.tick_demo();
    StatusCode::NO_CONTENT
}