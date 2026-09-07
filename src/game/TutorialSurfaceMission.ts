import { Vector3 } from 'three';
import { EnemyShip } from '../entities/EnemyShip';
import { GroundRocketLauncher } from '../entities/GroundRocketLauncher';
import { Turret } from '../entities/Turret';
import { AsteroidBody } from '../world/AsteroidField';
import type { SurfaceRepairPad } from '../world/PlanetSurfaceStructures';
import {
  findTutorialCrawlerApproach,
  replaceSurfaceActors,
  selectTutorialSurfaceBase,
  SurfaceTrainingHost,
} from './TutorialSurfaceEncounter';

export interface TutorialSurfaceTargets {
  baseId: number;
  base: Vector3;
  approach: Vector3;
  battery: Turret;
  crawler: GroundRocketLauncher;
  defender: EnemyShip;
  foreignDefender: EnemyShip | null;
  pad: SurfaceRepairPad;
  stash: AsteroidBody;
}

/** Stage the real actors and authored targets used by the guided base raid. */
export function prepareTutorialSurfaceMission(
  host: SurfaceTrainingHost,
  hasLineOfSight: (from: Vector3, to: Vector3) => boolean,
): TutorialSurfaceTargets | null {
  const surface = host.surface;
  if (!surface) return null;
  const candidate = selectTutorialSurfaceBase(surface, host.player);
  if (!candidate) return null;
  const actors = replaceSurfaceActors(host, surface, candidate);
  const approach = findTutorialCrawlerApproach(
    surface, candidate.base, actors.crawler, hasLineOfSight,
  );
  if (!approach) return null;
  const mission: TutorialSurfaceTargets = {
    baseId: candidate.baseId,
    base: candidate.base,
    approach,
    ...actors,
    pad: candidate.pad,
    stash: candidate.stash,
  };
  mission.battery.shield = 0;
  mission.battery.hull = Math.min(mission.battery.hull, 24);
  mission.crawler.shield = 0;
  mission.crawler.hull = Math.min(mission.crawler.hull, 32);
  mission.defender.shield = 0;
  mission.defender.hull = Math.min(mission.defender.hull, 24);
  mission.foreignDefender && (mission.foreignDefender.training = true);
  mission.stash.destroyed = false;
  mission.stash.hp = 24;
  if (mission.stash.solo) mission.stash.solo.visible = true;
  return mission;
}
