import type { EnemyShip } from '../entities/EnemyShip';
import type { PlayerShip } from '../entities/PlayerShip';
import type { Turret } from '../entities/Turret';
import type { PlanetSurface } from '../world/PlanetSurface';

/** Wake only living defenders explicitly authored for one installation. */
export function alertSurfaceBaseDefenders(
  enemies: readonly EnemyShip[],
  baseId: number,
): number {
  let alerted = 0;
  for (const enemy of enemies) {
    if (!enemy.alive || enemy.surfaceBaseId !== baseId) continue;
    enemy.notifyBaseAlert();
    alerted++;
  }
  return alerted;
}

const REPAIR_RATE = 2;

/** Restore two hull points per second on a settled, cleared H pad. */
export function repairPlayerOnClearedPad(
  dt: number,
  surface: PlanetSurface | null,
  player: PlayerShip,
  enemies: readonly EnemyShip[],
  turrets: readonly Turret[],
): void {
  const baseIsLocked = (baseId: number): boolean =>
    enemies.some((enemy) => enemy.alive && enemy.surfaceBaseId === baseId) ||
    turrets.some((turret) => turret.alive && turret.surfaceBaseId === baseId);
  let repairingBaseId: number | null = null;
  if (
    surface && player.alive && player.hull < player.hullMax &&
    player.velocity.lengthSq() <= 4 * 4
  ) {
    const undersideY = player.position.y - player.radius;
    for (const pad of surface.repairPads) {
      const dx = player.position.x - pad.center.x;
      const dz = player.position.z - pad.center.z;
      if (dx * dx + dz * dz > pad.radius * pad.radius) continue;
      if (Math.abs(undersideY - pad.center.y) > 1.4) continue;
      if (baseIsLocked(pad.baseId)) break;
      repairingBaseId = pad.baseId;
      player.hull = Math.min(player.hullMax, player.hull + dt * REPAIR_RATE);
      break;
    }
  }
  surface?.updateRepairPadIndicators(
    dt,
    player.position,
    baseIsLocked,
    repairingBaseId,
  );
}
