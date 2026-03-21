# Plum Rockets: 4D World Model Engine

Plum Engine is a two-part voxel visualization and analysis project:

- A Rust backend that stores a mutable voxel world, ingests 3D point data, tracks temporal occupancy over a rolling 32-tick window, and exposes JSON APIs.
- A React + Vite frontend that renders the voxel field in 3D, streams dataset uploads into the backend, lets users scrub temporal history, and generates an audit-style analytics report from live telemetry.

## Team Members

- [Bharat](https://github.com/BSC-137)
- [Shree](https://github.com/shreejitmurthy)
- [Hana](https://github.com/jyonkii)

## What the project does

The backend turns incoming point clouds into voxel coordinates by flooring each point to an integer `(x, y, z)` position. Each voxel keeps:

- Whether it is currently occupied
- A rolling 32-tick occupancy history bitmask
- Shannon entropy derived from that history
- An anomaly flag when the current state deviates from the voxel's recent behavior
- The sequence ID of the last update

The frontend continuously polls the backend, visualizes the live world, and computes higher-level metrics such as:

- Structural health
- Mean entropy
- Anomaly density
- Volatility index
- Saturation velocity
- Dense-cluster vs sparse-noise anomaly grouping

## Current feature set

- Real-time voxel rendering with `react-three-fiber` and `three.js`
- Temporal hindsight mode with a 32-tick scrubber
- CSV, JSON, and PLY/LiDAR-style point ingestion from the browser
- Batch streaming of parsed points into the backend
- Full world snapshot API
- Delta API for sparse updates
- Snapshot history API with structural integrity score
- Development tick endpoint for synthetic world mutations
- Audit report UI with charts and anomaly manifest
- Optional Gemini-powered narrative report generation with local fallback text

## Tech stack

### Backend

- Rust 2021
- Axum
- Tokio
- DashMap
- parking_lot
- glam
- tower-http CORS

### Frontend

- React 19
- Vite 8
- TypeScript-enabled source files
- Zustand
- `@react-three/fiber`
- `@react-three/drei`
- Framer Motion
- Recharts

## Repository structure

```text
.
├── backend
│   ├── Cargo.toml
│   └── src
│       ├── main.rs
│       ├── models.rs
│       ├── routes.rs
│       ├── spatial_hash.rs
│       ├── state.rs
│       └── world.rs
├── frontend
│   ├── package.json
│   └── src
│       ├── App.tsx
│       ├── VoxelEngine.tsx
│       ├── components/AuditReport.tsx
│       ├── store.ts
│       ├── types.ts
│       └── utils/geminiAudit.ts
├── HOWTORUN.md
└── README.md
```

## Prerequisites

- Rust toolchain with `cargo`
- Node.js and npm

Optional for development convenience:

- `cargo-watch` if you want auto-rebuilds for the Rust server

Install it with:

```bash
cargo install cargo-watch
```

## Running the project

Open two terminals from the repository root.

### 1. Start the backend

Basic run:

```bash
cd backend
cargo run
```

Auto-reload during development:

```bash
cd backend
cargo watch -x run
```

The backend listens on port `3000`.

By default it binds to:

- `0.0.0.0:3000`

You can override the host with:

```bash
HOST=127.0.0.1 cargo run
```

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Vite will print the local frontend URL, usually `http://localhost:5173`.

## Environment variables

### Backend

- `HOST`: optional bind host for the Axum server. Default is `0.0.0.0`.

### Frontend

- `VITE_GEMINI_API_KEY`: optional Google Gemini API key used by the audit report generator.

If `VITE_GEMINI_API_KEY` is not set, the frontend still works. The audit report falls back to a built-in static report instead of calling Gemini.

## How data flows through the system

1. The frontend parses a selected dataset file in the browser.
2. Parsed points are split into batches of 2000 points.
3. Each batch is posted to `POST /api/world/ingest`.
4. The backend floors each point to integer voxel coordinates.
5. The world model updates occupancy history, entropy, anomaly status, and sequence ID.
6. The frontend polls the backend and recalculates derived telemetry from the latest voxel set.
7. The 3D scene and audit report update from the latest state.

## Supported input formats

The upload panel accepts:

- `.csv`
- `.json`
- `.ply`

### CSV

Expected shape:

```text
x,y,z
1.0,2.0,3.0
4.5,2.1,0.0
```

Notes:

- Lines beginning with `#` are ignored.
- Values may be comma-separated or whitespace-separated.
- At least the first three values on a line must be numeric.

### JSON

Expected shape:

```json
[
  { "x": 1.0, "y": 2.0, "z": 3.0 },
  { "x": 4.5, "y": 2.1, "z": 0.0 }
]
```

### PLY

- The frontend uses `PLYLoader` from `three.js` to read vertex positions from `.ply` files.
- Valid position attributes are converted into point batches and streamed to the backend.

## Backend API

Base URL:

```text
http://localhost:3000/api
```

### `GET /ping`

Health check.

Example response:

```json
{
  "ok": true,
  "service": "plum-rockets-4d-engine",
  "sequence_id": 0,
  "voxel_count": 10
}
```

### `GET /world/voxels`

Returns the complete current voxel state.

Example response shape:

```json
{
  "sequence_id": 4,
  "voxels": [
    {
      "x": 1,
      "y": 1,
      "z": 0,
      "occupied": true,
      "entropy": 0.12,
      "anomaly": false,
      "occupancy_history": 15,
      "last_updated_seq": 4
    }
  ]
}
```

### `GET /world/delta?since=<sequence_id>`

Returns only voxels changed after the provided sequence.

Example response shape:

```json
{
  "sequence_id": 4,
  "changed": [
    {
      "key": 140739206361089,
      "x": 1,
      "y": 1,
      "z": 0,
      "occupied": true,
      "entropy": 0.12,
      "anomaly": false,
      "seq": 4
    }
  ]
}
```

### `GET /world/history`

Returns the latest snapshot plus structural integrity.

Example response shape:

```json
{
  "sequence_id": 4,
  "structural_integrity": 0.88,
  "voxels": []
}
```

### `POST /world/ingest`

Ingests a point cloud as JSON.

Request body:

```json
{
  "points": [
    { "x": 1.2, "y": 0.4, "z": 2.8 },
    { "x": 1.8, "y": 0.9, "z": 2.1 }
  ]
}
```

Response:

- `204 No Content` on success

### `POST /world/upload`

Accepts multipart dataset uploads with:

- `dataset`: file field
- `format`: optional text field

This endpoint currently acknowledges receipt and reports metadata. It does not yet process the uploaded file into voxels.

Example response shape:

```json
{
  "ok": true,
  "file_name": "scan.csv",
  "format": "csv",
  "bytes_received": 1024,
  "message": "Dataset received by backend. Processing pipeline can be attached next."
}
```

### `POST /world/tick`

Applies a synthetic mutation for development/testing.

Response:

- `204 No Content` on success

## Frontend behavior

### Live polling

The frontend currently polls:

- `GET /api/world/voxels`

Polling interval:

- Every `100ms`

Although the backend exposes a delta endpoint, the current frontend store refreshes from full voxel snapshots rather than applying sparse deltas incrementally.

### View modes

- `LIVE`: shows currently occupied voxels
- `TEMPORAL_HINDSIGHT`: reveals historical occupancy using the 32-tick bitmask and scrubber offset

### Audit report

The report overlay includes:

- Structural integrity trend
- Entropy variance
- Anomaly density over time
- Volatility pulse
- Sector heatmap
- Forensic metric cards
- AI-generated or fallback narrative analysis
- An anomaly manifest table

## Backend implementation notes

- The world is seeded on startup with 10 initial voxels.
- Voxel state is stored in a thread-safe spatial hash built on `DashMap`.
- Active voxels are tracked separately to avoid aging the full map on every ingest cycle.
- Sequence IDs are stored as an atomic counter.
- Snapshot history is capped at 50 entries.
- Structural integrity is derived from average voxel entropy.

## Known limitations

- The frontend hardcodes backend URLs to `http://localhost:3000`; it is not yet environment-configurable.
- The frontend upload flow streams parsed files directly to `POST /world/ingest`; it does not use the backend multipart upload endpoint.
- The frontend polls the full voxel state every `100ms`, which is simple but not optimal for larger datasets.
- The backend does not persist world state; all data resets on restart.
- The backend snapshot operation is currently `O(N)` over all voxels.
- The generated frontend production bundle is large and triggers Vite's chunk-size warning.
- There are no automated tests in the repository yet.

## Verification

The current codebase was checked successfully with:

```bash
cd backend && cargo check
cd frontend && npm run build
```

## Suggested next improvements

- Switch the frontend from full snapshot polling to delta-based synchronization
- Move API base URLs into environment variables
- Add persistence for snapshots or world state
- Add backend and frontend test coverage
- Wire the multipart upload endpoint into an actual server-side ingestion pipeline
