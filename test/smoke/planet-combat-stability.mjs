/** Sustain a stationary planetary firefight and verify every expensive pool stays bounded. */
export async function runPlanetCombatStability(page) {
  const session = await page.context().newCDPSession(page);
  try {
    let baseline = await page.evaluate(() => {
      const game = window.game;
      game.enterPlanet(0);
      game.loop.stop();
      const surface = game.surface;
      const launcher = game.turrets.find((turret) => turret.kind === 'ground-launcher');
      const spawn = surface.groundLauncherSpawns[0];
      if (!launcher || !spawn) return { staged: false };
      const actors = [...game.enemies, ...game.turrets];
      const savedActors = actors.map((actor) => ({
        actor,
        position: actor.position.clone(),
        quaternion: actor.object.quaternion.clone(),
        velocity: actor.velocity.clone(),
        throttle: actor.throttle,
      }));
      const savedPlayer = {
        position: game.player.position.clone(),
        quaternion: game.player.object.quaternion.clone(),
        velocity: game.player.velocity.clone(),
        hull: game.player.hull,
        shield: game.player.shield,
        alive: game.player.alive,
      };
      const originalState = game.state;
      const inward = spawn.baseCenter.clone().sub(launcher.position).setY(0).normalize();
      const target = launcher.position.clone().addScaledVector(inward, 150);
      target.y = surface.heightAt(target.x, target.z) + 45;
      const state = {
        savedActors,
        savedPlayer,
        originalState,
        target,
        contextLost: false,
        singleRocketHit: false,
        contextListener: null,
        run: null,
        snapshot: null,
      };
      state.contextListener = (event) => {
        state.contextLost = true;
        event.preventDefault();
      };
      game.renderer.domElement.addEventListener('webglcontextlost', state.contextListener);
      state.snapshot = () => ({
        staged: true,
        sceneChildren: game.scene.children.length,
        geometries: game.renderer.info.memory.geometries,
        textures: game.renderer.info.memory.textures,
        activeProjectiles: game.projectiles.debugSnapshot().length,
        activeDebris: game.shipDebris.diagnostics().activeFragments,
        activeAudio: game.audio.debugActiveOneShots,
        singleRocketHit: state.singleRocketHit,
      });
      game.audio.init();
      launcher.reloadTimer = 999;
      for (let frame = 0; frame < 90; frame++) {
        launcher.update(1 / 60, target, true, () => false, true, true);
      }
      game.player.position.copy(target);
      game.player.velocity.set(0, 0, 0);
      game.player.hull = game.player.hullMax;
      game.player.shield = game.player.shieldMax;
      game.player.alive = true;
      const durabilityBefore = game.player.hull + game.player.shield;
      const origin = launcher.position.clone();
      const direction = launcher.position.clone();
      launcher.rocketLaunch(origin, direction);
      game.projectiles.spawnEnemyRocket(
        origin, direction, game.player, 'salvo', game.difficulty.enemyDamage,
      );
      const spawned = game.projectiles.debugSnapshot().length === 1;
      for (let frame = 0; frame < 120; frame++) {
        game.projectiles.update(1 / 60, [], game.player, [],
          (hit) => game.combat.resolveHit(hit));
      }
      state.singleRocketHit =
        spawned && game.player.hull + game.player.shield < durabilityBefore;
      game.projectiles.clear();
      game.explosions.update(10);
      game.particles.update(10);
      state.run = (cycles) => {
        const render = game.postFx.render;
        const origin = launcher.position.clone();
        const direction = launcher.position.clone();
        let peakProjectiles = 0;
        let peakAudio = 0;
        let renderedFrames = 0;
        for (let cycle = 0; cycle < cycles; cycle++) {
          for (let shot = 0; shot < 400; shot++) {
            launcher.tubeIndex = shot % 8;
            launcher.rocketLaunch(origin, direction);
            game.projectiles.spawnEnemyRocket(
              origin, direction, game.player, 'salvo', game.difficulty.enemyDamage,
            );
            game.audio.enemyMissileLaunch();
          }
          peakProjectiles = Math.max(
            peakProjectiles,
            game.projectiles.debugSnapshot().length,
          );
          peakAudio = Math.max(peakAudio, game.audio.debugActiveOneShots);
          for (let frame = 0; frame < 270; frame++) {
            game.player.position.copy(target);
            game.player.velocity.set(0, 0, 0);
            game.player.hull = 1_000_000;
            game.player.shield = 1_000_000;
            game.player.alive = true;
            game.projectiles.update(
              1 / 60,
              [],
              game.player,
              game.world.bodies,
              (hit) => game.combat.resolveHit(hit),
              game.terrainProjectileHit,
              undefined,
              game.surfaceProjectileBodyQuery,
            );
            game.particles.update(1 / 60);
            game.explosions.update(1 / 60);
            if (frame % 45 === 0) {
              render.call(game.postFx, 0);
              renderedFrames++;
            }
          }
        }
        game.projectiles.clear();
        game.particles.update(20);
        game.explosions.update(20);
        game.shipDebris.update(20, surface);
        render.call(game.postFx, 0);
        return { peakProjectiles, peakAudio, renderedFrames };
      };
      window.__planetCombatStability = state;
      state.run(1);
      return state.snapshot();
    });
    if (!baseline.staged) return baseline;
    // Settle lazy impact/shield textures so warm-up is not counted as growth.
    await page.waitForTimeout(350);
    baseline = await page.evaluate(() => {
      window.game.postFx.render(0);
      return window.__planetCombatStability.snapshot();
    });
    await page.requestGC();
    baseline.heap = (await session.send('Runtime.getHeapUsage')).usedSize;
    const stress = await page.evaluate(() => window.__planetCombatStability.run(8));
    await page.waitForTimeout(350);
    await page.requestGC();
    const final = await page.evaluate(() => window.__planetCombatStability.snapshot());
    final.heap = (await session.send('Runtime.getHeapUsage')).usedSize;
    const restored = await page.evaluate(() => {
      const game = window.game;
      const state = window.__planetCombatStability;
      game.renderer.domElement.removeEventListener('webglcontextlost', state.contextListener);
      for (const saved of state.savedActors) {
        saved.actor.position.copy(saved.position);
        saved.actor.object.quaternion.copy(saved.quaternion);
        saved.actor.velocity.copy(saved.velocity);
        saved.actor.throttle = saved.throttle;
      }
      game.player.position.copy(state.savedPlayer.position);
      game.player.object.quaternion.copy(state.savedPlayer.quaternion);
      game.player.velocity.copy(state.savedPlayer.velocity);
      game.player.hull = state.savedPlayer.hull;
      game.player.shield = state.savedPlayer.shield;
      game.player.alive = state.savedPlayer.alive;
      game.state = state.originalState;
      const contextLost = state.contextLost;
      const audioLimit = game.audio.debugMaxOneShots;
      delete window.__planetCombatStability;
      game.exitPlanet();
      return { contextLost, audioLimit };
    });
    return {
      staged: true,
      simulatedSeconds: 40.5,
      contextLost: restored.contextLost,
      singleRocketHit: baseline.singleRocketHit,
      peakProjectiles: stress.peakProjectiles,
      projectileLimit: 320,
      peakAudio: stress.peakAudio,
      audioLimit: restored.audioLimit,
      heapGrowth: final.heap - baseline.heap,
      baseline,
      final,
    };
  } finally {
    await session.detach();
  }
}
export function planetCombatStabilityFailed(result) {
  return !result.staged || result.contextLost || !result.singleRocketHit ||
    result.peakProjectiles !== result.projectileLimit ||
    result.peakAudio !== result.audioLimit ||
    result.heapGrowth > 8_000_000 ||
    result.final.sceneChildren !== result.baseline.sceneChildren ||
    result.final.geometries > result.baseline.geometries + 2 ||
    result.final.textures > result.baseline.textures ||
    result.final.activeProjectiles !== 0 || result.final.activeDebris !== 0;
}
