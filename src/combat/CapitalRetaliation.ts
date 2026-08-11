import { Vector3 } from 'three';
import type { CapitalShip } from '../entities/CapitalShip';
import type { PlayerShip } from '../entities/PlayerShip';
import type { Turret } from '../entities/Turret';

const attackDirection = new Vector3();

/** Arm only the carrier seeker mount whose outward face best covers the attacker. */
export function armCapitalHomingRetaliation(
  capital: CapitalShip,
  player: PlayerShip,
  turrets: readonly Turret[],
): void {
  attackDirection.copy(player.position).sub(capital.position).normalize();
  let selected: Turret | null = null;
  let bestFacing = -Infinity;
  for (const turret of turrets) {
    turret.cancelHomingRetaliation();
    if (!turret.alive || turret.weapon !== 'homing' || !turret.mountNormal) continue;
    const facing = turret.mountNormal.dot(attackDirection);
    if (facing <= bestFacing + 1e-6) continue;
    selected = turret;
    bestFacing = facing;
  }
  selected?.armHomingRetaliation();
}
