import {
  Box3,
  BufferGeometry,
  Camera,
  InstancedMesh,
  Intersection,
  Material,
  Matrix4,
  Object3D,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from 'three';

const MAX_HITS = 8;
const raycaster = new Raycaster();
const instanceMatrix = new Matrix4();
const worldMatrix = new Matrix4();
const worldPosition = new Vector3();
const worldRotation = new Quaternion();
const worldScale = new Vector3();
const worldBox = new Box3();
const worldSize = new Vector3();

interface ProbeVector {
  x: number;
  y: number;
  z: number;
}

export interface SceneProbeHit {
  rank: number;
  distance: number;
  point: ProbeVector;
  type: string;
  name: string;
  uuid: string;
  instanceId: number | null;
  path: string;
  layerMask: number;
  geometry: string | null;
  materials: string[];
  position: ProbeVector;
  scale: ProbeVector;
  worldSize: ProbeVector | null;
  userData: Record<string, unknown>;
  ancestors: Array<{
    type: string;
    name: string;
    uuid: string;
    userData: Record<string, unknown>;
  }>;
}

export interface SceneProbeReport {
  ray: { origin: ProbeVector; direction: ProbeVector };
  totalIntersections: number;
  hits: SceneProbeHit[];
}

/** Log the visible scene objects beneath the center reticle for issue #18. */
export function inspectSceneCrosshair(scene: Scene, camera: Camera): SceneProbeReport {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  raycaster.layers.mask = camera.layers.mask;
  raycaster.setFromCamera(new Vector2(0, 0), camera);

  const intersections = raycaster
    .intersectObjects(scene.children, true)
    .filter((hit) => isWorldVisible(hit.object));
  const selected: Intersection<Object3D>[] = [];
  const seen = new Set<string>();
  for (const hit of intersections) {
    const key = `${hit.object.uuid}:${hit.instanceId ?? 'object'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(hit);
    if (selected.length === MAX_HITS) break;
  }

  const report: SceneProbeReport = {
    ray: {
      origin: vector(raycaster.ray.origin),
      direction: vector(raycaster.ray.direction),
    },
    totalIntersections: intersections.length,
    hits: selected.map((hit, index) => describeHit(hit, index + 1)),
  };

  if (report.hits.length === 0) {
    console.warn('[scene-probe] No visible object under the crosshair.', report);
    return report;
  }
  console.info(
    `[scene-probe] ${report.hits.length} distinct hit(s); nearest ` +
      `${label(report.hits[0])} at ${report.hits[0].distance} m.`,
  );
  console.table(report.hits.map((hit) => ({
    rank: hit.rank,
    distance: hit.distance,
    object: label(hit),
    geometry: hit.geometry,
    size: hit.worldSize ? formatVector(hit.worldSize) : '',
    path: hit.path,
  })));
  console.log('[scene-probe] Copyable report:', JSON.stringify(report, null, 2));
  console.log('[scene-probe] Raw hit objects:', selected.map((hit) => ({
    object: hit.object,
    instanceId: hit.instanceId ?? null,
    point: hit.point,
    distance: hit.distance,
  })));
  return report;
}

function describeHit(hit: Intersection<Object3D>, rank: number): SceneProbeHit {
  const object = hit.object;
  const instanceId = hit.instanceId ?? null;
  const geometry = (object as Object3D & { geometry?: BufferGeometry }).geometry ?? null;
  worldMatrix.copy(object.matrixWorld);
  if (instanceId !== null && (object as InstancedMesh).isInstancedMesh) {
    (object as InstancedMesh).getMatrixAt(instanceId, instanceMatrix);
    worldMatrix.multiply(instanceMatrix);
  }
  worldMatrix.decompose(worldPosition, worldRotation, worldScale);

  let size: ProbeVector | null = null;
  if (geometry) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      worldBox.copy(geometry.boundingBox).applyMatrix4(worldMatrix).getSize(worldSize);
      size = vector(worldSize);
    }
  }

  return {
    rank,
    distance: rounded(hit.distance),
    point: vector(hit.point),
    type: object.type,
    name: object.name,
    uuid: object.uuid,
    instanceId,
    path: objectPath(object),
    layerMask: object.layers.mask,
    geometry: geometry?.type ?? null,
    materials: materialsOf(object).map(materialLabel),
    position: vector(worldPosition),
    scale: vector(worldScale),
    worldSize: size,
    userData: summarizeUserData(object.userData),
    ancestors: ancestorChain(object),
  };
}

function materialsOf(object: Object3D): Material[] {
  const material = (object as Object3D & { material?: Material | Material[] }).material;
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function materialLabel(material: Material): string {
  const value = material as Material & {
    color?: { getHexString(): string };
    emissive?: { getHexString(): string };
  };
  const color = value.color ? ` color=#${value.color.getHexString()}` : '';
  const emissive = value.emissive ? ` emissive=#${value.emissive.getHexString()}` : '';
  return `${material.type}${material.name ? `(${material.name})` : ''}` +
    `${color}${emissive} opacity=${rounded(material.opacity)}`;
}

function ancestorChain(object: Object3D): SceneProbeHit['ancestors'] {
  const ancestors: SceneProbeHit['ancestors'] = [];
  let current = object.parent;
  while (current) {
    ancestors.push({
      type: current.type,
      name: current.name,
      uuid: current.uuid,
      userData: summarizeUserData(current.userData),
    });
    current = current.parent;
  }
  return ancestors;
}

function objectPath(object: Object3D): string {
  const path: string[] = [];
  let current: Object3D | null = object;
  while (current) {
    path.push(`${current.type}${current.name ? `(${current.name})` : ''}` +
      `[${current.uuid.slice(0, 8)}]`);
    current = current.parent;
  }
  return path.reverse().join(' > ');
}

function isWorldVisible(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function summarizeUserData(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) return [key, value];
    if (value instanceof Object3D) {
      return [key, `${value.type}(${value.name || value.uuid.slice(0, 8)})`];
    }
    return [key, `[${Array.isArray(value) ? `Array(${value.length})` : 'Object'}]`];
  }));
}

function label(hit: SceneProbeHit): string {
  const name = hit.name ? `(${hit.name})` : '';
  const instance = hit.instanceId === null ? '' : `#${hit.instanceId}`;
  return `${hit.type}${name}${instance}`;
}

function formatVector(value: ProbeVector): string {
  return `${value.x} x ${value.y} x ${value.z}`;
}

function vector(value: { x: number; y: number; z: number }): ProbeVector {
  return { x: rounded(value.x), y: rounded(value.y), z: rounded(value.z) };
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}
