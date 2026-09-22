import * as THREE from 'three';
import type { BoxModel } from '../generators/types';
import { buildModelGroup, disposeGroup, modelRadius } from './buildScene';

/** Camera directions (azimuth, elevation in degrees) used for catalog previews. */
export const THUMB_ANGLES: Array<{ az: number; el: number; name: string }> = [
  { az: 35, el: 28, name: 'front' },
  { az: 145, el: 30, name: 'back' },
  { az: -50, el: 60, name: 'top' },
];

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;

function getRenderer(size: number): THREE.WebGLRenderer {
  if (!renderer) {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#b0a08a', 0.9));
    const d1 = new THREE.DirectionalLight('#ffffff', 1.6);
    d1.position.set(3, 5, 4);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight('#ffffff', 0.5);
    d2.position.set(-4, 2, -3);
    scene.add(d2);
  }
  renderer.setSize(size, size, false);
  return renderer;
}

/** Render a model from several angles into PNG data URLs. Synchronous; ~ms per image. */
export function renderThumbnails(model: BoxModel, size = 256, angles = THUMB_ANGLES): string[] {
  const r = getRenderer(size);
  const s = scene as THREE.Scene;
  const group = buildModelGroup(model);
  s.add(group);
  const radius = modelRadius(model);
  const camera = new THREE.PerspectiveCamera(32, 1, radius / 100, radius * 50);
  const out: string[] = [];
  for (const a of angles) {
    const d = radius * 3.4;
    const az = (a.az * Math.PI) / 180;
    const el = (a.el * Math.PI) / 180;
    camera.position.set(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    r.render(s, camera);
    out.push(r.domElement.toDataURL('image/png'));
  }
  s.remove(group);
  disposeGroup(group);
  return out;
}
