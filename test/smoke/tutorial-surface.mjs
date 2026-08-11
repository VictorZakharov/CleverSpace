import { advanceGameTime } from './helpers.mjs';
import { setTutorialButton, setTutorialKey } from './tutorial-input.mjs';
import { runTutorialTravel } from './tutorial-travel.mjs';

export async function runTutorialSurface(page) {
  await setTutorialKey(page, 'KeyJ', true);
  await advanceGameTime(page, 5.2, 30);
  await setTutorialKey(page, 'KeyJ', false);
  const surfaceStart = await page.evaluate(() => {
    const game = window.game;
    const crawler = game.turrets.find((turret) => 'totalShotsFired' in turret);
    game.__tutorialBaseId = crawler?.surfaceBaseId;
    game.__tutorialBase = game.surface?.baseLandmarks
      .find((base) => base.baseId === game.__tutorialBaseId)?.center.clone();
    return {
      step: game.tutorial.stepId,
      surface: game.surface !== null,
      enemies: game.enemies.length,
      turrets: game.turrets.length,
      crawler: !!crawler,
      localParked: game.enemies.some((enemy) =>
        enemy.surfaceBaseId === game.__tutorialBaseId && enemy.parkedAtBase),
      foreignSafe: game.enemies.some((enemy) =>
        enemy.surfaceBaseId !== game.__tutorialBaseId && enemy.training && enemy.alive),
      nav: game.navigation.current?.label ?? '',
      boostRelevant: document.querySelector('[data-touch-action="boost"]')
        ?.classList.contains('tutorial-relevant') ?? false,
    };
  });
  if (!surfaceStart.surface || surfaceStart.step !== 'surface-flight' || !surfaceStart.nav) throw new Error(
    `Tutorial planetfall did not complete: ${JSON.stringify(surfaceStart)}`,
  );
  await page.evaluate(() => {
    const game = window.game;
    game.player.position.copy(game.navigation.current.position);
    game.player.velocity.set(0, 0, 0);
    const crawler = game.turrets.find((turret) => 'totalShotsFired' in turret);
    if (crawler) game.player.faceToward(crawler.position);
    game.chaseCam.snapTo(game.player.object);
  });
  await advanceGameTime(page, 0.2);
  const baseReached = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    nav: window.game.navigation.current?.label ?? '',
    baseDistance: window.game.player.position.distanceTo(window.game.__tutorialBase),
  }));

  await advanceGameTime(page, 4.2, 30);
  const alarmReview = await page.evaluate(() => {
    const game = window.game;
    const crawler = game.turrets.find((turret) => 'totalShotsFired' in turret);
    const local = game.enemies.find((enemy) => enemy.surfaceBaseId === game.__tutorialBaseId);
    return {
      step: game.tutorial.stepId,
      awaiting: game.tutorial.awaitingAction,
      shots: crawler?.totalShotsFired ?? 0,
      launched: local?.pursuingPlayer ?? false,
      foreignParked: game.enemies.some((enemy) =>
        enemy.surfaceBaseId !== game.__tutorialBaseId && enemy.parkedAtBase && enemy.alive),
      spiralTail: game.projectiles.debugSnapshot().some((shot) =>
        shot.faction === 'enemy' && shot.spiral && shot.trail),
    };
  });
  await setTutorialButton(page, 0, true);
  await advanceGameTime(page, 0.08);
  await setTutorialButton(page, 0, false);
  const clearStart = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    nav: window.game.navigation.current?.label ?? '',
    localTargets: [...window.game.turrets, ...window.game.enemies]
      .filter((actor) => actor.surfaceBaseId === window.game.__tutorialBaseId && actor.alive).length,
  }));
  await page.evaluate(() => {
    const game = window.game;
    for (const actor of [...game.turrets, ...game.enemies]) {
      if (actor.surfaceBaseId === game.__tutorialBaseId) actor.takeDamage(1e6);
    }
  });
  await advanceGameTime(page, 0.15);
  const padUnlocked = await page.evaluate(() => {
    const game = window.game;
    const pad = game.surface.repairPads.find((value) => value.baseId === game.__tutorialBaseId);
    game.__tutorialPad = pad;
    const indicator = game.surface.group.getObjectByName(`repair-pad-lock-${game.__tutorialBaseId}`);
    const online = game.surface.group.getObjectByName(`repair-pad-online-${game.__tutorialBaseId}`);
    return {
      step: game.tutorial.stepId,
      nav: game.navigation.current?.label ?? '',
      status: indicator?.userData.status ?? '',
      online: online?.userData.active ?? false,
      foreignAlive: game.enemies.some((enemy) =>
        enemy.surfaceBaseId !== game.__tutorialBaseId && enemy.alive),
      hull: game.player.hull,
    };
  });
  await page.evaluate(() => {
    const game = window.game;
    const pad = game.__tutorialPad;
    game.player.position.set(pad.center.x, pad.center.y + game.player.radius, pad.center.z);
    game.player.velocity.set(0, 0, 0);
  });
  await advanceGameTime(page, 1.2, 30);
  const padRepairReview = await page.evaluate((before) => {
    const game = window.game;
    const effect = game.surface.group.getObjectByName(`repair-pad-effect-${game.__tutorialBaseId}`);
    return {
      step: game.tutorial.stepId,
      awaiting: game.tutorial.awaitingAction,
      healed: game.player.hull - before,
      effect: effect?.userData.active ?? false,
    };
  }, padUnlocked.hull);
  await page.click('.tutorial-next');
  await page.evaluate(() => {
    const game = window.game;
    const nav = game.navigation.current;
    const stash = game.surface?.interactionBodies.find((body) => body.position === nav?.position);
    if (stash) stash.destroyed = true;
  });
  await advanceGameTime(page, 0.1);
  const stashReview = await page.evaluate(() => ({
    step: window.game.tutorial.stepId,
    awaiting: window.game.tutorial.awaitingAction,
    live: !window.game.tutorial.frozen,
    objective: document.querySelector('.tutorial-objective')?.textContent ?? '',
  }));
  const travel = await runTutorialTravel(page);
  return {
    surfaceStart, baseReached, alarmReview, clearStart,
    padUnlocked, padRepairReview, stashReview, ...travel,
  };
}
