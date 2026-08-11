/** Exercise planetary scale, optional sky stations, and mobile spiral artillery. */
export async function runPlanetaryBaseSmoke(page) {
  const result = await page.evaluate(() => {
    const game = window.game;
    game.enterPlanet(0);
    game.loop.stop();
    const surface = game.surface;
    const launchers = game.turrets.filter((turret) => turret.kind === 'ground-launcher');
    const launcher = launchers[0];
    const spawn = surface.groundLauncherSpawns[0];
    if (!launcher || !spawn) return { staged: false };
    let launcherRenderMeshes = 0;
    launcher.object.traverse((object) => {
      if (object.isMesh && (object.layers.mask & 1) !== 0) launcherRenderMeshes++;
    });

    const baseRadius = Math.min(...surface.baseLandmarks.map((base) => base.radius));
    const baseStructureBodies = surface.bodies.filter((body) =>
      surface.baseLandmarks.some((base) =>
        body.position.distanceToSquared(base.center) < (base.radius + 20) ** 2
      ) && body.box
    ).length;
    const hover = surface.hoverBaseLandmarks[0] ?? null;
    let hoverClearance = 0;
    if (hover) {
      let peak = -Infinity;
      for (let sample = 0; sample < 16; sample++) {
        const angle = (sample / 16) * Math.PI * 2;
        peak = Math.max(peak, surface.heightAt(
          hover.center.x + Math.cos(angle) * hover.radius,
          hover.center.z + Math.sin(angle) * hover.radius,
        ));
      }
      hoverClearance = hover.center.y - peak;
    }

    const savedPlayerPosition = game.player.position.clone();
    const savedPlayerVelocity = game.player.velocity.clone();
    const savedLauncherPosition = launcher.position.clone();
    const savedLauncherRotation = launcher.object.quaternion.clone();
    const destroyedStates = surface.bodies.map((body) => body.destroyed);
    const liveMoveStart = launcher.position.clone();
    const radial = launcher.position.clone().sub(spawn.baseCenter).setY(0).normalize();
    const tangent = radial.clone().set(-radial.z, 0, radial.x);
    game.player.position.copy(launcher.position).addScaledVector(tangent, 85);
    game.player.position.y = launcher.position.y + 30;
    launcher.reloadTimer = 999;
    for (let frame = 0; frame < 240; frame++) {
      launcher.update(1 / 60, game.player.position, true, () => true, true, false);
    }
    const liveMovement = launcher.position.distanceTo(liveMoveStart);
    for (const body of surface.bodies) body.destroyed = true;
    game.projectiles.clear();
    game.player.alive = true;
    game.player.velocity.set(0, 0, 0);
    launcher.position.copy(spawn.position);
    launcher.object.quaternion.copy(savedLauncherRotation);
    launcher.reloadTimer = 0;
    launcher.burstRemaining = 0;
    launcher.shotTimer = 0;

    const inward = spawn.baseCenter.clone().sub(launcher.position).setY(0).normalize();
    game.player.position.copy(launcher.position).addScaledVector(inward, 150);
    game.player.position.y = surface.heightAt(
      game.player.position.x,
      game.player.position.z,
    ) + 45;
    const launches = [];
    const shotTimes = [];
    let time = 0;
    for (let frame = 0; frame < 480; frame++) {
      launcher.update(1 / 60, game.player.position, true, (source) => {
        const origin = source.position.clone();
        const direction = source.position.clone();
        source.rocketLaunch(origin, direction);
        launches.push({ origin: origin.clone(), direction: direction.clone() });
        shotTimes.push(time);
        return game.combat.turretFire(source);
      }, true, true);
      time += 1 / 60;
    }
    const projectileSnapshot = game.projectiles.debugSnapshot().filter(
      (shot) => shot.faction === 'enemy' && shot.kind === 'missile',
    );
    const firstBurst = launches.slice(0, 8);
    const distinctMuzzles = new Set(firstBurst.map(({ origin }) =>
      `${origin.x.toFixed(2)}:${origin.y.toFixed(2)}:${origin.z.toFixed(2)}`
    )).size;
    const distinctDirections = new Set(firstBurst.map(({ direction }) =>
      `${direction.x.toFixed(3)}:${direction.y.toFixed(3)}:${direction.z.toFixed(3)}`
    )).size;
    const reloadGap = shotTimes.length > 8 ? shotTimes[8] - shotTimes[7] : 0;

    game.projectiles.clear();
    launcher.position.copy(spawn.position);
    launcher.reloadTimer = 0;
    launcher.burstRemaining = 0;
    launcher.shotTimer = 0;
    game.player.position.copy(launcher.position).add({ x: 1, y: 420, z: 1 });
    let verticalShots = 0;
    for (let frame = 0; frame < 180; frame++) {
      launcher.update(1 / 60, game.player.position, true, () => {
        verticalShots++;
        return true;
      }, true, true);
    }
    const verticalAim = launcher.currentAimElevation;
    const rejectedElevation = launcher.targetElevation;

    launcher.position.copy(spawn.baseCenter);
    launcher.position.y = surface.heightAt(launcher.position.x, launcher.position.z) + 0.2;
    launcher.reloadTimer = 999;
    const chaseStart = launcher.position.clone();
    const outward = spawn.position.clone().sub(spawn.baseCenter).setY(0).normalize();
    game.player.position.copy(spawn.baseCenter).addScaledVector(outward, 900);
    game.player.position.y = launcher.position.y + 30;
    for (let frame = 0; frame < 1200; frame++) {
      launcher.update(1 / 60, game.player.position, true, () => true, true, false);
    }
    const moved = launcher.position.distanceTo(chaseStart);
    const leashDistance = launcher.distanceFromBase;
    const maxLeashDistance = spawn.leashRadius - launcher.radius;
    const groundFollowError = Math.abs(
      launcher.position.y - surface.heightAt(launcher.position.x, launcher.position.z) - 0.2,
    );

    launcher.position.copy(savedLauncherPosition);
    launcher.object.quaternion.copy(savedLauncherRotation);
    game.player.position.copy(savedPlayerPosition);
    game.player.velocity.copy(savedPlayerVelocity);
    surface.bodies.forEach((body, index) => { body.destroyed = destroyedStates[index]; });
    game.projectiles.clear();
    game.exitPlanet();

    return {
      staged: true,
      baseCount: surface.baseLandmarks.length,
      baseRadius,
      baseStructureBodies,
      launcherCount: launchers.length,
      launcherRenderMeshes,
      terrainRelief: surface.terrainMaxHeight - surface.terrainMinHeight,
      hoverCount: surface.hoverBaseLandmarks.length,
      hoverClearance: Number(hoverClearance.toFixed(1)),
      hoverSmallerThanGround: !hover || hover.radius < baseRadius,
      shots: launches.length,
      completedBursts: launcher.completedBursts,
      firstBurstSize: firstBurst.length,
      distinctMuzzles,
      distinctDirections,
      reloadGap: Number(reloadGap.toFixed(2)),
      unguided: projectileSnapshot.length >= 8 && projectileSnapshot.every(
        (shot) => !shot.homing && !shot.hasTarget,
      ),
      verticalShots,
      verticalAim: Number(verticalAim.toFixed(3)),
      rejectedElevation: Number(rejectedElevation.toFixed(3)),
      moved: Number(moved.toFixed(1)),
      liveMovement: Number(liveMovement.toFixed(1)),
      leashDistance: Number(leashDistance.toFixed(2)),
      maxLeashDistance: Number(maxLeashDistance.toFixed(2)),
      groundFollowError,
    };
  });
  console.log('planetary bases and spiral launcher:', JSON.stringify(result));
  return result;
}

export function collectPlanetaryBaseFailures(result) {
  if (
    !result.staged || result.baseCount < 2 || result.baseRadius < 115 ||
    result.baseStructureBodies < 30 || result.launcherCount < result.baseCount ||
    result.launcherRenderMeshes !== 2 ||
    result.terrainRelief < 450 || result.hoverCount > 1 ||
    (result.hoverCount === 1 && result.hoverClearance < 120) ||
    !result.hoverSmallerThanGround || result.firstBurstSize !== 8 ||
    result.distinctMuzzles !== 8 || result.distinctDirections !== 8 ||
    result.shots < 16 || result.completedBursts < 2 || result.reloadGap < 5.3 ||
    !result.unguided || result.verticalShots !== 0 || result.verticalAim > 0.755 ||
    result.rejectedElevation < 1.4 || result.moved < 20 || result.liveMovement < 5 ||
    result.leashDistance > result.maxLeashDistance + 0.05 || result.groundFollowError > 0.01
  ) return ['planetary bases and spiral launcher'];
  return [];
}
