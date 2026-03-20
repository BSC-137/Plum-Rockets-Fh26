# Plum Rockets: 4D World Model Engine

Plum Rockets is a high-performance, spatiotemporal engine built to version-control the physical world. It implements Object Permanence and Structural Intelligence at the hardware level, enabling systems to distinguish between static infrastructure and entropic chaos.

## The Founders

* [**Bharat**](https://github.com/BSC-137)
* [**Shree**](https://github.com/shreejitmurthy)
* [**Hana**](https://github.com/jyonkii)

## Technical Sophistication (Engine Specs)

We have moved beyond a simple REST API to a dedicated Physical AI Engine. Our architecture is designed for **Zero-Latency Spatial Awareness**:

### 1. Backend: The Rust Brain

*   **Lock-Free Spatial Hashing:** Utilizes a u64 bit-packed key for $O(1)$ lookups. Powered by `DashMap` and `AtomicU64` sequences to eliminate global lock contention during multi-threaded ingestion.
*   **Sparse Aging Loop:** Unlike traditional voxel engines that scan the whole world, Plum Rockets maintains an **Active Set** of voxels. It only processes "living" data, moving complexity from $O(\text{Total Voxels})$ to $O(\text{Active Voxels})$.
*   **Shannon Entropy Analysis:** Real-time uncertainty calculation per voxel using:
    $$H(V) = -\sum p_i \log p_i$$
*   **WSL2 Optimized:** Backend binds to an environment variable or defaults to `0.0.0.0` to ensure seamless signal passthrough from Linux subsystems to Windows browsers and MacOS systems.

### 2. Frontend: The Predictive Lens

*   **React 19 + TypeScript:** Full type-safety contract between Rust structs and the UI.
*   **Zustand State Mirror:** Implements a high-frequency state-syncing store that mirrors the backend's world state without triggering infinite re-render loops.
*   **$O(1)$ Rendering (R3F):** Uses `InstancedMesh` via React-Three-Fiber. This offloads all voxel positioning and coloring to the GPU, allowing 60FPS visualization of high-density LiDAR streams.
*   **Adaptive HUD:** Real-time telemetry displaying the World Clock (`sequence_id`), Signal Integrity, and Voxel Memory.

## Installation & Setup

### 1. Prerequisites

*   **Rust Toolchain:** `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
*   **Node.js (v20+):** `npm install`
*   **Terminal Visualizer:** `sudo apt install jq -y`

### 2. Running the Engine

#### Terminal A: The Backend
```bash
cd plum-engine/backend
cargo run
# Port: 3000 | Address: 0.0.0.0
```

#### Terminal B: The Frontend
```bash
cd plum-engine/frontend
npm install
npm run dev
# Port: 5173 | Dependencies: three, @react-three/fiber, zustand, @react-three/drei
```

## Validation: The "Pulse" Test

### 1. Health Check
```bash
curl -s http://localhost:3000/api/ping | jq
```
*Confirms Axum is alive and the DashMap is seeded.*

### 2. Advance the World Clock (Simulation)
```bash
curl -X POST http://localhost:3000/api/world/tick
```
*Watch the `SEQ_ID` on the HUD jump. If the tick triggers an anomaly, a cube will flash **Anomaly Orange (#FF3E00)**.*

### 3. Ingest Raw LiDAR Points
```bash
curl -X POST http://localhost:3000/api/world/ingest \
     -H "Content-Type: application/json" \
     -d '{"points": [{"x": 1.0, "y": 2.0, "z": 0.0}]}'
```
*The new point will instantly appear in the 3D grid.*

## Visual Language

*   **Matrix Green (#00FF41):** Stable, high-probability infrastructure.
*   **Anomaly Orange (#FF3E00):** Predictive failure / high-entropy event.
*   **Deep Obsidian (#111111):** Ghosted state (Object Permanence memory).