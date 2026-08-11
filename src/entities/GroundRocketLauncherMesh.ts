import {
  BufferGeometry,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  SphereGeometry,
  Vector3,
} from 'three';
import { batchStaticMeshes } from '../rendering/StaticMeshBatching';
import { HullBuildResult, ShipBuildContext } from './ShipMeshBuilder';

/** Tracked eight-cell surface launcher with a separately animated elevation cradle. */
export function buildGroundRocketLauncherHull(
  context: ShipBuildContext,
): HullBuildResult {
  const {
    add,
    group,
    hullMat,
    panelMat,
    accentMat,
    canopyMat,
    darkMat,
  } = context;
  const paintedMat = hullMat.clone();
  paintedMat.color.set(0xffffff);
  paintedMat.emissive.set(0x20281d);
  paintedMat.emissiveIntensity = 0.55;
  paintedMat.metalness = 0.28;
  paintedMat.roughness = 0.58;
  paintedMat.vertexColors = true;
  const painted = (geometry: BufferGeometry, color: Color): Mesh => {
    const position = geometry.getAttribute('position');
    const colors = new Float32BufferAttribute(position.count * 3, 3);
    for (let index = 0; index < position.count; index++) {
      colors.setXYZ(index, color.r, color.g, color.b);
    }
    geometry.setAttribute('color', colors);
    return new Mesh(geometry, paintedMat);
  };
  const hullColor = hullMat.color.clone();
  const panelColor = panelMat.color.clone();
  const darkColor = darkMat.color.clone();
  const accentColor = accentMat.emissive.clone();
  const canopyColor = canopyMat.emissive.clone();

  add(painted(new BoxGeometry(5.6, 1.35, 6.7), hullColor), 0, 1.22, 0.2);
  add(painted(new BoxGeometry(5.0, 1.15, 4.9), panelColor), 0, 2.28, -0.15);
  add(painted(new BoxGeometry(3.8, 0.5, 1.2), darkColor), 0, 2.65, 2.3);

  // Continuous armored tracks and inset road wheels keep every visible part
  // physically connected for debris and geometry audits.
  for (const side of [-1, 1]) {
    add(painted(new BoxGeometry(1.25, 1.35, 7.5), darkColor), side * 3.05, 0.82, 0.35);
    add(painted(new BoxGeometry(0.22, 0.16, 6.5), accentColor), side * 3.7, 0.2, 0.35);
    for (const z of [-2.35, 0.15, 2.65]) {
      add(
        painted(new CylinderGeometry(0.63, 0.63, 1.3, 12), panelColor),
        side * 3.05,
        0.78,
        z,
        0,
        0,
        Math.PI / 2,
      );
      add(
        painted(new CylinderGeometry(0.25, 0.25, 1.55, 10), accentColor),
        side * 3.05,
        0.78,
        z,
        0,
        0,
        Math.PI / 2,
      );
    }
  }

  add(painted(new CylinderGeometry(2.15, 2.35, 0.72, 12), panelColor), 0, 3.18, -0.25);
  add(painted(new BoxGeometry(1.5, 0.7, 1.5), canopyColor), 1.55, 3.45, 0.5);
  add(painted(new SphereGeometry(0.24, 8, 6), accentColor), 1.55, 3.9, -0.22);

  const pitch = new Group();
  pitch.name = 'ground-launcher-pitch';
  pitch.position.set(0, 4.55, -0.35);
  group.add(pitch);
  const addPitch = (mesh: Mesh, x: number, y: number, z: number, rx = 0): void => {
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    pitch.add(mesh);
  };
  addPitch(painted(new BoxGeometry(4.8, 2.7, 2.5), hullColor), 0, 0, 0);
  addPitch(painted(new BoxGeometry(5.15, 0.34, 1.8), panelColor), 0, 1.28, -0.2);
  addPitch(painted(new BoxGeometry(5.15, 0.34, 1.8), panelColor), 0, -1.28, -0.2);

  const tube = new CylinderGeometry(0.32, 0.36, 4.0, 10);
  const muzzle = new CylinderGeometry(0.43, 0.43, 0.26, 10);
  for (let index = 0; index < 8; index++) {
    const angle = (index / 8) * Math.PI * 2;
    const tx = Math.cos(angle) * 1.55;
    const ty = Math.sin(angle) * 0.86;
    addPitch(painted(tube.clone(), darkColor), tx, ty, -2.0, Math.PI / 2);
    addPitch(painted(muzzle.clone(), accentColor), tx, ty, -4.04, Math.PI / 2);
  }
  addPitch(painted(new BoxGeometry(0.65, 0.65, 1.1), canopyColor), 0, 0, -1.76);
  batchStaticMeshes(pitch);
  pitch.traverse((object) => {
    if ((object as Mesh).isMesh) {
      object.userData.excludeFromBatching = true;
    }
  });

  return {
    gunpoints: [new Vector3(0, 4.55, -4.2)],
    enginePoints: [],
    radius: 5.1,
    hitBoxes: [
      { center: new Vector3(0, 1.6, 0.2), half: new Vector3(3.75, 1.65, 4.1) },
      { center: new Vector3(0, 4.55, -1.0), half: new Vector3(2.65, 1.55, 3.25) },
    ],
  };
}
