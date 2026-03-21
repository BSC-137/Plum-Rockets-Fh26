import { useMemo, useRef } from 'react';
import { Grid, RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getVoxelVisibility, useWorldStore } from './store';

const PEACH = '#FFB08E';
const GHOST_PLUM = 'rgba(112, 48, 96, 0.4)';
const ANOMALY = '#FF4D00';

function VoxelNode({
  voxel,
  mode,
  tickOffset,
}: {
  voxel: {
    x: number;
    y: number;
    z: number;
    occupied: boolean;
    anomaly: boolean;
    occupancy_history: number;
  };
  mode: 'LIVE' | 'TEMPORAL_HINDSIGHT';
  tickOffset: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);

  const liveVisible = voxel.occupied;
  const historicalVisible = getVoxelVisibility(voxel.occupancy_history, tickOffset) === 1;
  const isActive = mode === 'LIVE' ? liveVisible : historicalVisible;
  const isGhost = mode === 'TEMPORAL_HINDSIGHT' && !historicalVisible;

  const baseColor = useMemo(() => new THREE.Color(PEACH), []);
  const ghostColor = useMemo(() => new THREE.Color(GHOST_PLUM), []);
  const anomalyColor = useMemo(() => new THREE.Color(ANOMALY), []);

  useFrame((state) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    const t = state.clock.elapsedTime;
    const throb = 1 + Math.sin(t * 2.6 + voxel.x * 0.35 + voxel.z * 0.2) * 0.035;
    const anomalyPulse = 1 + Math.sin(t * 12) * 0.1;
    const scale = voxel.anomaly && isActive ? anomalyPulse : isActive ? throb : 0.78;

    mesh.scale.setScalar(scale);
    material.color.copy(voxel.anomaly && isActive ? anomalyColor : isGhost ? ghostColor : baseColor);
    material.emissive.copy(voxel.anomaly && isActive ? anomalyColor : isGhost ? ghostColor : baseColor);
    material.emissiveIntensity = voxel.anomaly && isActive ? 0.95 : isGhost ? 0.06 : 0.22;
    material.opacity = isGhost ? 0.18 : isActive ? 0.92 : 0.05;
    material.roughness = isGhost ? 0.22 : 0.1;
  });

  if (!isActive && mode === 'LIVE') return null;

  return (
    <RoundedBox ref={meshRef} args={[0.82, 0.82, 0.82]} radius={0.04} smoothness={5} position={[voxel.x, voxel.y, voxel.z]}>
      <meshPhysicalMaterial
        ref={materialRef}
        transparent
        transmission={0.7}
        roughness={0.1}
        thickness={1}
        clearcoat={1}
        clearcoatRoughness={0.08}
        metalness={0.02}
        ior={1.2}
      />
    </RoundedBox>
  );
}

export function VoxelEngine() {
  const voxels = useWorldStore((state) => state.voxels);
  const mode = useWorldStore((state) => state.mode);
  const tickOffset = useWorldStore((state) => state.tickOffset);

  return (
    <group position={[-1.25, -1.25, -0.85]}>
      <Grid
        position={[1.25, -0.95, 1.25]}
        args={[24, 24]}
        cellSize={1}
        cellThickness={0.6}
        sectionSize={4}
        sectionThickness={1.2}
        fadeDistance={38}
        fadeStrength={1.6}
        cellColor="#703060"
        sectionColor="#9e577f"
        infiniteGrid
      />

      {voxels.map((voxel) => (
        <VoxelNode key={`${voxel.x}:${voxel.y}:${voxel.z}`} voxel={voxel} mode={mode} tickOffset={tickOffset} />
      ))}
    </group>
  );
}
