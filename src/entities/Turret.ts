import { Matrix4, Quaternion, Vector3 } from 'three';
import {
  ENEMY_HOMING_COOLDOWN_MULTIPLIER,
  ENEMY_ROCKETS,
  EnemyRocketMode,
} from '../combat/WeaponDefs';
import { Rng } from '../core/Rng';
import { Ship } from './Ship';
import type { ShipKind } from './ShipMesh';

const toPlayer = new Vector3();
const fwd = new Vector3();
const targetQuat = new Quaternion();
const lookMat = new Matrix4();
const zero = new Vector3();
const up = new Vector3(0, 1, 0);
const sideHint = new Vector3(1, 0, 0);
const mountDelta = new Quaternion();
const mountInverse = new Quaternion();

export type TurretWeapon = 'bolt' | 'autogun' | EnemyRocketMode;

export const TURRET_WEAPON_STATS = {
  bolt: {
    hull: 60, shield: 0, range: 340, turnRate: 1.4,
    fireCooldown: 0.9, projectileSpeed: 200, damage: 8, score: 200,
  },
  autogun: {
    hull: 58, shield: 0, range: 468, turnRate: 1.7,
    fireCooldown: 0.11, projectileSpeed: 390, damage: 2.6, score: 225,
  },
  homing: {
    hull: 76, shield: 0, range: 520, turnRate: 1.0,
    fireCooldown: 3.4 * ENEMY_HOMING_COOLDOWN_MULTIPLIER,
    projectileSpeed: 92, damage: ENEMY_ROCKETS.homing.damage, score: 275,
  },
  fast: {
    hull: 70, shield: 0, range: 470, turnRate: 1.2,
    fireCooldown: 2.35, projectileSpeed: 285, damage: 24, score: 250,
  },
} as const;

/** Compatibility alias for ordinary gun batteries. */
export const TURRET_STATS = TURRET_WEAPON_STATS.bolt;

/**
 * Stationary defense emplacement guarding cave-asteroid bases. Tracks the
 * player inside its engagement range and fires twin bolts when aligned.
 * Reuses the Ship damage/health model so projectiles treat it like any hull.
 */
export class Turret extends Ship {
  readonly weapon: TurretWeapon;
  readonly stats: typeof TURRET_WEAPON_STATS[TurretWeapon];
  /** Current world-space outward normal for carrier mounts. */
  readonly mountNormal: Vector3 | null;
  /** Seconds of EMP stun remaining. */
  stunTimer = 0;
  private fireTimer: number;
  private capitalMountPosition: Vector3 | null = null;
  private capitalMountNormal: Vector3 | null = null;
  private homingRetaliation = false;
  private readonly capitalRotation = new Quaternion();

  constructor(
    rng: Rng,
    weapon: TurretWeapon = 'bolt',
    mountNormal: Vector3 | null = null,
    meshKind?: ShipKind,
  ) {
    const stats = TURRET_WEAPON_STATS[weapon];
    super(
      meshKind ?? (weapon === 'bolt'
        ? 'turret'
        : weapon === 'autogun' ? 'autogun-turret' : 'rocket-turret'),
      stats.hull,
      stats.shield,
    );
    this.weapon = weapon;
    this.stats = stats;
    this.mountNormal = mountNormal?.clone().normalize() ?? null;
    this.fireTimer = rng.range(0.4, 1.4);
  }

  /** Preserve this battery's authored local mount while the carrier moves. */
  bindCapitalMount(position: Vector3, normal: Vector3, rotation: Quaternion): void {
    this.capitalMountPosition = position.clone();
    this.capitalMountNormal = normal.clone().normalize();
    this.capitalRotation.copy(rotation);
  }

  get homingRetaliationArmed(): boolean {
    return this.homingRetaliation;
  }

  /** Allow one mounted seeker volley to answer an attack at bomber range. */
  armHomingRetaliation(): void {
    if (this.weapon === 'homing' && this.capitalMountPosition) {
      this.homingRetaliation = true;
    }
  }

  cancelHomingRetaliation(): void {
    this.homingRetaliation = false;
  }

  /** Follow carrier motion without discarding the battery's independent aim. */
  syncCapitalMount(
    capitalPosition: Vector3,
    capitalRotation: Quaternion,
    capitalVelocity: Vector3,
  ): void {
    if (!this.capitalMountPosition || !this.capitalMountNormal || !this.mountNormal) return;
    mountDelta.copy(capitalRotation).multiply(
      mountInverse.copy(this.capitalRotation).invert(),
    );
    this.object.quaternion.premultiply(mountDelta);
    this.capitalRotation.copy(capitalRotation);
    this.position.copy(this.capitalMountPosition)
      .applyQuaternion(capitalRotation)
      .add(capitalPosition);
    this.mountNormal.copy(this.capitalMountNormal)
      .applyQuaternion(capitalRotation)
      .normalize();
    this.velocity.copy(capitalVelocity);
  }

  canTraverse(target: Vector3): boolean {
    if (!this.mountNormal) return true;
    toPlayer.copy(target).sub(this.position);
    if (toPlayer.lengthSq() < 1e-6) return true;
    // Carrier mounts can swivel through a broad outward hemisphere but never
    // shoot through the deck to reach the opposite side of the hull.
    return toPlayer.normalize().dot(this.mountNormal) >= 0.08;
  }

  update(
    dt: number,
    playerPos: Vector3,
    playerAlive: boolean,
    fire: (t: Turret) => boolean | void,
    playerVisible = true,
    hasLineOfSight = playerVisible,
  ): void {
    if (!this.alive || !playerAlive) return;
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.updateCommon(dt);
      return;
    }
    if (!playerVisible || !hasLineOfSight || !this.canTraverse(playerPos)) {
      this.updateCommon(dt);
      return;
    }

    toPlayer.copy(playerPos).sub(this.position);
    const dist = toPlayer.length();
    const engagementRange = this.homingRetaliation
      ? ENEMY_ROCKETS.homing.attackRange
      : this.stats.range;
    if (dist > engagementRange) {
      this.updateCommon(dt);
      return;
    }

    // Swivel toward the player at a capped rate (-Z = barrels, see Ship.faceToward).
    // The up-hint must never be parallel to the aim direction: with the player
    // directly OVERHEAD (the normal case on planets), lookAt(…, (0,1,0))
    // degenerates and the barrels collapse into the ground.
    toPlayer.normalize();
    const hint = this.mountNormal && Math.abs(toPlayer.dot(this.mountNormal)) < 0.92
      ? this.mountNormal
      : Math.abs(toPlayer.y) > 0.85 ? sideHint : up;
    targetQuat.setFromRotationMatrix(lookMat.lookAt(zero, toPlayer, hint));
    this.object.quaternion.rotateTowards(targetQuat, this.stats.turnRate * dt);

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.forward(fwd);
      if (fwd.dot(toPlayer) > 0.97) {
        fire(this);
        this.homingRetaliation = false;
        this.fireTimer = this.stats.fireCooldown;
      }
    }
    this.updateCommon(dt);
  }
}
