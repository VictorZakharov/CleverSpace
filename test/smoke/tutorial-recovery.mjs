import { advanceGameTime } from './helpers.mjs';
import { setTutorialKey } from './tutorial-input.mjs';

/** Interrupted lessons must remain playable without browsing away and back. */
export async function auditTutorialRecovery(page) {
  await page.evaluate(() => {
    const game = window.game;
    game.startTutorial();
    game.tutorial.stageForTest('emp');
    game.pause();
  });
  const pausedBefore = await page.evaluate(() => window.game.projectiles.debugSnapshot().length);
  await advanceGameTime(page, 2);
  const pausedQuiet = await page.evaluate((before) =>
    window.game.projectiles.debugSnapshot().length === before, pausedBefore);
  await setTutorialKey(page, 'ArrowRight', true);
  await advanceGameTime(page, 0.05);
  await setTutorialKey(page, 'ArrowRight', false);
  const pausedStepHeld = await page.evaluate(() =>
    window.game.state === 'paused' && window.game.tutorial.stepId === 'emp');

  const engineering = [];
  for (const step of ['loadout-open', 'craft']) {
    await page.evaluate((id) => {
      const game = window.game;
      game.resume();
      game.tutorial.stageForTest(id);
    }, step);
    if (step === 'loadout-open') await setTutorialKey(page, 'Tab', true);
    await advanceGameTime(page, 0.05);
    await setTutorialKey(page, 'Tab', false);
    await page.click('.loadout-panel .close-x');
    await advanceGameTime(page, 0.05);
    await setTutorialKey(page, 'Tab', true);
    await advanceGameTime(page, 0.05);
    await setTutorialKey(page, 'Tab', false);
    engineering.push(await page.evaluate(() => window.game.state === 'loadout'));
  }

  const viewHeld = await page.evaluate(() => {
    const game = window.game;
    game.tutorial.stageForTest('target');
    const target = game.enemies.find((enemy) => enemy.training);
    game.player.faceToward(target.position);
    game.player.object.rotateZ(0.3);
    game.chaseCam.snapTo(game.player.object);
    const pose = game.player.object.quaternion.clone();
    const camera = game.chaseCam.camera.quaternion.clone();
    game.tutorial.scenario.enter('guns');
    return pose.angleTo(game.player.object.quaternion) < 1e-6 &&
      camera.angleTo(game.chaseCam.camera.quaternion) < 1e-6;
  });
  const transition = await page.evaluate(() => {
    const game = window.game;
    game.tutorial.stageForTest('emp');
    game.tutorial.browse(1);
    const canvas = document.querySelector('.tutorial-scene-transition');
    const animation = canvas.getAnimations()[0];
    if (!animation) return false;
    animation.pause();
    animation.currentTime = 250;
    const opacity = Number(getComputedStyle(canvas).opacity);
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const populated = pixels.some((value, index) => index % 4 !== 3 && value > 10);
    game.input.setVirtualButton(0, true);
    const inputAvailable = game.input.isButtonDown(0);
    game.input.setVirtualButton(0, false);
    animation.finish();
    const cleared = Number(getComputedStyle(canvas).opacity) === 0;
    game.tutorial.stop();
    return populated && opacity > 0.1 && opacity < 0.9 && cleared &&
      canvas.getAnimations().length === 0 && inputAvailable;
  });
  return { pausedQuiet, pausedStepHeld, engineering, viewHeld, transition };
}

export function recoveryFailures(result) {
  return Object.entries(result).filter(([, value]) =>
    Array.isArray(value) ? value.some((item) => !item) : !value,
  ).map(([key]) => `tutorial recovery: ${key}`);
}
