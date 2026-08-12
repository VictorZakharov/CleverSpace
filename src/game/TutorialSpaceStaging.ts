import { Vector3 } from 'three';
import { AsteroidBody } from '../world/AsteroidField';
import { TutorialHost } from './TutorialHost';

const WORLD_UP = new Vector3(0, 1, 0);
const forward = new Vector3();
const right = new Vector3();
const candidateDirection = new Vector3();
const path = new Vector3();
const nearest = new Vector3();
const screen = new Vector3();
const fallbackDirections = [WORLD_UP, new Vector3(0, -1, 0), new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)];
const yawOrder = [0, 0.32, -0.32, 0.64, -0.64, 0.96, -0.96, 1.28, -1.28, Math.PI];
const pitchOrder = [0, 0.24, -0.24, 0.48, -0.48, 0.72, -0.72];

/** Shared placement rules for tutorial actors that must be seen and approached. */
export class TutorialSpaceStaging {
  constructor(private readonly host: TutorialHost) {}

  targetPoint(distance: number, sideOffset = 0, aimed = true): Vector3 {
    const player = this.host.player;
    player.forward(forward).normalize();
    right.crossVectors(forward, WORLD_UP);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
    else right.normalize();
    const baseYaw = Math.atan2(sideOffset, distance);
    const originalForward = forward.clone();
    for (const pitch of pitchOrder) {
      for (const yawOffset of yawOrder) {
        const yaw = baseYaw + yawOffset;
        candidateDirection.copy(originalForward)
          .applyAxisAngle(right, pitch)
          .applyAxisAngle(WORLD_UP, yaw)
          .normalize();
        const point = player.position.clone().addScaledVector(candidateDirection, distance);
        if (!this.corridorClear(player.position, point, player.radius + 10)) continue;
        if (aimed) {
          player.faceToward(point);
          this.host.chaseCam.snapTo(player.object);
        }
        if (this.cameraSees(point)) return point;
      }
    }
    // The asteroid field is bounded around the origin. Move both ends beyond
    // that bound before accepting a fallback, preserving a checked corridor.
    let stagingOrigin: Vector3 | null = null;
    let point: Vector3 | null = null;
    for (const escape of fallbackDirections) {
      const origin = escape.clone().multiplyScalar(1900);
      const endpoint = origin.clone().addScaledVector(originalForward, distance);
      if (!this.corridorClear(origin, endpoint, player.radius + 10)) continue;
      stagingOrigin = origin;
      point = endpoint;
      break;
    }
    stagingOrigin ??= new Vector3(0, 1900, 0);
    point ??= stagingOrigin.clone().addScaledVector(originalForward, distance);
    player.position.copy(stagingOrigin);
    player.velocity.set(0, 0, 0);
    player.faceToward(point);
    this.host.chaseCam.snapTo(player.object);
    return point;
  }

  playerPointFacing(target: Vector3, distance: number, height = 0): Vector3 | null {
    this.host.player.forward(forward).normalize();
    for (const pitch of pitchOrder) {
      for (const yaw of yawOrder) {
        candidateDirection.copy(forward).applyAxisAngle(WORLD_UP, yaw);
        right.crossVectors(candidateDirection, WORLD_UP);
        if (right.lengthSq() > 1e-4) candidateDirection.applyAxisAngle(right.normalize(), pitch);
        const point = target.clone().addScaledVector(candidateDirection.normalize(), -distance);
        point.y += height;
        if (!this.corridorClear(point, target, this.host.player.radius + 4)) continue;
        this.host.player.position.copy(point);
        this.host.player.faceToward(target);
        this.host.chaseCam.snapTo(this.host.player.object);
        if (this.cameraSees(target)) return point;
      }
    }
    return null;
  }

  cameraSees(point: Vector3, ignoredBody?: AsteroidBody): boolean {
    const camera = this.host.chaseCam.camera;
    camera.updateMatrixWorld(true);
    screen.copy(point).project(camera);
    return screen.z >= -1 && screen.z <= 1 && Math.abs(screen.x) <= 0.9 &&
      Math.abs(screen.y) <= 0.9 &&
      this.host.hasLineOfSight(camera.position, point, ignoredBody) &&
      this.corridorClear(camera.position, point, 1.5, ignoredBody);
  }

  cameraLineClear(point: Vector3, ignoredBody?: AsteroidBody): boolean {
    return this.host.hasLineOfSight(this.host.chaseCam.camera.position, point, ignoredBody) &&
      this.corridorClear(this.host.chaseCam.camera.position, point, 1.5, ignoredBody);
  }

  corridorClear(
    from: Vector3,
    to: Vector3,
    clearance = 0,
    ignoredBody?: AsteroidBody,
  ): boolean {
    path.copy(to).sub(from);
    const lengthSq = path.lengthSq();
    if (lengthSq < 1e-6) return true;
    return !this.host.worldBodies.some((body) => {
      if (body === ignoredBody || body.destroyed || body.radius < 0.8) return false;
      const t = Math.max(0, Math.min(1,
        nearest.copy(body.position).sub(from).dot(path) / lengthSq));
      nearest.copy(from).addScaledVector(path, t);
      return nearest.distanceTo(body.position) < body.radius + clearance;
    });
  }
}
