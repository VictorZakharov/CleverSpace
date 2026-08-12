/** Restage every authored actor lesson and prove its required sight corridor. */
export async function auditTutorialStaging(page) {
  const audit = await page.evaluate(() => {
    const game = window.game;
    game.startTutorial();
    game.loop.stop();
    const targetSteps = [
      ['target', 210], ['guns', 190], ['seekers', 190], ['shield', 105], ['hull', 105],
      ['missile-dodge', 300], ['cloak', 230], ['cloak-break', 65], ['emp', 135],
    ];
    const targets = targetSteps.map(([step, expectedDistance]) => {
      game.tutorial.stageForTest(step);
      const target = game.enemies.find((enemy) => enemy.training);
      if (!target) return { step, present: false };
      game.chaseCam.camera.updateMatrixWorld(true);
      const projected = target.position.clone().project(game.chaseCam.camera);
      return {
        step,
        present: true,
        playerLine: game.combat.hasLineOfSight(game.player.position, target.position),
        cameraLine: game.combat.hasLineOfSight(game.chaseCam.camera.position, target.position),
        framed: projected.z >= -1 && projected.z <= 1 &&
          Math.abs(projected.x) <= 0.9 && Math.abs(projected.y) <= 0.9,
        distance: game.player.position.distanceTo(target.position),
        expectedDistance,
      };
    });

    game.tutorial.stageForTest('mine');
    game.loop.stepManual(1 / 60);
    const minePoint = game.navigation.current?.position;
    const mineProjected = minePoint?.clone().project(game.chaseCam.camera);
    const mine = {
      present: !!minePoint,
      playerLine: !!minePoint && !!game.lootAimBody &&
        game.combat.hasLineOfSight(game.player.position, minePoint, game.lootAimBody),
      cameraLine: !!minePoint && !!game.lootAimBody &&
        game.combat.hasLineOfSight(game.chaseCam.camera.position, minePoint, game.lootAimBody),
      framed: !!mineProjected && mineProjected.z >= -1 && mineProjected.z <= 1 &&
        Math.abs(mineProjected.x) <= 0.9 && Math.abs(mineProjected.y) <= 0.9,
    };

    game.tutorial.stageForTest('trade-open');
    const merchant = game.neutrals.find((neutral) => neutral.alive && neutral.isMerchant);
    const merchantProjected = merchant?.position.clone().project(game.chaseCam.camera);
    const trade = {
      present: !!merchant,
      playerLine: !!merchant && game.combat.hasLineOfSight(game.player.position, merchant.position),
      cameraLine: !!merchant && game.combat.hasLineOfSight(game.chaseCam.camera.position, merchant.position),
      framed: !!merchantProjected && merchantProjected.z >= -1 && merchantProjected.z <= 1 &&
        Math.abs(merchantProjected.x) <= 0.9 && Math.abs(merchantProjected.y) <= 0.9,
    };

    game.tutorial.stageForTest('planet');
    const planet = game.sector.planets[0];
    const planetProjected = planet?.position.clone().project(game.chaseCam.camera);
    const planetfall = {
      present: !!planet,
      playerLine: !!planet && game.combat.hasLineOfSight(game.player.position, planet.position),
      cameraLine: !!planet && game.combat.hasLineOfSight(game.chaseCam.camera.position, planet.position),
      framed: !!planetProjected && planetProjected.z >= -1 && planetProjected.z <= 1 &&
        Math.abs(planetProjected.x) <= 0.9 && Math.abs(planetProjected.y) <= 0.9,
    };

    game.tutorial.stageForTest('surface-flight');
    const crawler = game.turrets.find((turret) => 'totalShotsFired' in turret);
    const approach = game.navigation.current?.position;
    const surface = {
      present: !!crawler && !!approach,
      fireLine: !!crawler && !!approach && game.combat.hasLineOfSight(
        crawler.position.clone().setY(crawler.position.y + 3), approach,
      ),
    };
    return { targets, mine, trade, planetfall, surface };
  });
  audit.coverFireBlocked = await page.evaluate(() => {
    const game = window.game;
    game.tutorial.stageForTest('cloak');
    const target = game.enemies.find((enemy) => enemy.training);
    const blocker = game.world.bodies.find((body) => !body.destroyed && body.radius > 8);
    if (!target || !blocker) return false;
    const original = blocker.position.clone();
    blocker.position.copy(target.position).lerp(game.player.position, 0.5);
    game.projectiles.clear();
    const before = game.projectiles.debugSnapshot().filter((shot) =>
      shot.faction === 'enemy' && shot.kind === 'bolt').length;
    for (let frame = 0; frame < 5; frame++) game.loop.stepManual(1 / 60);
    const after = game.projectiles.debugSnapshot().filter((shot) =>
      shot.faction === 'enemy' && shot.kind === 'bolt').length;
    blocker.position.copy(original);
    return after === before;
  });
  return audit;
}

export function stagingAuditFailures(audit) {
  const failures = audit.targets.filter((entry) => !entry.present || !entry.playerLine ||
    !entry.cameraLine || !entry.framed ||
    Math.abs(entry.distance - entry.expectedDistance) > 1).map((entry) => entry.step);
  if (!audit.mine.present || !audit.mine.playerLine || !audit.mine.cameraLine || !audit.mine.framed) failures.push('mine');
  if (!audit.trade.present || !audit.trade.playerLine || !audit.trade.cameraLine || !audit.trade.framed) failures.push('trade');
  if (!audit.planetfall.present || !audit.planetfall.playerLine || !audit.planetfall.cameraLine || !audit.planetfall.framed) failures.push('planet');
  if (!audit.surface.present || !audit.surface.fireLine) failures.push('surface');
  if (!audit.coverFireBlocked) failures.push('cover-fire');
  return failures;
}
