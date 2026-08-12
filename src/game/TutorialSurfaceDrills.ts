import { Vector3 } from 'three';
import { NavigationDestination } from './NavigationSystem';
import { TutorialStepId } from './TutorialCards';
import { TutorialHost } from './TutorialHost';
import { TutorialSurfaceTargets } from './TutorialSurfaceMission';

export type TutorialSurfaceStep = Extract<TutorialStepId,
  | 'surface-flight' | 'surface-alarm' | 'surface-clear'
  | 'surface-repair' | 'surface-stash' | 'lift'>;

const surfaceSteps = new Set<TutorialStepId>([
  'surface-flight', 'surface-alarm', 'surface-clear',
  'surface-repair', 'surface-stash', 'lift',
]);
const up = new Vector3(0, 1, 0);

export function isTutorialSurfaceStep(id: TutorialStepId): id is TutorialSurfaceStep {
  return surfaceSteps.has(id);
}

/** Current-base alarm, clearance and repair-pad progression. */
export class TutorialSurfaceDrills {
  private mission: TutorialSurfaceTargets | null = null;
  private readonly defenseWaypoint = new Vector3();
  private readonly liftWaypoint = new Vector3();
  private repairHullBefore = 0;

  constructor(private readonly host: TutorialHost) {}

  reset(): void {
    this.mission = null;
    this.repairHullBefore = 0;
  }

  enter(id: TutorialSurfaceStep): void {
    if (id === 'surface-flight') this.mission = this.host.prepareSurfaceMission();
    const mission = this.ensureMission();
    if (!mission) return;
    if (id === 'surface-alarm' || id === 'surface-clear') {
      mission.crawler.setMovementLocked(id === 'surface-alarm');
      mission.defender.notifyBaseAlert();
      this.updateDefenseWaypoint();
    }
    if (id === 'surface-repair' || id === 'surface-stash' || id === 'lift') {
      this.clearDefenses();
    }
    if (id === 'surface-repair') {
      this.host.player.hull = Math.min(this.host.player.hull, this.host.player.hullMax - 8);
      this.repairHullBefore = this.host.player.hull;
    }
    if (id === 'lift') {
      this.liftWaypoint.copy(this.host.player.position).addScaledVector(up, 140);
    }
  }

  update(id: TutorialSurfaceStep): boolean {
    const mission = this.mission;
    if (id === 'lift') return this.host.surface === null;
    if (!mission) return false;
    switch (id) {
      case 'surface-flight':
        return this.host.player.position.distanceTo(mission.approach) < 42;
      case 'surface-alarm':
        return mission.crawler.totalShotsFired >= 8 && mission.defender.pursuingPlayer;
      case 'surface-clear':
        this.updateDefenseWaypoint();
        return this.cleared;
      case 'surface-repair':
        return this.host.player.hull >= this.repairHullBefore + 1.5;
      case 'surface-stash':
        return mission.stash.destroyed;
    }
  }

  navigation(id: TutorialSurfaceStep): NavigationDestination | null {
    const mission = this.mission;
    if (!mission) return null;
    const position = id === 'surface-flight' ? mission.approach
      : id === 'surface-alarm' ? mission.crawler.position
        : id === 'surface-clear' ? this.defenseWaypoint
          : id === 'surface-repair' ? mission.pad.center
            : id === 'surface-stash' ? mission.stash.position : this.liftWaypoint;
    const label = id === 'surface-flight' ? 'Base observation point'
      : id === 'surface-alarm' ? 'Spiral crawler'
        : id === 'surface-clear' ? 'Base defenders'
          : id === 'surface-repair' ? 'H repair pad'
            : id === 'surface-stash' ? 'Salvage cache' : 'Skyward';
    return {
      key: position,
      label,
      kind: id === 'surface-flight' ? 'base' : id === 'surface-stash' ? 'stash' : 'objective',
      position,
      valid: id === 'surface-clear' ? () => !this.cleared
        : id === 'surface-stash' ? () => !mission.stash.destroyed : undefined,
    };
  }

  private ensureMission(): TutorialSurfaceTargets | null {
    this.mission ??= this.host.prepareSurfaceMission();
    return this.mission;
  }

  private updateDefenseWaypoint(): void {
    const target = this.defenses.find((defender) => defender.alive);
    if (target) this.defenseWaypoint.copy(target.position);
  }

  private clearDefenses(): void {
    for (const defender of this.defenses) {
      if (defender.alive) defender.takeDamage(1e6);
    }
    this.updateDefenseWaypoint();
  }

  private get defenses() {
    const mission = this.mission;
    return mission ? [mission.battery, mission.crawler, mission.defender] : [];
  }

  private get cleared(): boolean {
    return this.defenses.every((defender) => !defender.alive);
  }
}
