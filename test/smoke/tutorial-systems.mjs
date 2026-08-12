import { advanceGameTime } from './helpers.mjs';
import { setTutorialButton, setTutorialKey, touchGate } from './tutorial-input.mjs';
import { runTutorialSurvival } from './tutorial-survival.mjs';
export async function runTutorialSystems(page) {
  const survival = await runTutorialSurvival(page);
  await page.evaluate(() => {
    const combat = window.game.combat.tutorialCombat;
    const burst = combat.fireBurst.bind(combat);
    const seeker = combat.fireSeeker.bind(combat);
    window.__tutorialCloakShots = [];
    combat.fireBurst = (target) => { window.__tutorialCloakShots.push('primary'); burst(target); };
    combat.fireSeeker = (target) => { window.__tutorialCloakShots.push('secondary'); seeker(target); };
  });
  await page.evaluate(() => window.game.input.setVirtualLook(0.8, 0));
  await advanceGameTime(page, 0.08);
  await page.evaluate(() => window.game.input.setVirtualLook(0, 0));
  await advanceGameTime(page, 0.75);
  const primaryVisible = await page.evaluate(() => window.game.projectiles.debugSnapshot()
    .some((shot) => shot.faction === 'enemy' && shot.kind === 'bolt'));
  const beforeSecondary = await page.evaluate(() => {
    for (let frame = 0; frame < 120; frame++) window.game.tutorial.update(1 / 60, window.game.chaseCam.camera);
    return window.__tutorialCloakShots.join('|');
  });
  const cloakStart = await page.evaluate(({ sentryFiring, before }) => {
    for (let frame = 0; frame < 15; frame++) window.game.tutorial.update(1 / 60, window.game.chaseCam.camera);
    const shots = window.__tutorialCloakShots.join('|');
    return {
      step: window.game.tutorial.stepId,
      sentryFiring,
      seekerLocked: window.game.projectiles.incomingThreat(window.game.player).locked,
      cadence: before === 'primary' && shots === 'primary|secondary',
    };
  }, { sentryFiring: primaryVisible, before: beforeSecondary });
  const cloakControl = await touchGate(page, '[data-touch-action="cloak"]', '[data-touch-action="emp"]');
  await setTutorialKey(page, 'KeyF', true);
  await advanceGameTime(page, 0.08);
  await setTutorialKey(page, 'KeyF', false);
  await page.evaluate(() => {
    const game = window.game;
    const target = game.enemies.find((enemy) => enemy.training);
    if (!target) return;
    const away = game.player.position.clone().sub(target.position).normalize();
    game.player.position.copy(target.position).addScaledVector(away, 52);
    game.player.velocity.set(0, 0, 0);
    game.player.faceToward(target.position);
    game.chaseCam.snapTo(game.player.object);
  });
  await advanceGameTime(page, 0.2);
  const cloakReview = await page.evaluate(() => {
    const game = window.game;
    const target = game.enemies.find((enemy) => enemy.training);
    return {
      ready: game.tutorial.stepId === 'cloak' && game.tutorial.awaitingAction,
      live: !game.tutorial.frozen,
      cloaked: game.devices.cloaked,
      close: !!target && game.player.position.distanceTo(target.position) <= 65,
      unlimited: game.weapons.energy === game.weapons.energyMax,
      lockCleared: !game.projectiles.incomingThreat(game.player).locked,
    };
  });
  await setTutorialButton(page, 0, true);
  await advanceGameTime(page, 1.2);
  await setTutorialButton(page, 0, false);
  const cloakBreakReview = await page.evaluate(() => ({
    ready: window.game.tutorial.stepId === 'cloak-break' && window.game.tutorial.awaitingAction,
    reacquired: window.game.projectiles.debugSnapshot()
      .some((shot) => shot.faction === 'enemy' && shot.kind === 'bolt'),
  }));
  await page.click('.tutorial-next');
  const empControl = await touchGate(page, '[data-touch-action="emp"]', '[data-touch-action="fire"]');
  await advanceGameTime(page, 0.9);
  const empBefore = await page.evaluate(() => ({ hull: window.game.player.hull, shield: window.game.player.shield }));
  await setTutorialKey(page, 'KeyG', true);
  await advanceGameTime(page, 0.08);
  await setTutorialKey(page, 'KeyG', false);
  const empFirst = await page.evaluate(() => ({
    live: window.game.tutorial.awaitingAction && !window.game.tutorial.frozen,
    stunned: (window.game.enemies.find((enemy) => enemy.training)?.stunTimer ?? 0) > 3,
    cooldown: window.game.devices.empCooldown,
  }));
  await advanceGameTime(page, 4.5);
  const empResumed = await page.evaluate((before) => ({
    bolts: window.game.projectiles.debugSnapshot()
      .some((shot) => shot.faction === 'enemy' && shot.kind === 'bolt'),
    safe: window.game.player.hull === before.hull && window.game.player.shield === before.shield,
    cooldown: window.game.devices.empCooldown,
  }), empBefore);
  await setTutorialKey(page, 'KeyG', true);
  await advanceGameTime(page, 0.08);
  await setTutorialKey(page, 'KeyG', false);
  empResumed.repeatStun = await page.evaluate(() =>
    (window.game.enemies.find((enemy) => enemy.training)?.stunTimer ?? 0) > 3);
  await setTutorialButton(page, 0, true);
  await advanceGameTime(page, 0.08);
  await setTutorialButton(page, 0, false);
  await advanceGameTime(page, 0.08);
  const miningStart = await page.evaluate(() => {
    const game = window.game;
    window.__tutorialOreBody = game.lootAimBody;
    window.__tutorialOreHp = game.lootAimBody?.oreHp ?? Infinity;
    return {
      step: game.tutorial.stepId,
      aimed: game.lootAimed === 'vein' && !!game.lootAimPoint,
      distance: game.lootAimPoint?.distanceTo(game.player.position) ?? 0,
      radius: game.lootAimBody?.radius ?? Infinity,
      position: game.player.position.toArray(),
    };
  });
  await setTutorialKey(page, 'KeyA', true);
  await advanceGameTime(page, 0.35);
  await setTutorialKey(page, 'KeyA', false);
  const miningMove = await page.evaluate((start) => {
    const game = window.game;
    game.player.faceToward(game.lootAimPoint ?? window.__tutorialOreBody.position);
    game.chaseCam.snapTo(game.player.object);
    return game.player.position.distanceTo({ x: start[0], y: start[1], z: start[2] });
  }, miningStart.position);
  await setTutorialButton(page, 0, true);
  await advanceGameTime(page, 0.35);
  const miningHit = await page.evaluate(() => window.__tutorialOreBody.oreHp < window.__tutorialOreHp);
  await advanceGameTime(page, 1.45);
  await setTutorialButton(page, 0, false);
  const mining = await page.evaluate(() => ({
    step: window.game.tutorial.stepId, review: window.game.tutorial.awaitingAction,
  }));
  return { ...survival, cloakStart, cloakControl, cloakReview, cloakBreakReview,
    empControl, empFirst, empResumed, miningStart, miningMove, miningHit, mining,
  };
}
