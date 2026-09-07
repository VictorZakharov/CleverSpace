import { Scene } from 'three';
import { EnemyShip } from '../entities/EnemyShip';
import { Turret } from '../entities/Turret';
import { CapitalShip } from '../entities/CapitalShip';

interface SpaceTrainingHost {
  scene: Scene;
  enemies: EnemyShip[];
  turrets: Turret[];
  capital: CapitalShip | null;
}

/** Only the course's actors may fight or lock systems during space lessons. */
export function isolateTutorialSpace(host: SpaceTrainingHost): void {
  if (host.enemies.some((enemy) => !enemy.training)) {
    host.enemies = host.enemies.filter((enemy) => {
      if (enemy.training) return true;
      enemy.alive = false;
      host.scene.remove(enemy.object);
      enemy.dispose();
      return false;
    });
  }
  if (host.turrets.length) {
    for (const turret of host.turrets) {
      turret.alive = false;
      host.scene.remove(turret.object);
      turret.dispose();
    }
    host.turrets = [];
  }
  if (host.capital) {
    host.capital.alive = false;
    host.scene.remove(host.capital.object);
    host.capital.dispose();
    host.capital = null;
  }
}
