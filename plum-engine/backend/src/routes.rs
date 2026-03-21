use axum::{
    extract::{Multipart, Query, State},
    http::StatusCode,
    Json,
};
use crate::{
    models::{DeltaQuery, PingResponse, SnapshotResponse, UploadResponse, VoxelsResponse},
    state::AppState,
};

/// GET /api/ping — Vital health check.
pub async fn ping(State(state): State<AppState>) -> Json<PingResponse> {
    Json(PingResponse {
        ok: true,
        service: "plum-rockets-4d-engine".to_string(),
        sequence_id: state.world.sequence_id(),
        voxel_count: state.world.voxel_count(),
    })
}

/// GET /api/world/voxels — Full world state retrieval.
pub async fn get_voxels(State(state): State<AppState>) -> Json<VoxelsResponse> {
    Json(VoxelsResponse {
        sequence_id: state.world.sequence_id(),
        voxels: state.world.all_voxels(),
    })
}

/// GET /api/world/delta?since=X — Retrieve only sparse changes.
pub async fn get_world_delta(
    State(state): State<AppState>,
    Query(query): Query<DeltaQuery>,
) -> Json<crate::models::DeltaResponse> {
    let since = query.since.unwrap_or(0);
    Json(state.world.delta_since(since))
}

/// GET /api/world/history — Latest architectural snapshot.
pub async fn get_latest_history(State(state): State<AppState>) -> Json<SnapshotResponse> {
    let snap = state.world.latest_snapshot();
    Json(SnapshotResponse {
        sequence_id: snap.sequence_id,
        structural_integrity: snap.structural_integrity,
        voxels: snap.voxels,
    })
}

/// POST /api/world/tick — Advance the world clock for dev/testing.
pub async fn dev_tick(State(state): State<AppState>) -> StatusCode {
    state.world.tick_demo();
    StatusCode::NO_CONTENT
}

/// POST /api/world/ingest — Accept JSON point cloud.
pub async fn ingest_point_cloud(
    State(state): State<AppState>,
    Json(body): Json<crate::models::IngestRequest>,
) -> StatusCode {
    // Convert JSON-friendly Point structs → glam Vec3 for SIMD math.
    let vecs: Vec<glam::Vec3> = body.points.into_iter().map(|p| p.to_vec3()).collect();
    state.world.ingest_point_cloud(vecs);
    StatusCode::NO_CONTENT
}

/// POST /api/world/upload — Accept raw CSV, JSON, or LiDAR datasets for later processing.
pub async fn upload_dataset(
    State(_state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, StatusCode> {
    let mut file_name = String::new();
    let mut format = "unknown".to_string();
    let mut bytes_received = 0usize;

    while let Some(field) = multipart.next_field().await.map_err(|_| StatusCode::BAD_REQUEST)? {
        match field.name() {
            Some("dataset") => {
                file_name = field.file_name().unwrap_or("dataset-upload").to_string();
                bytes_received = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?.len();
            }
            Some("format") => {
                format = field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?;
            }
            _ => {}
        }
    }

    if bytes_received == 0 {
        return Err(StatusCode::BAD_REQUEST);
    }

    Ok(Json(UploadResponse {
        ok: true,
        file_name,
        format,
        bytes_received,
        message: "Dataset received by backend. Processing pipeline can be attached next.".to_string(),
    }))
}
