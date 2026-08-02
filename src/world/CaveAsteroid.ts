import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PointLight,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';
import { TURRET_COLLISION_RADIUS } from '../entities/ShipMeshTypes';
import { getGlowTexture } from '../fx/textures';
import { getSurfaceTexture } from '../rendering/SurfaceTextures';
import { batchStaticMeshes } from '../rendering/StaticMeshBatching';
import { AsteroidBody, makeBody } from './AsteroidField';

export interface TurretSpawn {
  position: Vector3;
  lookAt: Vector3;
  /** Planetary installation ownership; absent for asteroid and sector posts. */
  baseId?: number;
}

interface ShellBoulder {
  position: Vector3;
  radius: number;
  mesh: Mesh;
}

interface TurretMount extends TurretSpawn {
  normal: Vector3;
  surface: Vector3;
  padLength: number;
}

const MAX_TURRET_PAD_LENGTH = 12;

/**
 * A hero asteroid you can fly INSIDE: a shell of huge boulders around a
 * hollow cavity, with two openings along its axis. The cavity hides the good
 * stuff — crystal-rich rocks, a loot stash — and is guarded by turret
 * emplacements (spawn points consumed by Game). Boulders are indestructible
 * structure; the interior rocks are normal destructible bodies.
 */
export class CaveAsteroid {
  readonly group = new Group();
  readonly center: Vector3;
  readonly maxMountLength: number;
  /** Where Game should place defense turrets. */
  readonly turretSpawns: TurretSpawn[] = [];
  /** Test/visual-harness view of the authored pedestal geometry. */
  readonly turretPads: { position: Vector3; normal: Vector3; length: number }[] = [];

  constructor(
    rng: Rng,
    center: Vector3,
    bodies: AsteroidBody[],
    cavityRadius = 65,
  ) {
    this.center = center.clone();
    this.group.position.copy(center);

    const rockMat = new MeshStandardMaterial({
      color: 0x706a60, roughness: 0.95, metalness: 0.04,
      map: getSurfaceTexture('rock', 2, 2),
      bumpMap: getSurfaceTexture('rock', 2, 2),
      bumpScale: 0.8,
    });

    // Axis of the two cave mouths.
    const [ax, ay, az] = rng.unitSphere();
    const axis = new Vector3(ax, ay, az).normalize();
    const shellGroup = new Group();
    const padGroup = new Group();
    this.group.add(shellGroup, padGroup);

    // Boulder shell: big displaced rocks on a sphere, skipping the axis caps.
    const shell: ShellBoulder[] = [];
    const boulderCount = 10;
    let placed = 0;
    let guard = 0;
    while (placed < boulderCount && guard++ < 200) {
      const [dx, dy, dz] = rng.unitSphere();
      const dir = new Vector3(dx, dy, dz);
      if (Math.abs(dir.dot(axis)) > 0.72) continue; // leave the mouths open

      const boulderRadius = cavityRadius * rng.range(0.52, 0.72);
      const geo = new IcosahedronGeometry(1, 2);
      displaceGeo(geo, rng, 0.22);
      const mesh = new Mesh(geo, rockMat);
      mesh.position.copy(dir).multiplyScalar(cavityRadius + boulderRadius * 0.55);
      mesh.scale.set(
        boulderRadius * rng.range(0.85, 1.15),
        boulderRadius * rng.range(0.85, 1.15),
        boulderRadius * rng.range(0.85, 1.15),
      );
      mesh.rotation.set(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28));
      shellGroup.add(mesh);

      bodies.push(makeBody({
        position: mesh.position.clone().add(center),
        radius: boulderRadius * 1.02,
        hp: Number.POSITIVE_INFINITY,
        solo: mesh,
        hero: true,
      }));
      shell.push({
        position: mesh.position.clone(),
        radius: boulderRadius * 1.02,
        mesh,
      });
      placed++;
    }

    // Interior: crystal-rich rocks lit by their own glow.
    const crystalMat = new MeshStandardMaterial({
      color: 0x0a1412, emissive: new Color(0x2ee6c8), emissiveIntensity: 2.1,
      roughness: 0.25, metalness: 0.1, flatShading: true,
    });
    for (let i = 0; i < 3; i++) {
      const [dx, dy, dz] = rng.unitSphere();
      const pos = new Vector3(dx, dy, dz).multiplyScalar(cavityRadius * 0.45);
      const rockRadius = rng.range(5, 8);
      const geo = new IcosahedronGeometry(1, 2);
      displaceGeo(geo, rng, 0.24);
      const rock = new Mesh(geo, rockMat);
      rock.position.copy(pos);
      rock.scale.setScalar(rockRadius);
      this.group.add(rock);
      const orePoints: Vector3[] = [];
      const orePointRadii: number[] = [];
      for (let s = 0; s < 3; s++) {
        const spike = new Mesh(new OctahedronGeometry(1, 0), crystalMat);
        const [sx, sy, sz] = rng.unitSphere();
        spike.position.set(sx * 0.5, sy * 0.5, sz * 0.5);
        spike.scale.set(0.18, 0.42, 0.18);
        spike.rotation.set(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6));
        rock.add(spike);
        orePoints.push(
          spike.position.clone().multiplyScalar(rockRadius).add(pos).add(center),
        );
        orePointRadii.push(rockRadius * 0.42);
      }
      bodies.push(makeBody({
        position: pos.clone().add(center),
        radius: rockRadius * 1.1,
        hp: 45,
        solo: rock,
        ore: 'crystal',
        oreHp: 45,
        oreHpMax: 45,
        orePoints,
        orePointRadii,
      }));
    }

    // The stash: an armored cache with a glowing seam.
    const stash = buildStashMesh();
    const [px, py, pz] = rng.unitSphere();
    stash.position.set(px, py, pz).multiplyScalar(cavityRadius * 0.3);
    this.group.add(stash);
    bodies.push(makeBody({
      position: stash.position.clone().add(center),
      radius: 4.5,
      hp: 30,
      solo: stash,
      stash: true,
    }));

    // Turret posts guarding each mouth — ANCHORED to the nearest shell
    // boulder on a mounting pad, never floating in open space.
    const padMat = new MeshStandardMaterial({
      color: 0x4a4640, roughness: 0.9, metalness: 0.15, flatShading: true,
    });
    for (const sign of [1, -1]) {
      const mouth = axis.clone().multiplyScalar(sign * cavityRadius);
      const mount = findTurretMount(mouth, center, shell, bodies);
      if (!mount) continue;
      const pad = new Mesh(new CylinderGeometry(2.2, 2.8, mount.padLength, 10), padMat);
      pad.position.copy(mount.surface).addScaledVector(mount.normal, mount.padLength * 0.5);
      pad.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), mount.normal);
      padGroup.add(pad);
      this.turretPads.push({
        position: pad.position.clone().add(center),
        normal: mount.normal.clone(),
        length: mount.padLength,
      });

      this.turretSpawns.push({
        position: mount.position,
        lookAt: mount.lookAt,
      });
    }
    this.maxMountLength = this.turretPads.reduce(
      (maximum, turretPad) => Math.max(maximum, turretPad.length),
      0,
    );
    batchStaticMeshes(shellGroup);
    batchStaticMeshes(padGroup);

    // Cavity ambience: a faint interior glow + haze sprite.
    const glow = new PointLight(0x2ee6c8, 1.4, cavityRadius * 2.4, 1.6);
    this.group.add(glow);
    const haze = new Sprite(new SpriteMaterial({
      map: getGlowTexture(),
      color: new Color(0x1a6a70),
      transparent: true,
      opacity: 0.16,
      blending: AdditiveBlending,
      depthWrite: false,
    }));
    haze.scale.setScalar(cavityRadius * 2.2);
    this.group.add(haze);
  }
}

/** Pick the nearest mouth-side boulder that needs only a short, attached pad. */
function findTurretMount(
  mouth: Vector3,
  center: Vector3,
  shell: readonly ShellBoulder[],
  bodies: readonly AsteroidBody[],
): TurretMount | null {
  const sameSide = shell.filter((boulder) => boulder.position.dot(mouth) > 0);
  const candidates = (sameSide.length > 0 ? sameSide : [...shell])
    .sort((a, b) => a.position.distanceToSquared(mouth) - b.position.distanceToSquared(mouth));
  for (const boulder of candidates) {
    const normal = mouth.clone().sub(boulder.position).normalize();
    const surfaceDistance = supportDistance(boulder.mesh, normal);
    const surface = boulder.position.clone().addScaledVector(normal, surfaceDistance);
    const rootDistance = Math.max(surfaceDistance, boulder.radius) +
      TURRET_COLLISION_RADIUS + 0.35;
    const position = clearTurretSpawn(
      boulder.position.clone().add(center).addScaledVector(normal, rootDistance),
      normal,
      bodies,
    );
    const padLength = Math.max(
      1.2,
      position.clone().sub(center).sub(surface).dot(normal) - 0.65,
    );
    if (padLength > MAX_TURRET_PAD_LENGTH) continue;
    return {
      position,
      lookAt: mouth.clone().normalize().multiplyScalar(500).add(center),
      normal,
      surface,
      padLength,
    };
  }
  return null;
}

/** Furthest actual mesh vertex in a world-local direction after scale/rotation. */
function supportDistance(mesh: Mesh, direction: Vector3): number {
  const positions = mesh.geometry.attributes.position;
  const vertex = new Vector3();
  let distance = 0;
  for (let index = 0; index < positions.count; index++) {
    vertex.fromBufferAttribute(positions, index)
      .multiply(mesh.scale)
      .applyQuaternion(mesh.quaternion);
    distance = Math.max(distance, vertex.dot(direction));
  }
  return distance;
}

/** Push a mount outward until its complete hit sphere clears every rock body. */
function clearTurretSpawn(
  position: Vector3,
  outward: Vector3,
  bodies: readonly AsteroidBody[],
): Vector3 {
  const result = position.clone();
  const radius = TURRET_COLLISION_RADIUS + 0.18;
  const offset = new Vector3();
  for (let pass = 0; pass < 8; pass++) {
    let requiredPush = 0;
    for (const body of bodies) {
      if (body.destroyed) continue;
      offset.copy(result).sub(body.position);
      const minimum = body.radius + radius;
      const distanceSq = offset.lengthSq();
      // A body farther along this ray is not a mount collision. Without this
      // overlap guard, the pedestal stretches past arbitrary distant rocks.
      if (distanceSq >= minimum * minimum) continue;
      const along = offset.dot(outward);
      const perpendicularSq = Math.max(0, distanceSq - along * along);
      const exit = -along + Math.sqrt(minimum * minimum - perpendicularSq) + 0.08;
      requiredPush = Math.max(requiredPush, exit);
    }
    if (requiredPush <= 0) break;
    result.addScaledVector(outward, requiredPush);
  }
  return result;
}

function displaceGeo(geo: IcosahedronGeometry, rng: Rng, amount: number): void {
  const pos = geo.attributes.position;
  const v = new Vector3();
  const seed = rng.range(0, 100);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n =
      Math.sin(v.x * 3.1 + seed) +
      Math.sin(v.y * 4.3 + seed * 1.7) +
      Math.sin(v.z * 3.7 + seed * 2.3);
    v.multiplyScalar(1 + (n / 3) * amount);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const normal = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    normal.setXYZ(i, v.x, v.y, v.z);
  }
  normal.needsUpdate = true;
}

/** Armored cache: dark hull with a bright energy seam — obviously loot. */
function buildStashMesh(): Mesh {
  const bodyMat = new MeshStandardMaterial({
    color: 0x2c3238, metalness: 0.75, roughness: 0.35, flatShading: true,
  });
  const seamMat = new MeshStandardMaterial({
    color: 0x110800, emissive: new Color(0xffb347), emissiveIntensity: 3,
  });
  const root = new Mesh(new BoxGeometry(4.4, 2.6, 2.8), bodyMat);
  const seam = new Mesh(new BoxGeometry(4.5, 0.18, 0.5), seamMat);
  root.add(seam);
  const seam2 = new Mesh(new BoxGeometry(0.5, 0.18, 2.9), seamMat);
  seam2.position.y = 0.01;
  root.add(seam2);
  root.rotation.set(0.4, 0.7, 0.2);
  return root;
}
