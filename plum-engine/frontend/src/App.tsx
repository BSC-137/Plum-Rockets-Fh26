import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { motion } from 'framer-motion';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { useWorldStore } from './store';
import { VoxelEngine } from './VoxelEngine';
import { AuditReport } from './components/AuditReport';
import './App.css';

type Point3 = { x: number; y: number; z: number };

const API_INGEST = 'http://localhost:3000/api/world/ingest';
const BATCH_SIZE = 2000;
const STREAM_DELAY_MS = 100;

const INSIGHT_MESSAGES = [
  'ANALYZING_SPATIAL_DENSITY',
  'NOISE_FLOOR_NOMINAL',
  'VOXEL_OCCUPANCY_STABLE',
  'TEMPORAL_GRADIENT_LOCKED',
  'DISTRIBUTION_CLUSTERING_HEALTHY',
];

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
function isFinitePoint(point: Point3) {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

async function parsePlyFile(file: File): Promise<Point3[]> {
  const buffer = await file.arrayBuffer();
  const geometry = new PLYLoader().parse(buffer);
  const position = geometry.getAttribute('position');
  if (!position) return [];

  const points: Point3[] = [];
  for (let i = 0; i < position.count; i += 1) {
    const point = {
      x: position.getX(i),
      y: position.getY(i),
      z: position.getZ(i),
    };
    if (isFinitePoint(point)) points.push(point);
  }
  return points;
}

async function parseCsvFile(file: File): Promise<Point3[]> {
  const text = await file.text();
  const lines = text.split(/\r?\n/);
  const points: Point3[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const values = line.split(/[,\s]+/).filter(Boolean);
    if (values.length < 3) continue;

    const point = {
      x: Number(values[0]),
      y: Number(values[1]),
      z: Number(values[2]),
    };

    if (isFinitePoint(point)) points.push(point);
  }

  return points;
}

async function parseJsonFile(file: File): Promise<Point3[]> {
  const text = await file.text();
  const payload: unknown = JSON.parse(text);
  if (!Array.isArray(payload)) return [];

  const points: Point3[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    const point = {
      x: Number(candidate.x),
      y: Number(candidate.y),
      z: Number(candidate.z),
    };
    if (isFinitePoint(point)) points.push(point);
  }
  return points;
}

function formatSignalAge(timestamp: number | null) {
  if (!timestamp) return 'AWAITING';
  const ageMs = Date.now() - timestamp;
  if (ageMs < 250) return 'STABLE';
  if (ageMs < 1000) return 'LIVE';
  return 'STALE';
}

function formatTimecode(timestamp: number | null) {
  if (!timestamp) return '--:--:--';
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}


function IntegrityGauge({ integrity }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const clampedIntegrity = Math.max(0, Math.min(1, integrity));
  const dashOffset = circumference * (1 - clampedIntegrity);

  return (
    <section className="engine-panel integrity-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="panel-caption">Integrity</div>
      
      
      <div className="ring-shell" style={{ position: 'relative', width: '140px', height: '140px', display: 'grid', placeItems: 'center' }}>
        <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="70" cy="70" r={radius} className="ring-track" />
          <motion.circle
            cx="70"
            cy="70"
            r={radius}
            className="ring-progress"
            strokeDasharray={circumference}
            initial={false}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        </svg>
        
        
        <div className="ring-center" style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)', 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          pointerEvents: 'none', 
        }}>
        
          <motion.span
            initial={false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ fontSize: '1.4rem', fontWeight: '700', color: '#ffe7dc', lineHeight: '1.1' }}
          >
            {Math.round(clampedIntegrity * 100)}%
          </motion.span>
          <small style={{ fontSize: '0.55rem', color: 'rgba(255, 176, 142, 0.62)', marginTop: '4px', whiteSpace: 'nowrap' }}>
            WORLD_HEALTH
          </small>
        </div>
      </div>
    </section>
  );
}

function SystemControls() {
  const resetVolumetrics = useWorldStore((state) => state.resetVolumetrics);
  const ingestLastData = useWorldStore((state) => state.ingestLastData);
  const toggleReport = useWorldStore((state) => state.toggleReport);
  const metrics = useWorldStore((state) => state.metrics);
  

  return (
    <section className="engine-panel sidebar-panel">
      <div className="panel-caption">System_Controls</div>
      
      <button type="button" className="glass-button" onClick={() => void resetVolumetrics()}>
        {'> RESET_VOXELS'}
      </button>
      <button type="button" className="glass-button" onClick={() => void ingestLastData()}>
        {'> INGEST_LAST_DATA'}
      </button>
      <button type="button" className="glass-button" onClick={() => toggleReport(true)}>
        {'> GENERATE_AUDIT_REPORT'}
      </button>

      <div className="telemetry-block">
        <div className="telemetry-row">
          <span>Status</span>
          <strong>ACTIVE</strong>
        </div>
        <div className="telemetry-row">
          <span>Memory</span>
          <strong>{metrics.VOXEL_COUNT} VX</strong>
        </div>
        <div className="telemetry-row">
          <span>Signal</span>
          <strong>{formatSignalAge(metrics.LATEST_SIGNAL)}</strong>
        </div>
      </div>
    </section>
  );
}

function DatasetUploadPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queuedFileName = useWorldStore((state) => state.queuedFileName);
  const uploadStatus = useWorldStore((state) => state.uploadStatus);
  const isUploading = useWorldStore((state) => state.isUploading);
  const setUploadStatus = useWorldStore((state) => state.setUploadStatus);
  const setQueuedFileName = useWorldStore((state) => state.setQueuedFileName);
  const setUploadProgress = useWorldStore((state) => state.setUploadProgress);
  const setIsUploading = useWorldStore((state) => state.setIsUploading);
  const pushLog = useWorldStore((state) => state.pushLog);
  const pollDeltas = useWorldStore((state) => state.pollDeltas);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const acceptedTypes = '.ply,.csv,.json,text/csv,application/json';

  const handleSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setQueuedFileName(file?.name ?? 'NONE');
    setUploadStatus(file ? 'READY' : 'EXPECT_DATASET');
    setUploadProgress(0);
    if (file) pushLog(`QUEUED_DATASET_${file.name.toUpperCase()}`);
  };

  const parsePoints = async (file: File): Promise<Point3[]> => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (extension === 'ply') return parsePlyFile(file);
    if (extension === 'csv') return parseCsvFile(file);
    if (extension === 'json') return parseJsonFile(file);
    throw new Error(`Unsupported file format: ${extension || 'unknown'}`);
  };

  const streamToEngine = async (points: Point3[]) => {
    if (points.length === 0) throw new Error('No valid points detected');

    const totalBatches = Math.ceil(points.length / BATCH_SIZE);
    let batchCounter = 0;

    for (let offset = 0; offset < points.length; offset += BATCH_SIZE) {
      const batch = points.slice(offset, offset + BATCH_SIZE);
      const response = await fetch(API_INGEST, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ points: batch }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      batchCounter += 1;
      setUploadProgress(Math.round((batchCounter / totalBatches) * 100));
      await pollDeltas();

      if (batchCounter % 5 === 0) {
        const insight = INSIGHT_MESSAGES[Math.floor(batchCounter / 5) % INSIGHT_MESSAGES.length];
        pushLog(insight);
      }

      await wait(STREAM_DELAY_MS);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadStatus('STREAMING...');
    pushLog('STREAM_CHANNEL_ACTIVE');

    try {
      const points = await parsePoints(selectedFile);
      pushLog(`PARSED_POINTS_${points.length}`);
      await streamToEngine(points);
      setUploadStatus('COMPLETE');
      pushLog('INGESTION_COMPLETE');
    } catch (error) {
      console.warn('Dataset streaming failed', error);
      setUploadStatus('UPLOAD_FAULT');
      pushLog('UPLOAD_FAULT');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="engine-panel sidebar-panel upload-panel">
      <div className="panel-caption">Data_Intake</div>

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes}
        className="upload-input"
        onChange={handleFileChange}
        aria-label="Upload csv, json, or lidar dataset"
      />

      <div className="upload-dropzone" role="presentation" onClick={handleSelect}>
        <span>Compatible_Input</span>
        <strong>CSV / JSON / LIDAR</strong>
        <small>{selectedFile ? selectedFile.name : 'SELECT_A_SOURCE_FILE'}</small>
      </div>

      <div className="upload-actions">
        <button type="button" className="glass-button" onClick={handleSelect}>
          {'> BROWSE'}
        </button>
        <button
          type="button"
          className="glass-button"
          onClick={() => void handleUpload()}
          disabled={!selectedFile || isUploading}
        >
          {isUploading ? '> STREAMING...' : '> UPLOAD'}
        </button>
      </div>

      <div className="telemetry-block upload-telemetry">
        <div className="telemetry-row">
          <span>Queued_File</span>
          <strong>{queuedFileName}</strong>
        </div>
        <div className="telemetry-row">
          <span>Transfer_Status</span>
          <strong className="status-peach">{uploadStatus}</strong>
        </div>
      </div>
    </section>
  );
}

function EngineMetricsPanel() {
  const metrics = useWorldStore((state) => state.metrics);
  const mode = useWorldStore((state) => state.mode);
  const setMode = useWorldStore((state) => state.setMode);
  const uploadProgress = useWorldStore((state) => state.uploadProgress);
  const isUploading = useWorldStore((state) => state.isUploading);

  return (
    <motion.section
      className={`engine-panel metrics-panel engine-core ${mode === 'TEMPORAL_HINDSIGHT' ? 'hindsight' : 'live'}`}
      initial={false}
      animate={{
        y: mode === 'TEMPORAL_HINDSIGHT' ? 4 : 0,
        borderColor: mode === 'TEMPORAL_HINDSIGHT' ? 'rgba(112, 48, 96, 0.6)' : 'rgba(255, 176, 142, 0.2)',
        boxShadow:
          mode === 'TEMPORAL_HINDSIGHT'
            ? 'inset 0 1px 0 rgba(255, 214, 197, 0.12), 0 24px 80px rgba(48, 8, 42, 0.5)'
            : 'inset 0 1px 0 rgba(255, 214, 197, 0.12), 0 24px 80px rgba(0, 0, 0, 0.45)',
      }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <div className="panel-caption">Engine_Core</div>
      <div className="metrics-grid">
        <div>
          <span>Voxel_Count</span>
          <strong>{metrics.VOXEL_COUNT}</strong>
        </div>
        <div>
          <span>Seq_Id</span>
          <strong>{metrics.SEQ_ID}</strong>
        </div>
        <div>
          <span>Latest_Signal</span>
          <strong>{formatTimecode(metrics.LATEST_SIGNAL)}</strong>
        </div>
      </div>

      <div className="mode-switch">
        <button type="button" className={mode === 'LIVE' ? 'active' : ''} onClick={() => setMode('LIVE')}>
          Live
        </button>
        <button
          type="button"
          className={mode === 'TEMPORAL_HINDSIGHT' ? 'active' : ''}
          onClick={() => setMode('TEMPORAL_HINDSIGHT')}
        >
          Temporal_Hindsight
        </button>
      </div>
      <div
        className={`engine-core-progress ${isUploading || uploadProgress > 0 ? 'visible' : ''}`}
        style={{ width: `${uploadProgress}%` }}
      />
    </motion.section>
  );
}

function TemporalScrubber() {
  const tickOffset = useWorldStore((state) => state.tickOffset);
  const setTickOffset = useWorldStore((state) => state.setTickOffset);
  const mode = useWorldStore((state) => state.mode);

  return (
    <motion.section
      className={`engine-panel scrubber-panel ${mode === 'TEMPORAL_HINDSIGHT' ? 'active' : ''}`}
      initial={false}
      animate={{
        y: mode === 'TEMPORAL_HINDSIGHT' ? -2 : 0,
        borderColor: mode === 'TEMPORAL_HINDSIGHT' ? 'rgba(255, 176, 142, 0.34)' : 'rgba(255, 176, 142, 0.2)',
        boxShadow:
          mode === 'TEMPORAL_HINDSIGHT'
            ? 'inset 0 1px 0 rgba(255, 214, 197, 0.12), 0 20px 40px rgba(112, 48, 96, 0.18)'
            : 'inset 0 1px 0 rgba(255, 214, 197, 0.12), 0 24px 80px rgba(0, 0, 0, 0.45)',
      }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <div className="scrubber-header">
        <span>TEMPORAL_RECALL_BUFFER_32_TICKS</span>
        <motion.strong
          className={`live-pill ${mode === 'LIVE' ? 'active' : ''}`}
          initial={false}
          animate={{
            opacity: mode === 'LIVE' ? 1 : 0.55,
            scale: mode === 'LIVE' ? 1 : 0.96,
          }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          LIVE
        </motion.strong>
      </div>

      <input
        type="range"
        min={0}
        max={31}
        value={tickOffset}
        className="tick-slider"
        onChange={(event) => setTickOffset(Number(event.target.value))}
        aria-label="Temporal hindsight buffer"
      />

      <div className="scrubber-readout">
        <span>Tick_Offset</span>
        <strong>{tickOffset}</strong>
      </div>
    </motion.section>
  );
}

export default function App() {
  const pollDeltas = useWorldStore((state) => state.pollDeltas);
  const structuralHealth = useWorldStore((state) => state.structuralHealth);
  const isReportOpen = useWorldStore((state) => state.isReportOpen);

  useEffect(() => {
    void pollDeltas();
    const interval = window.setInterval(() => {
      void pollDeltas();
    }, 100);

    return () => window.clearInterval(interval);
  }, [pollDeltas]);

  return (
    <main className="engine-shell">
      <div className="scene-frame">
        <Canvas dpr={[1, 1.8]}>
          <color attach="background" args={['#080408']} />
          <fog attach="fog" args={['#080408', 14, 30]} />
          <PerspectiveCamera makeDefault position={[9, 7, 10]} fov={42} />
          <ambientLight intensity={0.75} color="#ffd7c6" />
          <directionalLight position={[8, 10, 6]} intensity={2.2} color="#ffe0d2" />
          <pointLight position={[-6, 5, -4]} intensity={12} color="#703060" distance={20} decay={2} />
          <pointLight position={[6, 4, 8]} intensity={9} color="#FFB08E" distance={20} decay={2} />
          <VoxelEngine />
          <OrbitControls makeDefault enableDamping dampingFactor={0.05} minDistance={5} maxDistance={500} />
        </Canvas>
      </div>

      <div className="scanlines" />
      <div className="scene-vignette" />

      <div className="ui-layer">
        <div className="left-rail">
          <SystemControls />
          <DatasetUploadPanel />
        </div>

        <div className="top-band">
          <EngineMetricsPanel />
          <IntegrityGauge integrity={structuralHealth} />
        </div>

        <div className="bottom-band">
          <TemporalScrubber />
        </div>
      </div>
      {isReportOpen ? <AuditReport /> : null}
    </main>
  );
}
