import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Grid } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getVoxelVisibility, useWorldStore } from './store';
import type { Voxel } from './types';

const MAX_INSTANCES = 131072;
const PEACH = '#FFB38E';
const GLOW_ENTROPY_THRESHOLD = 0.6;
const NEON_GLOW = new THREE.Color('#FF7ED4');

export const VoxelEngine = memo(function VoxelEngine() {
  const voxelCount = useWorldStore((state) => state.voxels.length);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const transformRef = useMemo(() => new THREE.Object3D(), []);
  const voxelsRef = useRef<Voxel[]>(useWorldStore.getState().voxels);
  const modeRef = useRef(useWorldStore.getState().mode);
  const tickOffsetRef = useRef(useWorldStore.getState().tickOffset);
  const scanlineStartMsRef = useRef<number | null>(useWorldStore.getState().scanlineStartMs);
  const scanlineDurationMsRef = useRef(useWorldStore.getState().scanlineDurationMs);
  const scanlineMinXRef = useRef(useWorldStore.getState().scanlineMinX);
  const scanlineMaxXRef = useRef(useWorldStore.getState().scanlineMaxX);
  const instanceAlphaRef = useRef<Float32Array | null>(null);
  const instanceGlowRef = useRef<Float32Array | null>(null);
  const dirtyRef = useRef(true);

  useEffect(() => {
    const unsubscribe = useWorldStore.subscribe((state) => {
      const voxelsChanged = voxelsRef.current !== state.voxels;
      const modeChanged = modeRef.current !== state.mode;
      const tickChanged = tickOffsetRef.current !== state.tickOffset;
      const scanlineChanged =
        scanlineStartMsRef.current !== state.scanlineStartMs ||
        scanlineDurationMsRef.current !== state.scanlineDurationMs ||
        scanlineMinXRef.current !== state.scanlineMinX ||
        scanlineMaxXRef.current !== state.scanlineMaxX;

      if (!voxelsChanged && !modeChanged && !tickChanged && !scanlineChanged) return;
      voxelsRef.current = state.voxels;
      modeRef.current = state.mode;
      tickOffsetRef.current = state.tickOffset;
      scanlineStartMsRef.current = state.scanlineStartMs;
      scanlineDurationMsRef.current = state.scanlineDurationMs;
      scanlineMinXRef.current = state.scanlineMinX;
      scanlineMaxXRef.current = state.scanlineMaxX;
      dirtyRef.current = true;
    });

    return unsubscribe;
  }, []);

  useLayoutEffect(() => {
    dirtyRef.current = true;
    const mesh = meshRef.current;
    if (!mesh) return;
    const instanceAlpha = new Float32Array(MAX_INSTANCES);
    const instanceGlow = new Float32Array(MAX_INSTANCES);
    mesh.geometry.setAttribute('instanceAlpha', new THREE.InstancedBufferAttribute(instanceAlpha, 1));
    mesh.geometry.setAttribute('instanceGlow', new THREE.InstancedBufferAttribute(instanceGlow, 1));
    instanceAlphaRef.current = instanceAlpha;
    instanceGlowRef.current = instanceGlow;
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useLayoutEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `
attribute float instanceAlpha;
attribute float instanceGlow;
varying float vInstanceAlpha;
varying float vInstanceGlow;
${shader.vertexShader}
`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vInstanceAlpha = instanceAlpha;
vInstanceGlow = instanceGlow;`,
      );

      shader.fragmentShader = `
varying float vInstanceAlpha;
varying float vInstanceGlow;
${shader.fragmentShader}
`
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4(diffuse, opacity * vInstanceAlpha);')
        .replace(
          'vec3 totalEmissiveRadiance = emissive;',
          `vec3 totalEmissiveRadiance = emissive + vec3(${NEON_GLOW.r.toFixed(4)}, ${NEON_GLOW.g.toFixed(4)}, ${NEON_GLOW.b.toFixed(4)}) * vInstanceGlow;`,
        );
    };
    material.customProgramCacheKey = () => 'voxel-instanced-temporal-v2';
    material.needsUpdate = true;
  }, []);

  useFrame(() => {
    const nowMs = Date.now();
    const scanlineStartMs = scanlineStartMsRef.current;
    const scanlineDurationMs = scanlineDurationMsRef.current;
    const scanlineMinX = scanlineMinXRef.current;
    const scanlineMaxX = scanlineMaxXRef.current;
    const scanlineActive = scanlineStartMs !== null && nowMs - scanlineStartMs <= scanlineDurationMs;

    if (!dirtyRef.current && !scanlineActive) return;
    const mesh = meshRef.current;
    if (!mesh) return;
    const instanceAlpha = instanceAlphaRef.current;
    const instanceGlow = instanceGlowRef.current;
    if (!instanceAlpha || !instanceGlow) return;

    const voxels = voxelsRef.current;
    const mode = modeRef.current;
    const tickOffset = tickOffsetRef.current;
    const sweepProgress =
      scanlineStartMs === null || scanlineDurationMs <= 0
        ? 1
        : Math.max(0, Math.min(1, (nowMs - scanlineStartMs) / scanlineDurationMs));
    const sweepX = scanlineMinX + (scanlineMaxX - scanlineMinX) * sweepProgress;

    let instanceCount = 0;
    for (const voxel of voxels) {
      if (instanceCount >= MAX_INSTANCES) break;
      const visibleInTick = getVoxelVisibility(voxel.occupancy_history, tickOffset) === 1;
      const isGhost = mode === 'TEMPORAL_HINDSIGHT' && !visibleInTick;
      const hiddenByScanline = sweepProgress < 1 && voxel.x > sweepX;
      const alpha = hiddenByScanline ? 0.02 : isGhost ? 0.1 : 0.6;
      const glow = voxel.entropy > GLOW_ENTROPY_THRESHOLD ? Math.min(1, (voxel.entropy - GLOW_ENTROPY_THRESHOLD) / 0.4) : 0;

      transformRef.position.set(voxel.x, voxel.y, voxel.z);
      transformRef.rotation.set(0, 0, 0);
      transformRef.scale.set(1, 1, 1);
      transformRef.updateMatrix();
      mesh.setMatrixAt(instanceCount, transformRef.matrix);
      instanceAlpha[instanceCount] = alpha;
      instanceGlow[instanceCount] = glow;
      instanceCount += 1;
    }

    mesh.count = instanceCount;
    mesh.geometry.getAttribute('instanceAlpha').needsUpdate = true;
    mesh.geometry.getAttribute('instanceGlow').needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    dirtyRef.current = scanlineActive;
  });

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
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, MAX_INSTANCES]}
        count={voxelCount}
      >
        <boxGeometry args={[0.82, 0.82, 0.82]} />
        <meshStandardMaterial
          ref={materialRef}
          color={PEACH}
          transparent
          opacity={0.6}
          roughness={0.1}
          metalness={0.02}
          emissive={PEACH}
          emissiveIntensity={0.08}
        />
      </instancedMesh>
    </group>
  );
});
