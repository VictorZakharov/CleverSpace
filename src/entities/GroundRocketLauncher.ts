import { Group, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { Rng } from '../core/Rng';
import type { GroundLauncherSpawn } from '../world/PlanetSurfaceStructures';
import { Turret } from './Turret';

export const GROUND_LAUNCHER_BURST_SIZE = 8;
export const GROUND_LAUNCHER_SHOT_INTERVAL = 0.12;
export const GROUND_LAUNCHER_RELOAD_TIME = 5.4;
export const GROUND_LAUNCHER_RANGE = 680;
export const GROUND_LAUNCHER_MAX_ELEVATION = Math.PI * 0.24;
export const GROUND_LAUNCHER_MIN_ELEVATION = -Math.PI * 0.04;

const up = new Vector3(0, 1, 0);
const zero = new Vector3();
const planarTarget = new Vector3();
const desiredPosition = new Vector3();
const moveDirection = new Vector3();
const candidatePosition = new Vector3();
const facing = new Vector3();
const targetDirection = new Vector3();
const launchRight = new Vector3();
const launchUp = new Vector3();
const targetQuaternion = new Quaternion();
const targetMatrix = new Matrix4();

/** Mobile surface-defense vehicle: terrain-following, base-leashed, and salvo driven. */
export class GroundRocketLauncher extends Turret {
  private readonly pitchPivot: Group;
  private readonly baseCenter: Vector3;
  private readonly leashRadius: number;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly canMoveTo: (position: Vector3, radius: number) => boolean;
  private reloadTimer: number;
  private shotTimer = 0;
  private burstRemaining = 0;
  private tubeIndex = 0;
  private aimElevation = 0;
  private rawTargetElevation = 0;
  private readonly aimDirection = new Vector3(0, 0, -1);
  private readonly aimPoint = new Vector3();
  private avoidanceSign = 1;
  private shotsFired = 0;
  private burstsCompleted = 0;

  constructor(
    rng: Rng,
    spawn: GroundLauncherSpawn,
    heightAt: (x: number, z: number) => number,
    canMoveTo: (position: Vector3, radius: number) => boolean,
  ) {
    super(rng, 'fast', up, 'ground-launcher');
    this.pitchPivot = this.exterior.getObjectByName('ground-launcher-pitch') as Group;
    this.surfaceBaseId = spawn.baseId;
    this.baseCenter = spawn.baseCenter.clone();
    this.leashRadius = spawn.leashRadius;
    this.heightAt = heightAt;
    this.canMoveTo = canMoveTo;
    this.reloadTimer = rng.range(0.8, 2.2);
    this.hullMax = 125;
    this.hull = this.hullMax;
    this.position.copy(spawn.position);
    this.position.y = this.heightAt(this.position.x, this.position.z) + 0.2;
    planarTarget.set(spawn.lookAt.x, this.position.y, spawn.lookAt.z);
    this.faceToward(planarTarget);
  }

  get shotsInCurrentBurst(): number {
    return this.burstRemaining > 0
      ? GROUND_LAUNCHER_BURST_SIZE - this.burstRemaining
      : 0;
  }

  get totalShotsFired(): number {
    return this.shotsFired;
  }

  get completedBursts(): number {
    return this.burstsCompleted;
  }

  get targetElevation(): number {
    return this.rawTargetElevation;
  }

  get currentAimElevation(): number {
    return this.aimElevation;
  }

  get distanceFromBase(): number {
    return Math.hypot(
      this.position.x - this.baseCenter.x,
      this.position.z - this.baseCenter.z,
    );
  }

  override get detectionRange(): number {
    return GROUND_LAUNCHER_RANGE;
  }

  /** Current muzzle and non-homing spiral direction consumed by GameCombat. */
  rocketLaunch(outPosition: Vector3, outDirection: Vector3): number {
    const angle = (this.tubeIndex / GROUND_LAUNCHER_BURST_SIZE) * Math.PI * 2;
    launchRight.crossVectors(this.aimDirection, up).normalize();
    launchUp.crossVectors(launchRight, this.aimDirection).normalize();
    outPosition.copy(this.position)
      .addScaledVector(up, 4.55)
      .addScaledVector(this.aimDirection, 4.05)
      .addScaledVector(launchRight, Math.cos(angle) * 1.55)
      .addScaledVector(launchUp, Math.sin(angle) * 0.86);
    // The rotating tube origins sell the spiral. Converging each unguided
    // rocket on the sampled aim point avoids a hollow cone that can orbit a
    // perfectly stationary ship without ever touching it.
    outDirection.copy(this.aimPoint).sub(outPosition).normalize();
    return angle;
  }

  override update(
    dt: number,
    playerPos: Vector3,
    playerAlive: boolean,
    fire: (turret: Turret) => boolean | void,
    playerVisible = true,
    hasLineOfSight = playerVisible,
  ): void {
    if (!this.alive || !playerAlive) return;
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.velocity.set(0, 0, 0);
      this.updateCommon(dt);
      return;
    }
    if (!playerVisible) {
      this.velocity.set(0, 0, 0);
      this.throttle = 0;
      this.updateCommon(dt);
      return;
    }

    this.aimPoint.copy(playerPos);
    this.turnToward(playerPos, dt);
    this.chaseWithinBase(playerPos, dt);
    const targetDistance = targetDirection.copy(playerPos).sub(this.position).length();
    const horizontalDistance = Math.hypot(targetDirection.x, targetDirection.z);
    this.rawTargetElevation = Math.atan2(targetDirection.y - 4.55, horizontalDistance);
    const desiredElevation = MathUtils.clamp(
      this.rawTargetElevation,
      GROUND_LAUNCHER_MIN_ELEVATION,
      GROUND_LAUNCHER_MAX_ELEVATION,
    );
    this.aimElevation = MathUtils.damp(this.aimElevation, desiredElevation, 5.2, dt);
    this.pitchPivot.rotation.x = this.aimElevation;

    planarTarget.copy(playerPos).sub(this.position).setY(0);
    if (planarTarget.lengthSq() > 1e-5) planarTarget.normalize();
    this.aimDirection.copy(planarTarget)
      .multiplyScalar(Math.cos(this.aimElevation))
      .addScaledVector(up, Math.sin(this.aimElevation))
      .normalize();
    this.forward(facing).setY(0).normalize();
    const inVerticalArc =
      this.rawTargetElevation >= GROUND_LAUNCHER_MIN_ELEVATION &&
      this.rawTargetElevation <= GROUND_LAUNCHER_MAX_ELEVATION;
    const canFire =
      hasLineOfSight &&
      targetDistance <= GROUND_LAUNCHER_RANGE &&
      inVerticalArc &&
      facing.dot(planarTarget) > 0.965 &&
      Math.abs(this.aimElevation - desiredElevation) < 0.055;

    this.reloadTimer -= dt;
    if (this.burstRemaining === 0 && this.reloadTimer <= 0 && canFire) {
      this.burstRemaining = GROUND_LAUNCHER_BURST_SIZE;
      this.shotTimer = 0;
    }
    if (this.burstRemaining > 0 && canFire) {
      this.shotTimer -= dt;
      if (this.shotTimer <= 0 && fire(this) !== false) {
        this.burstRemaining--;
        this.shotsFired++;
        this.tubeIndex = (this.tubeIndex + 1) % GROUND_LAUNCHER_BURST_SIZE;
        this.shotTimer = GROUND_LAUNCHER_SHOT_INTERVAL;
        if (this.burstRemaining === 0) {
          this.reloadTimer = GROUND_LAUNCHER_RELOAD_TIME;
          this.burstsCompleted++;
        }
      }
    }
    this.updateCommon(dt);
  }

  private turnToward(playerPos: Vector3, dt: number): void {
    planarTarget.set(playerPos.x - this.position.x, 0, playerPos.z - this.position.z);
    if (planarTarget.lengthSq() < 1e-5) return;
    planarTarget.normalize();
    targetQuaternion.setFromRotationMatrix(targetMatrix.lookAt(zero, planarTarget, up));
    this.object.quaternion.rotateTowards(targetQuaternion, 1.35 * dt);
  }

  private chaseWithinBase(playerPos: Vector3, dt: number): void {
    desiredPosition.set(playerPos.x, this.position.y, playerPos.z);
    moveDirection.copy(desiredPosition).sub(this.baseCenter).setY(0);
    const maxTargetRadius = this.leashRadius - this.radius - 1;
    if (moveDirection.lengthSq() > maxTargetRadius * maxTargetRadius) {
      moveDirection.setLength(maxTargetRadius);
      desiredPosition.copy(this.baseCenter).add(moveDirection);
    }
    moveDirection.copy(desiredPosition).sub(this.position).setY(0);
    const distance = moveDirection.length();
    if (distance < 42) {
      this.velocity.set(0, 0, 0);
      this.throttle = 0;
      return;
    }
    moveDirection.divideScalar(distance);
    const step = Math.min(distance - 42, 13.5 * dt);
    if (!this.tryMove(moveDirection, step, dt)) {
      const originalX = moveDirection.x;
      const originalZ = moveDirection.z;
      moveDirection.applyAxisAngle(up, this.avoidanceSign * 0.72);
      if (!this.tryMove(moveDirection, step, dt)) {
        moveDirection.set(originalX, 0, originalZ).applyAxisAngle(up, -this.avoidanceSign * 0.72);
        if (!this.tryMove(moveDirection, step, dt)) this.velocity.set(0, 0, 0);
      }
      this.avoidanceSign *= -1;
    }
    this.throttle = this.velocity.lengthSq() > 0.01 ? 0.72 : 0;
  }

  private tryMove(direction: Vector3, step: number, dt: number): boolean {
    candidatePosition.copy(this.position).addScaledVector(direction, step);
    const dx = candidatePosition.x - this.baseCenter.x;
    const dz = candidatePosition.z - this.baseCenter.z;
    if (dx * dx + dz * dz > (this.leashRadius - this.radius) ** 2) return false;
    candidatePosition.y = this.heightAt(candidatePosition.x, candidatePosition.z) + 0.2;
    if (!this.canMoveTo(candidatePosition, this.radius)) return false;
    this.velocity.copy(candidatePosition).sub(this.position).divideScalar(Math.max(dt, 1e-5));
    this.position.copy(candidatePosition);
    return true;
  }
}
