import { Scene, Vector3 } from 'three';
import { Rng } from '../core/Rng';
import { EnemyShip } from '../entities/EnemyShip';
import { GroundRocketLauncher } from '../entities/GroundRocketLauncher';
import { PlayerShip } from '../entities/PlayerShip';
import { Turret } from '../entities/Turret';
import { AsteroidBody } from '../world/AsteroidField';
import { PlanetSurface } from '../world/PlanetSurface';
import type {
  GroundLauncherSpawn,
  ParkedDefenderSpawn,
  SurfaceRepairPad,
} from '../world/PlanetSurfaceStructures';

export interface SurfaceTrainingHost {
  scene: Scene;
  rng: Rng;
  player: PlayerShip;
  surface: PlanetSurface | null;
  enemies: EnemyShip[];
  turrets: Turret[];
}

export interface TutorialSurfaceCandidate {
  baseId: number;
  base: Vector3;
  battery: Vector3;
  launcher: GroundLauncherSpawn;
  defender: ParkedDefenderSpawn;
  pad: SurfaceRepairPad;
  stash: AsteroidBody;
}

export function selectTutorialSurfaceBase(
  surface: PlanetSurface,
  player: PlayerShip,
): TutorialSurfaceCandidate | null {
  const stashes = surface.interactionBodies.filter((body) => body.stash);
  let selection: TutorialSurfaceCandidate | null = null;
  let travelDistance = -1;
  for (const landmark of surface.baseLandmarks) {
    const launcher = surface.groundLauncherSpawns.find((spawn) => spawn.baseId === landmark.baseId);
    const defender = surface.parkedDefenderSpawns.find((spawn) => spawn.baseId === landmark.baseId);
    const pad = surface.repairPads.find((value) => value.baseId === landmark.baseId);
    const stash = nearest(landmark.center, stashes);
    if (!landmark.trainingBattery || !launcher || !defender || !pad || !stash) continue;
    if (stash.position.distanceTo(landmark.center) > landmark.radius + 24) continue;
    const distance = landmark.center.distanceToSquared(player.position);
    if (distance <= travelDistance) continue;
    selection = {
      baseId: landmark.baseId,
      base: landmark.center,
      battery: landmark.trainingBattery,
      launcher,
      defender,
      pad,
      stash,
    };
    travelDistance = distance;
  }
  return selection;
}

export function replaceSurfaceActors(
  host: SurfaceTrainingHost,
  surface: PlanetSurface,
  candidate: TutorialSurfaceCandidate,
): {
  battery: Turret;
  crawler: GroundRocketLauncher;
  defender: EnemyShip;
  foreignDefender: EnemyShip | null;
} {
  for (const actor of [...host.enemies, ...host.turrets]) {
    host.scene.remove(actor.object);
    actor.dispose();
  }
  const battery = new Turret(host.rng.fork(), 'bolt');
  battery.surfaceBaseId = candidate.baseId;
  battery.position.copy(candidate.battery);
  battery.faceToward(host.player.position);
  const crawler = new GroundRocketLauncher(
    host.rng.fork(), candidate.launcher,
    (x, z) => surface.heightAt(x, z),
    (position, radius) => surface.isGroundUnitPositionClear(position, radius),
  );
  const defender = makeParkedDefender(host.rng, candidate.defender);
  const foreignSpawn = surface.parkedDefenderSpawns.find((spawn) =>
    spawn.baseId !== candidate.baseId,
  );
  const foreignDefender = foreignSpawn ? makeParkedDefender(host.rng, foreignSpawn) : null;
  host.turrets = [battery, crawler];
  host.enemies = foreignDefender ? [defender, foreignDefender] : [defender];
  for (const actor of [...host.turrets, ...host.enemies]) host.scene.add(actor.object);
  return { battery, crawler, defender, foreignDefender };
}

export function findTutorialCrawlerApproach(
  surface: PlanetSurface,
  base: Vector3,
  crawler: GroundRocketLauncher,
  hasLineOfSight: (from: Vector3, to: Vector3) => boolean,
): Vector3 {
  const outward = crawler.position.clone().sub(base).setY(0).normalize();
  const muzzle = crawler.position.clone().add(new Vector3(0, 4.55, 0));
  for (const angle of [0, 0.45, -0.45, 0.9, -0.9, Math.PI]) {
    const radial = outward.clone().applyAxisAngle(new Vector3(0, 1, 0), angle);
    for (const height of [35, 65, 95, 125]) {
      const point = crawler.position.clone().addScaledVector(radial, 180);
      point.y = Math.max(surface.heightAt(point.x, point.z) + height, muzzle.y + 18);
      const elevation = Math.atan2(point.y - muzzle.y, 180);
      if (elevation <= Math.PI * 0.24 && hasLineOfSight(muzzle, point)) return point;
    }
  }
  return base.clone().add(new Vector3(0, 70, 0));
}

function makeParkedDefender(rng: Rng, spawn: ParkedDefenderSpawn): EnemyShip {
  const defender = new EnemyShip('raider', rng.fork(), 0.45, 0.65, [], 'autogun', spawn.baseId);
  defender.position.copy(spawn.position);
  defender.faceToward(spawn.lookAt);
  defender.parkAtBase();
  return defender;
}

function nearest<T extends { position: Vector3 }>(point: Vector3, values: readonly T[]): T | null {
  return values.reduce<T | null>((best, value) => !best ||
    value.position.distanceToSquared(point) < best.position.distanceToSquared(point)
    ? value : best, null);
}
