import { Mesh, Object3D, Vector3 } from 'three';

export interface DebrisSourcePart {
  mesh: Mesh;
  size: number;
  elongation: number;
  maxExtent: number;
}

const worldScale = new Vector3();
const dimensions = new Vector3();
const MAX_FRAGMENT_ELONGATION = 6;

/** Select only authored hull components, never runtime VFX or trim rods. */
export function collectDebrisSourceParts(
  source: Object3D,
  hullRadius: number,
): DebrisSourcePart[] {
  const candidates: DebrisSourcePart[] = [];
  const maxExtent = Math.max(4, hullRadius * 2.2);
  source.traverse((object) => {
    if (!(object instanceof Mesh) || object.userData.shipDebrisSource !== true) return;
    object.geometry.computeBoundingSphere();
    object.geometry.computeBoundingBox();
    object.getWorldScale(worldScale);
    object.geometry.boundingBox?.getSize(dimensions);
    dimensions.set(
      Math.abs(dimensions.x * worldScale.x),
      Math.abs(dimensions.y * worldScale.y),
      Math.abs(dimensions.z * worldScale.z),
    );
    const extents = [dimensions.x, dimensions.y, dimensions.z].sort((a, b) => b - a);
    const elongation = extents[0] / Math.max(0.001, extents[1]);
    if (
      !Number.isFinite(elongation) ||
      elongation > MAX_FRAGMENT_ELONGATION ||
      extents[0] > maxExtent
    ) return;
    const radius = object.geometry.boundingSphere?.radius ?? 0;
    candidates.push({
      mesh: object,
      size: radius * Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z)),
      elongation,
      maxExtent: extents[0],
    });
  });
  return candidates.sort((a, b) => b.size - a.size);
}
