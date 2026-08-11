import { Vector3 } from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { ProjectileSystem } from '../combat/ProjectileSystem';
import { ENEMY_BOLT_COLOR } from '../combat/WeaponDefs';
import { EnemyShip } from '../entities/EnemyShip';
import { PlayerShip } from '../entities/PlayerShip';
import { Ship } from '../entities/Ship';

interface TutorialCombatHost {
  readonly audio: AudioEngine;
  readonly projectiles: ProjectileSystem;
  readonly player: PlayerShip;
}

const muzzle = new Vector3();
const direction = new Vector3();
const aim = new Vector3();
const offset = new Vector3();

/** Tutorial-only weapon staging plus confirmed player-seeker impact tracking. */
export class TutorialCombat {
  private readonly playerSeekerHits = new WeakMap<Ship, number>();

  constructor(private readonly host: TutorialCombatHost) {}

  fireBurst(enemy: EnemyShip): void {
    direction.copy(this.host.player.position).sub(enemy.position).normalize();
    offset.set(-direction.z, 0.12, direction.x).normalize().multiplyScalar(18);
    aim.copy(this.host.player.position).add(offset);
    for (const gunpoint of enemy.gunpoints) {
      muzzle.copy(gunpoint).applyQuaternion(enemy.object.quaternion).add(enemy.position);
      direction.copy(aim).sub(muzzle).normalize();
      this.host.projectiles.spawnBolt({
        position: muzzle, direction, speed: 190, damage: 0, faction: 'enemy',
        color: ENEMY_BOLT_COLOR, boltLength: 3.4, boltWidth: 0.18, life: 2.2,
      });
    }
    if (enemy.position.distanceTo(this.host.player.position) < 400) this.host.audio.laser(0.35);
  }

  fireHit(enemy: EnemyShip, damage: number): void {
    muzzle.copy(enemy.gunpoints[0]).applyQuaternion(enemy.object.quaternion).add(enemy.position);
    direction.copy(this.host.player.position).sub(muzzle).normalize();
    this.host.projectiles.spawnBolt({
      position: muzzle, direction, speed: 170, damage, faction: 'enemy',
      color: ENEMY_BOLT_COLOR, boltLength: 4.2, boltWidth: 0.24, life: 2.2,
    });
    this.host.audio.laser(0.65);
  }

  fireSeeker(enemy: EnemyShip): void {
    muzzle.copy(enemy.gunpoints[0]).applyQuaternion(enemy.object.quaternion).add(enemy.position);
    direction.copy(this.host.player.position).sub(muzzle).normalize();
    this.host.projectiles.spawnEnemyRocket(muzzle, direction, this.host.player, 'homing', 0);
    this.host.audio.enemyMissileLaunch();
  }

  recordPlayerSeekerImpact(target: Ship): void {
    this.playerSeekerHits.set(target, this.playerSeekerImpacts(target) + 1);
  }

  playerSeekerImpacts(target: Ship): number {
    return this.playerSeekerHits.get(target) ?? 0;
  }
}
