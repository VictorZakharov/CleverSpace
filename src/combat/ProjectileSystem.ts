import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Ship } from '../entities/Ship';
import { ParticleSystem } from '../fx/ParticleSystem';
import { AsteroidBody } from '../world/AsteroidField';
import { ENEMY_ROCKETS, EnemyOrdnanceMode, MISSILE } from './WeaponDefs';
import { segmentExitsAsteroidBody, segmentHitsAsteroid } from './ProjectileCollision';

export type Faction = 'player' | 'enemy';

export interface BoltSpawn {
  position: Vector3;
  direction: Vector3;
  speed: number;
  damage: number;
  faction: Faction;
  color: Color;
  boltLength: number;
  boltWidth: number;
  life: number;
}

export interface ProjectileHit {
  ship: Ship | null;             // null → hit an asteroid
  asteroid: AsteroidBody | null; // set when a rock was struck (mining!)
  point: Vector3;
  damage: number;
  faction: Faction;
  wasMissile: boolean;
  /** Exact outward contact normal when an asteroid mesh supplied the hit. */
  normal?: Vector3;
}

export interface MissileThreat {
  locked: boolean;
  imminent: boolean;
  /** Estimated seconds to impact for the nearest tracking missile. */
  timeToImpact: number;
  /** Active in-flight homing missiles whose live target is the player. */
  count: number;
}

export interface ProjectileSnapshot {
  faction: Faction;
  kind: 'bolt' | 'missile';
  homing: boolean;
  hasTarget: boolean;
  speed: number;
  spiral: boolean;
  trail: boolean;
}

interface Projectile {
  active: boolean;
  mesh: Mesh;
  material: MeshBasicMaterial;
  velocity: Vector3;
  damage: number;
  faction: Faction;
  life: number;
  kind: 'bolt' | 'missile';
  homing: boolean;
  target: Ship | null;
  accel: number;
  maxSpeed: number;
  turnRate: number;
  maxDistance: number;
  distanceTravelled: number;
  trailColor: Color;
  trailTimer: number;
  trailSize: number;
  spiral: boolean;
  spiralAge: number;
  spiralPhase: number;
  spiralRadius: number;
  spiralRate: number;
  spiralCenter: Vector3;
  spiralRight: Vector3;
  spiralUp: Vector3;
  /** Monotonic HUD countdown once this seeker enters the imminent window. */
  warningEta: number;
}

const newPos = new Vector3();
const closest = new Vector3();
const bestPoint = new Vector3();
const closestNormal = new Vector3();
const bestNormal = new Vector3();
const lookPoint = new Vector3();
const steer = new Vector3();
const trailPosition = new Vector3();
const trailVel = new Vector3();
const threatToPlayer = new Vector3();
const stepDelta = new Vector3();
const spiralAxis = new Vector3();
const spiralReference = new Vector3(0, 1, 0);
const spiralFallback = new Vector3(1, 0, 0);

function vertexShaded<T extends BufferGeometry>(
  geometry: T,
  shadeAt: (z: number) => number,
): T {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    const shade = shadeAt(position.getZ(index));
    colors.fill(shade, index * 3, index * 3 + 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

function vertexColored<T extends BufferGeometry>(geometry: T, color: Color): T {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

/** One draw-call rocket silhouette: pointed nose, fuselage, fins, and rear exhaust. */
function buildSalvoRocketGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [
    vertexColored(
      new CylinderGeometry(0.32, 0.4, 0.72, 8)
        .rotateX(Math.PI / 2)
        .translate(0, 0, -0.03),
      new Color(0x4b5961),
    ),
    vertexColored(
      new ConeGeometry(0.32, 0.28, 8)
        .rotateX(Math.PI / 2)
        .translate(0, 0, 0.47),
      new Color(0x27343b),
    ),
    vertexColored(
      new CylinderGeometry(0.405, 0.405, 0.075, 8)
        .rotateX(Math.PI / 2)
        .translate(0, 0, 0.05),
      new Color(0xb62b12),
    ),
    vertexColored(
      new BoxGeometry(1.42, 0.1, 0.34).translate(0, 0, -0.26),
      new Color(0xaab5ba),
    ),
    vertexColored(
      new BoxGeometry(0.1, 1.42, 0.34).translate(0, 0, -0.26),
      new Color(0xaab5ba),
    ),
    vertexColored(
      new CylinderGeometry(0.22, 0.28, 0.18, 8)
        .rotateX(Math.PI / 2)
        .translate(0, 0, -0.48),
      new Color(0xff4b10).multiplyScalar(2.4),
    ),
    vertexColored(
      new ConeGeometry(0.23, 0.72, 8)
        .rotateX(-Math.PI / 2)
        .translate(0, 0, -0.91),
      new Color(0xff7a18).multiplyScalar(2.8),
    ),
  ];
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Unable to assemble salvo rocket geometry');
  return merged;
}

/**
 * Pooled projectiles (bolts + homing missiles) with swept segment-vs-sphere
 * collision so nothing tunnels through targets at high speed or low frame
 * rate. Hits are reported to a callback; damage application stays in the
 * combat director.
 */
export class ProjectileSystem {
  readonly group = new Group();
  private readonly pool: Projectile[] = [];
  private readonly bodyCandidates: AsteroidBody[] = [];
  private readonly unitBox = vertexShaded(new BoxGeometry(1, 1, 1), () => 1);
  private readonly missileBody = vertexShaded(
    new CylinderGeometry(0.45, 0.75, 1, 6, 3).rotateX(Math.PI / 2),
    (z) => z < -0.34 ? 1 : z > 0.34 ? 0.3 : 0.04,
  );
  private readonly salvoRocketBody = buildSalvoRocketGeometry();
  private readonly threat: MissileThreat = {
    locked: false,
    imminent: false,
    timeToImpact: Infinity,
    count: 0,
  };

  constructor(
    private readonly particles: ParticleSystem,
    capacity = 320,
  ) {
    for (let i = 0; i < capacity; i++) {
      const material = new MeshBasicMaterial({
        color: 0xffffff,
        toneMapped: false,
        vertexColors: true,
      });
      const mesh = new Mesh(this.unitBox, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({
        active: false,
        mesh,
        material,
        velocity: new Vector3(),
        damage: 0,
        faction: 'player',
        life: 0,
        kind: 'bolt',
        homing: false,
        target: null,
        accel: 0,
        maxSpeed: 0,
        turnRate: 0,
        maxDistance: Infinity,
        distanceTravelled: 0,
        trailColor: new Color(),
        trailTimer: 0,
        trailSize: 1.6,
        spiral: false,
        spiralAge: 0,
        spiralPhase: 0,
        spiralRadius: 0,
        spiralRate: 0,
        spiralCenter: new Vector3(),
        spiralRight: new Vector3(),
        spiralUp: new Vector3(),
        warningEta: Infinity,
      });
    }
  }

  spawnBolt(s: BoltSpawn): void {
    const p = this.acquire();
    if (!p) return;
    p.active = true;
    p.kind = 'bolt';
    p.homing = false;
    p.spiral = false;
    p.target = null;
    p.damage = s.damage;
    p.faction = s.faction;
    p.life = s.life;
    p.maxDistance = Infinity;
    p.distanceTravelled = 0;
    p.velocity.copy(s.direction).normalize().multiplyScalar(s.speed);
    p.material.color.copy(s.color).multiplyScalar(3.2); // HDR — bloom picks it up
    p.mesh.geometry = this.unitBox;
    p.mesh.visible = true;
    p.mesh.position.copy(s.position);
    p.mesh.scale.set(s.boltWidth, s.boltWidth, s.boltLength);
    p.mesh.lookAt(newPos.copy(s.position).add(s.direction));
  }

  spawnMissile(position: Vector3, direction: Vector3, target: Ship | null): void {
    this.spawnOrdnance(position, direction, target, 'player', {
      damage: MISSILE.damage,
      speed: MISSILE.speed,
      accel: MISSILE.accel,
      maxSpeed: MISSILE.maxSpeed,
      turnRate: MISSILE.turnRate,
      life: MISSILE.life,
      maxDistance: MISSILE.maxDistance,
      color: MISSILE.color,
      homing: true,
    });
  }

  spawnEnemyRocket(
    position: Vector3,
    direction: Vector3,
    target: Ship,
    mode: EnemyOrdnanceMode,
    damageScale = 1,
    spiralPhase = 0,
  ): void {
    const def = ENEMY_ROCKETS[mode];
    this.spawnOrdnance(position, direction, mode === 'homing' ? target : null, 'enemy', {
      damage: def.damage * damageScale,
      speed: def.speed,
      accel: def.accel,
      maxSpeed: def.maxSpeed,
      turnRate: def.turnRate,
      life: def.life,
      maxDistance: def.maxDistance,
      color: def.color,
      homing: mode === 'homing',
      brightness: mode === 'salvo' ? 1 : 2.8,
      width: mode === 'salvo' ? 1.3 : 0.42,
      length: mode === 'salvo' ? 5 : 2.2,
      trailSize: mode === 'salvo' ? 0.9 : 1.6,
      spiralPhase: mode === 'salvo' ? spiralPhase : undefined,
      salvoStyle: mode === 'salvo',
    });
  }

  private spawnOrdnance(
    position: Vector3,
    direction: Vector3,
    target: Ship | null,
    faction: Faction,
    def: {
      damage: number;
      speed: number;
      accel: number;
      maxSpeed: number;
      turnRate: number;
      life: number;
      maxDistance: number;
      color: Color;
      homing: boolean;
      brightness?: number;
      width?: number;
      length?: number;
      trailSize?: number;
      spiralPhase?: number;
      salvoStyle?: boolean;
    },
  ): void {
    const p = this.acquire();
    if (!p) return;
    p.active = true;
    p.kind = 'missile';
    p.homing = def.homing;
    p.spiral = def.spiralPhase !== undefined;
    p.target = target;
    p.damage = def.damage;
    p.faction = faction;
    p.life = def.life;
    p.accel = def.accel;
    p.maxSpeed = def.maxSpeed;
    p.turnRate = def.turnRate;
    p.maxDistance = def.maxDistance;
    p.distanceTravelled = 0;
    p.trailTimer = 0;
    p.trailSize = def.trailSize ?? 1.6;
    p.warningEta = Infinity;
    p.velocity.copy(direction).normalize().multiplyScalar(def.speed);
    if (def.salvoStyle) p.material.color.setRGB(1, 1, 1);
    else p.material.color.copy(def.color).multiplyScalar(def.brightness ?? 2.8);
    p.trailColor.copy(def.color).multiplyScalar(def.salvoStyle ? 0.9 : 1);
    p.mesh.geometry = def.salvoStyle ? this.salvoRocketBody : this.missileBody;
    p.mesh.visible = true;
    p.mesh.position.copy(position);
    const width = def.width ?? (faction === 'enemy' ? 0.42 : 0.3);
    p.mesh.scale.set(width, width, def.length ?? (faction === 'enemy' ? 2.2 : 1.6));
    p.mesh.lookAt(newPos.copy(position).add(direction));
    p.spiralAge = 0;
    p.spiralPhase = def.spiralPhase ?? 0;
    p.spiralRadius = p.spiral ? 1.6 : 0;
    p.spiralRate = p.spiral ? 7.2 : 0;
    p.spiralCenter.copy(position);
    if (p.spiral) {
      spiralAxis.copy(direction).normalize();
      p.spiralRight.crossVectors(spiralAxis, spiralReference);
      if (p.spiralRight.lengthSq() < 1e-4) {
        p.spiralRight.crossVectors(spiralAxis, spiralFallback);
      }
      p.spiralRight.normalize();
      p.spiralUp.crossVectors(p.spiralRight, spiralAxis).normalize();
    }
  }

  update(
    dt: number,
    enemies: readonly Ship[],
    player: Ship | null,
    asteroids: readonly AsteroidBody[],
    onHit: (hit: ProjectileHit) => void,
    terrainHit?: (from: Vector3, to: Vector3, out: Vector3) => boolean,
    canTrack?: (target: Ship) => boolean,
    bodyQuery?: (
      from: Vector3,
      to: Vector3,
      out: AsteroidBody[],
    ) => readonly AsteroidBody[],
  ): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.release(p);
        continue;
      }

      if (p.homing && p.target) {
        if (!p.target.alive || (canTrack && !canTrack(p.target))) {
          p.target = null;
          p.warningEta = Infinity;
        } else {
          // Steer toward target, accelerate up to max speed.
          steer.copy(p.target.position).sub(p.mesh.position).normalize();
          const speed = Math.min(p.maxSpeed, p.velocity.length() + p.accel * dt);
          const dir = p.velocity.normalize();
          const angle = dir.angleTo(steer);
          const maxTurn = p.turnRate * dt;
          if (angle > 1e-4) {
            const t = Math.min(1, maxTurn / angle);
            dir.lerp(steer, t).normalize();
          }
          p.velocity.copy(dir).multiplyScalar(speed);
        }
      }

      if (p.kind === 'missile' && p.trailSize > 0) {
        // Fixed-rate exhaust keeps missile cost stable across frame rates.
        p.trailTimer -= dt;
        if (p.trailTimer <= 0) {
          p.trailTimer += p.spiral ? 0.025 : 0.035;
          const speed = p.velocity.length();
          trailPosition.copy(p.mesh.position);
          if (speed > 1e-5) {
            trailPosition.addScaledVector(
              p.velocity,
              -(p.spiral ? 5.2 : 1.1) / speed,
            );
          }
          trailVel.set(0, 0, 0);
          this.particles.spawn({
            position: trailPosition,
            velocity: trailVel,
            color: p.trailColor,
            size: p.trailSize,
            life: p.spiral ? 0.24 : 0.45,
          });
        }
      }

      if (p.spiral) {
        p.spiralAge += dt;
        p.spiralPhase += p.spiralRate * dt;
        p.spiralCenter.addScaledVector(p.velocity, dt);
        const radius = p.spiralRadius * Math.min(1, p.spiralAge / 0.22);
        newPos.copy(p.spiralCenter)
          .addScaledVector(p.spiralRight, Math.cos(p.spiralPhase) * radius)
          .addScaledVector(p.spiralUp, Math.sin(p.spiralPhase) * radius);
      } else {
        newPos.copy(p.mesh.position).addScaledVector(p.velocity, dt);
      }
      stepDelta.copy(newPos).sub(p.mesh.position);
      let expiresAtRange = false;
      if (p.kind === 'missile') {
        const stepDistance = stepDelta.length();
        const remainingDistance = Math.max(0, p.maxDistance - p.distanceTravelled);
        if (stepDistance >= remainingDistance) {
          if (stepDistance > 1e-8) {
            newPos.copy(p.mesh.position).addScaledVector(
              stepDelta,
              remainingDistance / stepDistance,
            );
          }
          p.distanceTravelled = p.maxDistance;
          expiresAtRange = true;
        } else {
          p.distanceTravelled += stepDistance;
        }
      }

      // Swept collision along this frame's travel segment.
      let hitSomething = false;
      let hitShip: Ship | null = null;
      let hitAsteroid: AsteroidBody | null = null;
      let hitNormal: Vector3 | null = null;
      let hitDistanceSq = Infinity;
      if (terrainHit?.(p.mesh.position, newPos, closest)) {
        hitSomething = true;
        hitDistanceSq = closest.distanceToSquared(p.mesh.position);
        bestPoint.copy(closest);
      }
      const targets: readonly Ship[] =
        p.faction === 'player' ? enemies : player && player.alive ? [player] : [];
      for (const ship of targets) {
        if (!ship.alive) continue;
        if (ship.intersectSegment(p.mesh.position, newPos, closest)) {
          const distanceSq = closest.distanceToSquared(p.mesh.position);
          if (distanceSq < hitDistanceSq) {
            hitSomething = true;
            hitDistanceSq = distanceSq;
            hitShip = ship;
            hitAsteroid = null;
            hitNormal = null;
            bestPoint.copy(closest);
          }
        }
      }
      {
        const collisionBodies = bodyQuery
          ? bodyQuery(p.mesh.position, newPos, this.bodyCandidates)
          : asteroids;
        for (const a of collisionBodies) {
          if (a.destroyed) continue;
          // Cheap broadphase: skip rocks far from the segment start.
          if (Math.abs(a.position.x - newPos.x) > a.radius + 40) continue;
          if (Math.abs(a.position.y - newPos.y) > a.radius + 40) continue;
          if (Math.abs(a.position.z - newPos.z) > a.radius + 40) continue;
          // A bolt that STARTS inside a body's bound is exiting its own
          // mount (rooftop turret, asteroid emplacement) — it can't hit that
          // body until it's outside, or it detonates at the muzzle.
          if (segmentExitsAsteroidBody(p.mesh.position, newPos, a)) continue;
          const bodyHit = segmentHitsAsteroid(
            p.mesh.position, newPos, a, closest, closestNormal,
          );
          if (bodyHit) {
            const distanceSq = closest.distanceToSquared(p.mesh.position);
            if (distanceSq < hitDistanceSq) {
              hitSomething = true;
              hitDistanceSq = distanceSq;
              hitShip = null;
              hitAsteroid = a;
              bestNormal.copy(closestNormal);
              hitNormal = bestNormal;
              bestPoint.copy(closest);
            }
          }
        }
      }

      if (hitSomething) {
        onHit({
          ship: hitShip,
          asteroid: hitAsteroid,
          point: bestPoint.clone(),
          damage: p.damage,
          faction: p.faction,
          wasMissile: p.kind === 'missile',
          normal: hitNormal?.clone(),
        });
        this.release(p);
        continue;
      }

      // Collision is swept only as far as the weapon's actual flight budget.
      // If nothing was struck before that endpoint, the missile dies there.
      if (expiresAtRange) {
        this.release(p);
        continue;
      }

      stepDelta.copy(newPos).sub(p.mesh.position);
      p.mesh.position.copy(newPos);
      p.mesh.lookAt(lookPoint.copy(newPos).add(stepDelta));
    }
  }

  clear(): void {
    for (const p of this.pool) this.release(p);
  }

  /** Reused warning snapshot for the HUD; no per-frame allocations. */
  incomingThreat(player: Ship): Readonly<MissileThreat> {
    const threat = this.threat;
    threat.locked = false;
    threat.imminent = false;
    threat.timeToImpact = Infinity;
    threat.count = 0;
    for (const p of this.pool) {
      if (
        !p.active || p.faction !== 'enemy' || p.kind !== 'missile' ||
        !p.homing || p.target !== player
      ) continue;
      threat.locked = true;
      threat.count++;
      threatToPlayer.copy(player.position).sub(p.mesh.position);
      const distance = Math.max(0, threatToPlayer.length() - player.radius);
      if (distance <= 1e-5) {
        p.warningEta = 0;
        threat.timeToImpact = 0;
        threat.imminent = true;
        continue;
      }
      threatToPlayer.divideScalar(distance + player.radius);
      const missileSpeed = p.velocity.length();
      const playerRadialSpeed = player.velocity.dot(threatToPlayer);
      const radialClosingSpeed = p.velocity.dot(threatToPlayer) - playerRadialSpeed;
      // Once a seeker has passed the player its ETA would rise while it loops
      // around. Drop the imminent timer until it is genuinely inbound again.
      if (radialClosingSpeed <= 0) {
        p.warningEta = Infinity;
        continue;
      }
      const currentPursuitSpeed = Math.max(1, missileSpeed - playerRadialSpeed);
      const maximumPursuitSpeed = Math.max(
        currentPursuitSpeed,
        p.maxSpeed - playerRadialSpeed,
      );
      // Project the accelerating pursuit rather than dividing by the current
      // radial closing speed. The old estimate stayed infinite while a seeker
      // turned, then jumped straight to ~0.6 s as soon as its nose aligned.
      const travelTime = acceleratingTravelTime(
        distance,
        currentPursuitSpeed,
        p.accel,
        maximumPursuitSpeed,
      );
      const alignment = missileSpeed > 1e-5
        ? Math.max(-1, Math.min(1, p.velocity.dot(threatToPlayer) / missileSpeed))
        : 1;
      const turnPenalty = p.turnRate > 0
        ? (Math.acos(alignment) / p.turnRate) * 0.35
        : 0;
      const time = travelTime + turnPenalty;
      if (time <= 2) {
        p.warningEta = Math.min(p.warningEta, time);
        threat.timeToImpact = Math.min(threat.timeToImpact, p.warningEta);
        threat.imminent = true;
      } else {
        p.warningEta = Infinity;
      }
    }
    return threat;
  }

  /** Test-harness snapshot; intentionally allocates only when explicitly called. */
  debugSnapshot(): ProjectileSnapshot[] {
    return this.pool
      .filter((p) => p.active)
      .map((p) => ({
        faction: p.faction,
        kind: p.kind,
        homing: p.homing,
        hasTarget: p.target !== null,
        speed: p.velocity.length(),
        spiral: p.spiral,
        trail: p.trailSize > 0,
      }));
  }

  private acquire(): Projectile | null {
    for (const p of this.pool) {
      if (!p.active) return p;
    }
    return null;
  }

  private release(p: Projectile): void {
    p.active = false;
    p.mesh.visible = false;
    p.target = null;
    p.warningEta = Infinity;
  }
}

/** Time to cover a distance while accelerating to a capped pursuit speed. */
function acceleratingTravelTime(
  distance: number,
  initialSpeed: number,
  acceleration: number,
  maximumSpeed: number,
): number {
  if (distance <= 0) return 0;
  const start = Math.max(1, Math.min(initialSpeed, maximumSpeed));
  if (acceleration <= 1e-5 || maximumSpeed <= start + 1e-5) {
    return distance / start;
  }
  const accelerationTime = (maximumSpeed - start) / acceleration;
  const accelerationDistance =
    start * accelerationTime + 0.5 * acceleration * accelerationTime ** 2;
  if (distance <= accelerationDistance) {
    return (Math.sqrt(start * start + 2 * acceleration * distance) - start) / acceleration;
  }
  return accelerationTime + (distance - accelerationDistance) / maximumSpeed;
}
