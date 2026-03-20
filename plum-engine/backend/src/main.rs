mod state;
mod models;
mod routes;
mod world;

use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

use state::AppState;
use routes::{dev_tick, get_latest_history, get_voxels, get_world_delta, ping};

#[tokio::main]
async fn main() {
    let state = AppState::new();

    let app = Router::new()
        .route("/api/ping", get(ping))
        .route("/api/voxels", get(get_voxels))
        .route("/api/world/delta", get(get_world_delta))
        .route("/api/history/latest", get(get_latest_history))
        .route("/api/dev/tick", post(dev_tick))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Backend running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}