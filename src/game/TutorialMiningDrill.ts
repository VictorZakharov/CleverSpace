import { Vector3 } from 'three';
import { segmentHitsAsteroid } from '../combat/ProjectileCollision';
import { AsteroidBody } from '../world/AsteroidField';
import { TutorialHost } from './TutorialHost';
import { TutorialSpaceStaging } from './TutorialSpaceStaging';

interface MiningCandidate {
  body: AsteroidBody;
  pointIndex: number;
  approach: Vector3;
  score: number;
}

const outward = new Vector3();
const approach = new Vector3();
const firstHit = new Vector3();
const MIN_VIEW_DISTANCE = 105;
const PLAYER_CLEARANCE = 52;

/** Selects and stages a visible, reachable production ore vein. */
export class TutorialMiningDrill {
  private readonly staging: TutorialSpaceStaging;
  private body: AsteroidBody | null = null;
  private pointIndex = -1;
  private holdingsBefore = 0;

  constructor(private readonly host: TutorialHost) {
    this.staging = new TutorialSpaceStaging(host);
  }

  reset(): void {
    this.body = null;
    this.pointIndex = -1;
  }

  begin(): void {
    const candidate = this.findCandidate(false) ?? this.findCandidate(true);
    this.body = candidate?.body ?? null;
    this.pointIndex = candidate?.pointIndex ?? -1;
    this.holdingsBefore = this.holdings;
    if (!candidate) return;

    candidate.body.oreHp = Math.min(candidate.body.oreHp, 12);
    const player = this.host.player;
    player.position.copy(candidate.approach);
    player.velocity.set(0, 0, 0);
    player.faceToward(this.position!);
    this.host.targeting.current = null;
    this.host.chaseCam.snapTo(player.object);
  }

  update(): boolean {
    return this.holdings > this.holdingsBefore || this.body?.ore === null;
  }

  get position(): Vector3 | null {
    return this.body?.orePoints[this.pointIndex] ?? null;
  }

  private findCandidate(relaxed: boolean): MiningCandidate | null {
    let best: MiningCandidate | null = null;
    for (const body of this.host.worldBodies) {
      if (
        body.destroyed || body.ore === null || body.orePoints.length === 0 ||
        (!relaxed && (body.tumbling || body.radius > 55))
      ) continue;
      for (let index = 0; index < body.orePoints.length; index++) {
        const point = body.orePoints[index];
        const radius = body.orePointRadii[index] ?? Math.max(0.5, body.radius * 0.12);
        outward.copy(point).sub(body.position).normalize();
        const viewDistance = Math.max(MIN_VIEW_DISTANCE, Math.min(155, body.radius + 72));
        approach.copy(point).addScaledVector(outward, viewDistance);
        if (!this.clearApproach(approach, body)) continue;
        if (!this.host.hasLineOfSight(approach, point, body)) continue;
        this.previewCamera(approach, point);
        if (!this.staging.cameraLineClear(point, body)) continue;
        if (!segmentHitsAsteroid(this.host.chaseCam.camera.position, point, body, firstHit)) continue;
        if (firstHit.distanceTo(point) > radius * 1.08) continue;
        if (!segmentHitsAsteroid(approach, point, body, firstHit)) continue;
        if (firstHit.distanceTo(point) > radius * 1.08) continue;
        const score = radius - Math.max(0, body.radius - 38) * 0.04;
        if (!best || score > best.score) {
          best = { body, pointIndex: index, approach: approach.clone(), score };
        }
      }
    }
    return best;
  }

  private clearApproach(point: Vector3, selected: AsteroidBody): boolean {
    return !this.host.worldBodies.some((body) =>
      body !== selected && !body.destroyed &&
      point.distanceTo(body.position) < body.radius + PLAYER_CLEARANCE,
    );
  }

  private previewCamera(playerPosition: Vector3, target: Vector3): void {
    const player = this.host.player;
    player.position.copy(playerPosition);
    player.velocity.set(0, 0, 0);
    player.faceToward(target);
    this.host.chaseCam.snapTo(player.object);
  }

  private get holdings(): number {
    const counts = this.host.inventory.counts;
    return counts.scrap + counts.crystal + counts.flux;
  }
}
