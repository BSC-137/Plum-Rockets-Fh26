import React, { useEffect, useRef, useMemo } from 'react'; // ADD useMemo HERE
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useWorldStore } from './store';
import './App.css';

const VoxelVolume: React.FC = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const voxels = useWorldStore((state) => state.voxelsArray);

  // Constants for coloring - defined outside useEffect for performance
  const colorNominal = useMemo(() => new THREE.Color("#00FF41"), []); // Matrix Green
  const colorAnomaly = useMemo(() => new THREE.Color("#FF3E00"), []); // Anomaly Orange
  const colorGhost = useMemo(() => new THREE.Color("#111111"), []);   // Deep Obsidian Ghost

  useEffect(() => {
    if (!meshRef.current || voxels.length === 0) return;

    const tempMatrix = new THREE.Matrix4();
    const tempColor = new THREE.Color();

    voxels.forEach((v, i) => {
      // 1. Position the instance in 3D space
      tempMatrix.setPosition(v.x, v.y, v.z);
      meshRef.current!.setMatrixAt(i, tempMatrix);

      // 2. Calculate Adaptive Color Logic
      if (v.anomaly) {
        // High Entropy / Predictive Break
        tempColor.copy(colorAnomaly);
      } else if (!v.occupied) {
        // Object Permanence Ghosting
        // We dim the color based on the entropy (chaos history)
        tempColor.copy(colorGhost).multiplyScalar(v.entropy + 0.05);
      } else {
        // Nominal Occupied State
        // Subtle glow modulation based on entropy
        tempColor.copy(colorNominal).multiplyScalar(1.0 - v.entropy * 0.4);
      }
      
      meshRef.current!.setColorAt(i, tempColor);
    });

    // Notify Three.js that the GPU buffers need an update
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [voxels, colorNominal, colorAnomaly, colorGhost]);

  return (
    <instancedMesh 
      ref={meshRef} 
      // Cap at 10k instances for the prototype, but only RENDER voxels.length
      args={[null as any, null as any, 10000]} 
      count={voxels.length} 
    >
      <boxGeometry args={[0.92, 0.92, 0.92]} />
      <meshBasicMaterial transparent opacity={0.85} />
    </instancedMesh>
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
      <div className="hud">
        <div className="hud-item">SIGNAL: <span className="green">STABLE</span></div>
        <div className="hud-item">SEQ_ID: <span className="green">{sequenceId}</span></div>
        <div className="hud-item">MEMORY: <span className="green">{count} VOXELS</span></div>
      </div>
      <Canvas>
        <color attach="background" args={['#020202']} />
        <PerspectiveCamera makeDefault position={[5, 5, 5]} />
        <OrbitControls />
        <gridHelper args={[20, 20, "#151515", "#151515"]} />
        <VoxelVolume />
      </Canvas>
    </div>
  );
}

export default App;