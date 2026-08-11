import type { Scene } from 'three';
import type { Rng } from '../core/Rng';
import { EnemyShip } from '../entities/EnemyShip';
import type { ParkedDefenderSpawn } from '../world/PlanetSurface';
import type { DifficultyDef } from './Difficulty';

interface SurfaceDefenderHost {
  scene: Scene;
  rng: Rng;
  difficulty: DifficultyDef;
  enemies: EnemyShip[];
}

/** Materialize the cold garrison hulls authored onto surface landing decks. */
export function spawnParkedSurfaceDefenders(
  host: SurfaceDefenderHost,
  spawns: readonly ParkedDefenderSpawn[],
  threatScale: number,
): void {
  for (let index = 0; index < spawns.length; index++) {
    const spawn = spawns[index];
    const kind = index % 3 === 2 ? 'brute' : 'raider';
    const enemy = new EnemyShip(
      kind,
      host.rng.fork(),
      Math.min(0.5 * host.difficulty.aggression, 0.85),
      host.difficulty.enemyToughness * threatScale,
      [],
      kind === 'raider' ? 'autogun' : undefined,
      spawn.baseId,
    );
    enemy.position.copy(spawn.position);
    enemy.faceToward(spawn.lookAt);
    enemy.parkAtBase();
    host.scene.add(enemy.object);
    host.enemies.push(enemy);
  }
}
