use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};

use crate::{
    models::{DeltaQuery, IngestRequest, PingResponse, SnapshotResponse, VoxelsResponse},
    state::AppState,
};

pub async fn ping(State(state): State<AppState>) -> Json<PingResponse> {
    let world = state.world.read().await;

    Json(PingResponse {
        ok: true,
        service: "plum-rockets-4d-engine".to_string(),
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
    let snap = world.latest_snapshot();

    Json(SnapshotResponse {
        sequence_id: snap.sequence_id,
        structural_integrity: snap.structural_integrity,
        voxels: snap.voxels,
    })
}

pub async fn dev_tick(State(state): State<AppState>) -> StatusCode {
    let mut world = state.world.write().await;
    world.tick_demo();
    StatusCode::NO_CONTENT
}

/// POST /api/world/ingest — accept a JSON point cloud and feed it into the
/// world model.  JSON uses `Point {x, y, z}` objects for a human-readable
/// API surface; we convert to `glam::Vec3` here so the engine core stays
/// pure-SIMD with no serde dependency.
pub async fn ingest_point_cloud(
    State(state): State<AppState>,
    Json(body): Json<IngestRequest>,
) -> StatusCode {
    // Convert JSON-friendly Point structs → glam Vec3 in one allocation-free pass.
    let vecs: Vec<glam::Vec3> = body.points.into_iter().map(|p| p.to_vec3()).collect();

    let mut world = state.world.write().await;
    world.ingest_point_cloud(vecs);
    StatusCode::NO_CONTENT
}
