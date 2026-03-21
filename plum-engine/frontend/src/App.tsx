import React, { useEffect, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useWorldStore } from './store'; 
import { Activity, Shield, Zap } from 'lucide-react';
import './App.css';

const VoxelVolume: React.FC = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const voxels = useWorldStore((state) => state.voxelsArray);
  
  const colorNominal = useMemo(() => new THREE.Color("#00FF41"), []);
  const colorAnomaly = useMemo(() => new THREE.Color("#FF3E00"), []);
  const colorGhost = useMemo(() => new THREE.Color("#111111"), []);

  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.92, 0.92, 0.92)), []);

  useEffect(() => {
    if (!meshRef.current ||  voxels.length === 0) return;
    
    const tempMatrix = new THREE.Matrix4();
    const tempColor = new THREE.Color();

    voxels.forEach((v, i) => {
      tempMatrix.setPosition(v.x, v.y, v.z);
      meshRef.current!.setMatrixAt(i, tempMatrix);

      if (v.anomaly) tempColor.copy(colorAnomaly);
      else if (!v.occupied) tempColor.copy(colorGhost).multiplyScalar(v.entropy + 0.05);
      else tempColor.copy(colorNominal).multiplyScalar(1.0 - v.entropy * 0.4);

      meshRef.current!.setColorAt(i, tempColor);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
   
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [voxels, colorNominal, colorAnomaly, colorGhost]);

  return (
    <group>
      <instancedMesh ref={meshRef} args={[null as any, null as any, 10000]} count={voxels.length}>
        <boxGeometry args={[0.92, 0.92, 0.92]} />
        <meshBasicMaterial transparent opacity={0.15} depthWrite={false} />
      </instancedMesh>

    </group>
  );
};

const App: React.FC = () => {
  const { fetchInitial, pollDeltas, sequenceId, count } = useWorldStore();

  useEffect(() => {
    fetchInitial();
    const interval = setInterval(pollDeltas, 100);
    return () => clearInterval(interval);
  }, [fetchInitial, pollDeltas]);

  return (
    <div className="engine-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Zap size={14} fill="#00FF41" /> PLUM_ENGINE_V1
        </div>

        <div className="sidebar-section">
          <div className="section-title">SYSTEM_CONTROLS</div>
          <button onClick={() => fetchInitial()} className="control-btn">
            {">"} RESET_VOLUMETRICS
          </button>
          <button className="control-btn disabled">
            {">"} INGEST_LAST_DATA
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="status-row"><span>STATUS:</span><span className="white">ACTIVE</span></div>
          <div className="status-row"><span>MEMORY:</span><span className="white">{count} VX</span></div>
          <div className="status-row"><span>SIGNAL:</span><span className="white">STABLE</span></div>
        </div>
      </aside>

      <main className="main-content">
        <div className="canvas-container">
          <Canvas>
            <color attach="background" args={['#020202']} />
            <PerspectiveCamera makeDefault position={[10, 10, 10]} />
            <OrbitControls autoRotate autoRotateSpeed={0.5} />
            <gridHelper 
              args={[20, 20, "#151515", "#151515"]} 
              position={[0, -0.51, 0]} 
            />
            <VoxelVolume />
          </Canvas>
        </div>

        <footer className="bottom-bar">
          <div className="bottom-info">
            <span className="info-item"><Activity size={10}/> REALTIME_BUFFER_OK</span>
            <span className="info-item"><Shield size={10}/> ENCRYPTION: AES-256</span>
            <span className="info-item seq-box">SEQ_ID: <span className="white">{sequenceId}</span></span>
          </div>
          <div className="bottom-location">SYDNEY_LAB // USYD_SUDATA</div>
        </footer>
      </main>
    </div>
  );
}

export default App;