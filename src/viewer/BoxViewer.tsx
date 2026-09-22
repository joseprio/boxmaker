import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BoxModel } from '../generators/types';
import { buildModelGroup, disposeGroup, modelRadius } from './buildScene';

interface Props {
  model: BoxModel;
  explode?: number;
  className?: string;
}

function Model({ model, explode }: { model: BoxModel; explode: number }) {
  const group = useMemo(() => buildModelGroup(model, { explode }), [model, explode]);
  useEffect(() => () => disposeGroup(group), [group]);
  return <primitive object={group} />;
}

/** Thin wrapper around three's OrbitControls (avoids pulling in drei). */
function OrbitControls({ maxDistance }: { maxDistance: number }) {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new ThreeOrbitControls(camera, gl.domElement), [camera, gl]);
  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    return () => controls.dispose();
  }, [controls]);
  useEffect(() => {
    controls.maxDistance = maxDistance;
  }, [controls, maxDistance]);
  useFrame(() => controls.update());
  return null;
}

/** Re-frames the camera whenever the model size changes significantly. */
function CameraRig({ radius }: { radius: number }) {
  const { camera } = useThree();
  const last = useRef(0);
  useEffect(() => {
    if (Math.abs(radius - last.current) / Math.max(radius, 1) < 0.15 && last.current > 0) return;
    last.current = radius;
    const d = radius * 2.4;
    camera.position.set(d * 0.8, d * 0.6, d * 0.9);
    camera.near = radius / 100;
    camera.far = radius * 50;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, radius]);
  return null;
}

export function BoxViewer({ model, explode = 0, className }: Props) {
  const radius = modelRadius(model);
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 40, position: [200, 150, 220] }}
        gl={{ antialias: true, preserveDrawingBuffer: false }}
        style={{ touchAction: 'none' }}
      >
        <color attach="background" args={['#f3efe7']} />
        <CameraRig radius={radius} />
        <hemisphereLight args={['#ffffff', '#b0a08a', 0.9]} />
        <directionalLight position={[3, 5, 4]} intensity={1.6} />
        <directionalLight position={[-4, 2, -3]} intensity={0.5} />
        <Model model={model} explode={explode} />
        <gridHelper
          args={[radius * 6, 24, '#c9c0b0', '#e0d8ca']}
          position={[0, -model.size.z / 2 - 0.5, 0]}
        />
        <OrbitControls maxDistance={radius * 20} />
      </Canvas>
    </div>
  );
}

