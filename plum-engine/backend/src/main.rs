mod models;
mod routes;
mod spatial_hash;
mod state;
mod world;

use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

use crate::state::AppState;
use crate::routes::{dev_tick, get_voxels, get_world_delta, ingest_point_cloud, ping, get_latest_history};

#[tokio::main]
async fn main() {
    // 1. Initialize the shared application state. 
    // The WorldModel inside AppState is now internally thread-safe.
    let state = AppState::new();

    // 2. Build the router with the high-performance routes.
    let app = Router::new()
        // Basic health check
        .route("/api/ping", get(ping))
        
        // World state queries
        .route("/api/world/voxels", get(get_voxels))
        .route("/api/world/delta", get(get_world_delta))
        .route("/api/world/history", get(get_latest_history))
        
        // Data ingestion & development
        .route("/api/world/ingest", post(ingest_point_cloud))
        .route("/api/world/tick", post(dev_tick))
        
        // 3. Apply CORS and inject the state.
        .layer(CorsLayer::permissive())
        .with_state(state);

    // 4. Set the listener address (127.0.0.1:3000)
    // Change this line in main.rs:
    // Use an environment variable, or default to 0.0.0.0
    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = 3000;
    let addr: SocketAddr = format!("{}:{}", host, port).parse().unwrap();

    println!("🚀 Plum Rockets Engine Pulse: http://{}", addr);
    println!("- GET  /api/ping          (Health Check)");
    println!("- GET  /api/world/delta   (Sparse Updates)");
    println!("- POST /api/world/ingest  (LiDAR Stream)");

    // 5. Fire up the server
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}