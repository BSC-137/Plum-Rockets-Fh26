# Plum Rockets: 4D World Model Engine

Plum Rockets is a high-performance, spatiotemporal engine built to version-control the physical world. Unlike standard 3D mapping, Plum Rockets implements Object Permanence and Structural Intelligence at the hardware level, enabling autonomous systems to distinguish between static infrastructure and entropic chaos.

## The Founders

*   Bharat — Systems Architect & Lead Engine Engineer (Rust)
*   Shree — Fullstack Lead & Integration
*   Hana — UX/UI & Spatial Visualization (Three.js/R3F)

## Technical Sophistication (What we’ve built)

We have moved beyond a simple REST API to a dedicated Physical AI Engine. Our current backend architecture includes:

*   **Lock-Free Spatial Hashing:** Utilizes a u64 bit-packed key `[z(16)|y(16)|x(16)]` for $O(1)$ lookups. Powered by DashMap for multi-threaded ingestion without global lock contention.
*   **SIMD-Accelerated Ingestion:** Leverages the `glam` math crate to perform Single Instruction, Multiple Data (SIMD) operations, allowing the engine to process millions of points per second with sub-millisecond latency.
*   **Temporal Occupancy Buffers:** Each voxel stores its own history in a 32-bit bitmask. This allows the engine to "remember" the last 32 frames of reality at zero heap cost.
*   **Shannon Entropy Analysis:** Real-time calculation of spatial uncertainty using $H = -(p \log_2 p + (1-p) \log_2 (1-p))$.
*   **The Aging Loop:** A self-cleaning mechanism that detects the absence of objects, allowing the world model to "forget" moving ghosts and update structural integrity scores dynamically.

## Installation & Setup

### 1. Prerequisites

You need the Rust toolchain and `jq` for data inspection.

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install JQ (for terminal visualization)
sudo apt update && sudo apt install jq -y
```

### 2. Running the Engine

```bash
cd plum-engine/backend
cargo run
```

*Note: During development, use `cargo watch -x check` for instant logic validation without the heavy compilation tax.*

## Validation: What the Data Means

When you run `curl -s http://localhost:3000/api/ping | jq`, you are looking at the "Brain's" vitals:

```json
{
  "ok": true,
  "service": "plum-rockets-4d-engine",
  "sequence_id": 0,
  "voxel_count": 10
}
```

*   **ok: true:** The Axum server is alive and the lock-free DashMap is initialized.
*   **sequence_id:** This is the World Clock. Every time a sensor (LiDAR) sends data, the clock ticks. It allows the frontend to request only the changes since the last time it looked.
*   **voxel_count:** This is the Spatial Memory. The "10" voxels you see are the seeded ground layer we created to ensure the engine is ready to receive data.

## Testing the 4D Logic

To prove the engine is "thinking," use these commands in a separate terminal:

### 1. Advance the World Clock

```bash
curl -s -X POST http://localhost:3000/api/dev/tick
```

### 2. Ingest Raw Point Clouds

```bash
curl -X POST http://localhost:3000/api/world/ingest \
     -H "Content-Type: application/json" \
     -d '{"points": [{"x": 1.5, "y": 2.0, "z": 0.5}]}'
```

### 3. Inspect Spatiotemporal Deltas

```bash
curl -s "http://localhost:3000/api/world/delta?since=0" | jq
```

This returns only the voxels that have changed, including their entropy and anomaly flags.