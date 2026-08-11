/** Focused regressions for installation ownership, repair pads, and salvo presentation. */
export async function runPlanetaryBaseBehavior(page) {
  const result = await page.evaluate(() => {
    const game = window.game;
    game.enterPlanet(0);
    game.loop.stop();
    const surface = game.surface;
    const launcher = game.turrets.find((turret) => turret.kind === 'ground-launcher');
    const spawn = surface?.groundLauncherSpawns[0];
    const repairPad = surface?.repairPads[0];
    if (!surface || !launcher || !spawn || !repairPad) return { staged: false };

    let foundationHeightError = 0;
    for (const base of surface.baseLandmarks) {
      for (let sample = 0; sample < 16; sample++) {
        const angle = (sample / 16) * Math.PI * 2;
        foundationHeightError = Math.max(
          foundationHeightError,
          Math.abs(surface.heightAt(
            base.center.x + Math.cos(angle) * base.radius,
            base.center.z + Math.sin(angle) * base.radius,
          ) - base.center.y),
        );
      }
    }
    const hover = surface.hoverBaseLandmarks[0] ?? null;
    const hoverTurretCount = hover
      ? game.turrets.filter((turret) => turret.surfaceBaseId === hover.baseId).length
      : 0;
    const initiallyParked = game.enemies.filter((enemy) => enemy.parkedAtBase);
    const localDefenders = game.enemies.filter(
      (enemy) => enemy.surfaceBaseId === launcher.surfaceBaseId,
    );
    const remoteDefenders = game.enemies.filter(
      (enemy) => enemy.surfaceBaseId !== null &&
        enemy.surfaceBaseId !== launcher.surfaceBaseId,
    );
    const localParkedBefore = localDefenders.filter((enemy) => enemy.parkedAtBase).length;
    const remoteParkedBefore = remoteDefenders.filter((enemy) => enemy.parkedAtBase).length;
    const remotePursuitBefore = remoteDefenders.filter((enemy) => enemy.pursuingPlayer).length;

    const actors = [...game.enemies, ...game.turrets];
    const aliveStates = actors.map((actor) => actor.alive);
    const bodyStates = surface.bodies.map((body) => body.destroyed);
    const savedPlayer = {
      position: game.player.position.clone(),
      velocity: game.player.velocity.clone(),
      hull: game.player.hull,
      alive: game.player.alive,
    };
    const savedLauncher = {
      position: launcher.position.clone(),
      quaternion: launcher.object.quaternion.clone(),
    };

    const padIndicators = [];
    const padActiveEffects = [];
    const padRepairEffects = [];
    surface.group.traverse((object) => {
      if (object.userData.repairPadIndicator) padIndicators.push(object);
      if (object.userData.repairPadActiveEffect) padActiveEffects.push(object);
      if (object.userData.repairPadEffect) padRepairEffects.push(object);
    });
    const padIndicator = padIndicators.find(
      (object) => object.userData.surfaceBaseId === repairPad.baseId,
    );
    const padRepairEffect = padRepairEffects.find(
      (object) => object.userData.surfaceBaseId === repairPad.baseId,
    );
    const padActiveEffect = padActiveEffects.find(
      (object) => object.userData.surfaceBaseId === repairPad.baseId,
    );
    const lockedIndicatorInitiallyVisible = !!padIndicator?.visible;
    game.player.position.copy(repairPad.center).add({ x: 300, y: 20, z: 0 });
    for (let frame = 0; frame < 90; frame++) game.updateRepairPads(1 / 60);
    const compactIndicatorWidth = padIndicator?.scale.x ?? 0;
    game.player.position.copy(repairPad.center).add({ x: 0, y: 20, z: 0 });
    for (let frame = 0; frame < 90; frame++) game.updateRepairPads(1 / 60);
    const expandedIndicatorWidth = padIndicator?.scale.x ?? 0;
    const nearbyMessageVisible = padIndicator?.userData.messageVisible === true;
    game.player.position.copy(repairPad.center).add({ x: 300, y: 20, z: 0 });
    for (let frame = 0; frame < 90; frame++) game.updateRepairPads(1 / 60);
    const collapsedIndicatorWidth = padIndicator?.scale.x ?? 0;
    const nearbyMessageCollapsed = padIndicator?.userData.messageVisible === false;

    game.player.alive = true;
    game.player.position.copy(repairPad.center);
    game.player.position.y += game.player.radius + 0.5;
    game.player.velocity.set(0, 0, 0);
    game.player.hull = game.player.hullMax - 10;
    game.updateRepairPads(2);
    const repairLocked = Math.abs(game.player.hull - (game.player.hullMax - 10)) < 1e-6;
    const lockedActiveEffectHidden = padActiveEffect?.visible === false;
    const lockedRepairEffectHidden = padRepairEffect?.visible === false;
    const localActors = actors.filter((actor) => actor.surfaceBaseId === repairPad.baseId);
    const remoteActors = actors.filter(
      (actor) => actor.surfaceBaseId !== null && actor.surfaceBaseId !== repairPad.baseId,
    );
    for (const actor of localActors) actor.alive = false;
    game.updateRepairPads(2.5);
    const repairAmount = game.player.hull - (game.player.hullMax - 10);
    const unlockedIndicatorVisible = padIndicator?.visible === true &&
      padIndicator?.userData.status === 'unlocked';
    const unlockedActiveEffectVisible = padActiveEffect?.visible === true &&
      padActiveEffect?.userData.active === true;
    const activeLightCount = padActiveEffect?.children.length ?? 0;
    const repairEffectVisible = padRepairEffect?.visible === true &&
      padRepairEffect?.userData.active === true;
    const repairMoteCount = padRepairEffect?.children.length ?? 0;
    game.player.hull = game.player.hullMax;
    for (let frame = 0; frame < 20; frame++) game.updateRepairPads(1 / 60);
    const repairEffectStopsAtFullHull = padRepairEffect?.visible === false;
    const unlockedIndicatorHeldForThreeSeconds = padIndicator?.visible === true;
    for (let frame = 0; frame < 60; frame++) game.updateRepairPads(1 / 60);
    const unlockedIndicatorFaded = padIndicator?.visible === false &&
      padIndicator?.material.opacity === 0;
    const activeEffectPersistsAfterNotice = padActiveEffect?.visible === true;
    const remoteBaseIgnored = remoteActors.some((actor) => actor.alive);
    actors.forEach((actor, index) => { actor.alive = aliveStates[index]; });

    for (const body of surface.bodies) body.destroyed = true;
    launcher.position.copy(spawn.position);
    launcher.reloadTimer = 0;
    launcher.burstRemaining = 0;
    launcher.shotTimer = 0;
    const inward = spawn.baseCenter.clone().sub(launcher.position).setY(0).normalize();
    const target = launcher.position.clone().addScaledVector(inward, 150);
    target.y = surface.heightAt(target.x, target.z) + 45;
    game.player.position.copy(target);
    game.player.velocity.set(0, 0, 0);
    let crawlerFired = false;
    for (let frame = 0; frame < 480 && !crawlerFired; frame++) {
      launcher.update(1 / 60, target, true, (source) => {
        crawlerFired = game.combat.turretFire(source);
        return crawlerFired;
      }, true, true);
    }
    const localBaseAlerted = localDefenders.length > 0 &&
      localDefenders.every((enemy) => enemy.pursuingPlayer && !enemy.parkedAtBase);
    const remoteBaseStayedDormant = remoteDefenders.length > 0 &&
      remoteDefenders.filter((enemy) => enemy.parkedAtBase).length === remoteParkedBefore &&
      remoteDefenders.filter((enemy) => enemy.pursuingPlayer).length === remotePursuitBefore;

    game.projectiles.clear();
    const origin = launcher.position.clone();
    const direction = launcher.position.clone();
    const phases = [];
    const firstOrigins = [];
    const firstDirections = [];
    for (let shot = 0; shot < 8; shot++) {
      launcher.tubeIndex = shot;
      const phase = launcher.rocketLaunch(origin, direction);
      phases.push(phase);
      firstOrigins.push(origin.clone());
      firstDirections.push(direction.clone());
      game.projectiles.spawnEnemyRocket(origin, direction, game.player, 'salvo', 1, phase);
    }
    const salvoSnapshot = game.projectiles.debugSnapshot();
    const rocketMeshes = game.projectiles.group.children.filter((object) => object.visible);
    const rocketVertexCount = rocketMeshes[0]?.geometry?.attributes?.position?.count ?? 0;
    for (let frame = 0; frame < 30; frame++) {
      game.projectiles.update(1 / 60, [], null, [], () => {});
    }
    let spiralDeviation = 0;
    for (let index = 0; index < rocketMeshes.length; index++) {
      const from = firstOrigins[index];
      const axis = firstDirections[index];
      const displacement = rocketMeshes[index].position.clone().sub(from);
      const closest = from.clone().addScaledVector(axis, displacement.dot(axis));
      spiralDeviation = Math.max(spiralDeviation, rocketMeshes[index].position.distanceTo(closest));
    }

    const remoteParked = remoteDefenders.find((enemy) => enemy.parkedAtBase);
    const remoteTurret = remoteParked && game.turrets.find(
      (turret) => turret.surfaceBaseId === remoteParked.surfaceBaseId,
    );
    let turretAlertLaunchedGarrison = false;
    if (remoteParked && remoteTurret) {
      game.player.position.copy(remoteTurret.position).add({ x: 0, y: 40, z: 0 });
      const detectedBase = remoteTurret.detectedSurfaceBase(game.player.position, true);
      if (detectedBase !== null) game.combat.alertSurfaceBase(detectedBase);
      turretAlertLaunchedGarrison = !remoteParked.parkedAtBase && remoteParked.pursuingPlayer;
    }

    game.projectiles.clear();
    actors.forEach((actor, index) => { actor.alive = aliveStates[index]; });
    surface.bodies.forEach((body, index) => { body.destroyed = bodyStates[index]; });
    launcher.position.copy(savedLauncher.position);
    launcher.object.quaternion.copy(savedLauncher.quaternion);
    game.player.position.copy(savedPlayer.position);
    game.player.velocity.copy(savedPlayer.velocity);
    game.player.hull = savedPlayer.hull;
    game.player.alive = savedPlayer.alive;
    game.exitPlanet();

    return {
      staged: true,
      foundationHeightError,
      hoverCount: surface.hoverBaseLandmarks.length,
      hoverTurretCount,
      repairPadCount: surface.repairPads.length,
      repairPadIndicatorCount: padIndicators.length,
      repairPadActiveEffectCount: padActiveEffects.length,
      repairPadEffectCount: padRepairEffects.length,
      baseCount: surface.baseLandmarks.length,
      parkedDefenderCount: initiallyParked.length,
      localParkedBefore,
      remoteParkedBefore,
      repairLocked,
      repairAmount,
      lockedActiveEffectHidden,
      lockedRepairEffectHidden,
      unlockedActiveEffectVisible,
      activeLightCount,
      activeEffectPersistsAfterNotice,
      repairEffectVisible,
      repairMoteCount,
      repairEffectStopsAtFullHull,
      lockedIndicatorInitiallyVisible,
      compactIndicatorWidth,
      expandedIndicatorWidth,
      collapsedIndicatorWidth,
      nearbyMessageVisible,
      nearbyMessageCollapsed,
      unlockedIndicatorVisible,
      unlockedIndicatorHeldForThreeSeconds,
      unlockedIndicatorFaded,
      remoteBaseIgnored,
      crawlerFired,
      localBaseAlerted,
      remoteBaseStayedDormant,
      turretAlertLaunchedGarrison,
      firstBurstPhases: new Set(phases.map((phase) => phase.toFixed(3))).size,
      corkscrew: salvoSnapshot.length === 8 && salvoSnapshot.every(
        (shot) => shot.spiral && !shot.homing && !shot.hasTarget &&
          shot.trail && Math.abs(shot.speed - 150) < 0.01,
      ),
      rocketVertexCount,
      spiralDeviation,
    };
  });
  console.log('planetary base behavior:', JSON.stringify(result));
  return result;
}

export function planetaryBaseBehaviorFailed(result) {
  return !result.staged || result.foundationHeightError > 0.15 ||
    (result.hoverCount === 1 && result.hoverTurretCount < 4) ||
    result.repairPadCount !== result.baseCount ||
    result.repairPadIndicatorCount !== result.repairPadCount ||
    result.repairPadActiveEffectCount !== result.repairPadCount ||
    result.repairPadEffectCount !== result.repairPadCount ||
    result.parkedDefenderCount < result.baseCount || result.localParkedBefore < 1 ||
    result.remoteParkedBefore < 1 || !result.repairLocked ||
    Math.abs(result.repairAmount - 5) > 0.01 || !result.remoteBaseIgnored ||
    !result.lockedActiveEffectHidden || !result.lockedRepairEffectHidden ||
    !result.unlockedActiveEffectVisible || result.activeLightCount !== 8 ||
    !result.activeEffectPersistsAfterNotice || !result.repairEffectVisible ||
    result.repairMoteCount !== 6 || !result.repairEffectStopsAtFullHull ||
    !result.lockedIndicatorInitiallyVisible || result.compactIndicatorWidth < 4 ||
    result.expandedIndicatorWidth < result.compactIndicatorWidth * 3 ||
    Math.abs(result.collapsedIndicatorWidth - result.compactIndicatorWidth) > 0.05 ||
    !result.nearbyMessageVisible || !result.nearbyMessageCollapsed ||
    !result.unlockedIndicatorVisible || !result.unlockedIndicatorHeldForThreeSeconds ||
    !result.unlockedIndicatorFaded ||
    !result.crawlerFired || !result.localBaseAlerted || !result.remoteBaseStayedDormant ||
    !result.turretAlertLaunchedGarrison || result.firstBurstPhases !== 8 ||
    !result.corkscrew || result.rocketVertexCount < 100 || result.spiralDeviation < 0.8;
}
