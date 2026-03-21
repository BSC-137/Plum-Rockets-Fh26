import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { motion } from 'framer-motion';
import { useWorldStore } from './store';
import { VoxelEngine } from './VoxelEngine';
import './App.css';

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

function IntegrityGauge({ integrity }: { integrity: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const clampedIntegrity = Math.max(0, Math.min(1, integrity));
  const dashOffset = circumference * (1 - clampedIntegrity);

  return (
    <section className="engine-panel integrity-panel">
      <div className="panel-caption">Integrity</div>
      <div className="ring-shell">
        <svg className="integrity-ring" viewBox="0 0 140 140" aria-label="World structural health">
          <circle cx="70" cy="70" r={radius} className="ring-track" />
          <circle
            cx="70"
            cy="70"
            r={radius}
            className="ring-progress"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 70 70)"
          />
        </svg>
        <div className="ring-center">
          <span>{Math.round(clampedIntegrity * 100)}%</span>
          <small>WORLD_HEALTH</small>
        </div>
      </div>
    </section>
  );
}

function SystemControls() {
  const resetVolumetrics = useWorldStore((state) => state.resetVolumetrics);
  const ingestLastData = useWorldStore((state) => state.ingestLastData);
  const metrics = useWorldStore((state) => state.metrics);

  return (
    <section className="engine-panel sidebar-panel">
      <div className="panel-caption">System_Controls</div>
      <button type="button" className="glass-button" onClick={() => void resetVolumetrics()}>
        {'> RESET_VOLUMETRICS'}
      </button>
      <button type="button" className="glass-button" onClick={() => void ingestLastData()}>
        {'> INGEST_LAST_DATA'}
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

function EngineMetricsPanel() {
  const metrics = useWorldStore((state) => state.metrics);
  const mode = useWorldStore((state) => state.mode);
  const setMode = useWorldStore((state) => state.setMode);

  return (
    <motion.section
      className={`engine-panel metrics-panel ${mode === 'TEMPORAL_HINDSIGHT' ? 'hindsight' : 'live'}`}
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
        <span>[ TEMPORAL_RECALL_BUFFER_32_TICKS ]</span>
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
  const syncWorld = useWorldStore((state) => state.syncWorld);
  const structuralHealth = useWorldStore((state) => state.structuralHealth);

  useEffect(() => {
    void syncWorld();
    const interval = window.setInterval(() => {
      void syncWorld();
    }, 100);

    return () => window.clearInterval(interval);
  }, [syncWorld]);

  return (
    <main className="engine-shell">
      <div className="scene-frame">
        <Canvas dpr={[1, 1.8]}>
          <color attach="background" args={['#0A020C']} />
          <fog attach="fog" args={['#0A020C', 14, 30]} />
          <PerspectiveCamera makeDefault position={[9, 7, 10]} fov={42} />
          <ambientLight intensity={0.75} color="#ffd7c6" />
          <directionalLight position={[8, 10, 6]} intensity={2.2} color="#ffe0d2" />
          <pointLight position={[-6, 5, -4]} intensity={12} color="#703060" distance={20} decay={2} />
          <pointLight position={[6, 4, 8]} intensity={9} color="#FFB08E" distance={20} decay={2} />
          <VoxelEngine />
          <OrbitControls enableDamping dampingFactor={0.08} minDistance={7} maxDistance={18} target={[1, 1, 0]} />
        </Canvas>
      </div>

      <div className="scanlines" />
      <div className="scene-vignette" />

      <div className="ui-layer">
        <div className="left-rail">
          <SystemControls />
        </div>

        <div className="top-band">
          <EngineMetricsPanel />
          <IntegrityGauge integrity={structuralHealth} />
        </div>

        <div className="bottom-band">
          <TemporalScrubber />
        </div>
      </div>
    </main>
  );
}
