import { advanceGameTime } from './helpers.mjs';

/** Deliberately vary state not authored by a lesson, including prior combat. */
export async function auditTutorialIsolation(page) {
  await page.evaluate(() => {
    const game = window.game;
    game.startTutorial();
    game.player.velocity.set(450, -120, 280);
    game.player.object.rotation.set(1.1, 2.4, -0.8);
    game.tutorial.stageForTest('emp');
  });
  await advanceGameTime(page, 5);
  const empReachable = await page.evaluate(() => {
    const game = window.game;
    const target = game.enemies.find((enemy) => enemy.training);
    return !!target && game.player.position.distanceTo(target.position) < 250;
  });
  await page.evaluate(() => {
    const game = window.game;
    game.spawnEnemy({ kind: 'raider', aggression: 1, position: game.player.position.clone() });
    game.tutorial.stageForTest('craft');
  });
  const ambientCraftSafe = await page.evaluate(() => window.game.craft('nanobot-kit'));
  const ambientCraftButton = await page.evaluate(() =>
    [...document.querySelectorAll('.recipe-row')].some((row) =>
      row.textContent.includes('Nanobot Kit') && !row.querySelector('button').disabled));
  await page.evaluate(() => {
    window.game.tutorial.stageForTest('mine');
    window.game.inventory.add('scrap', 1);
  });
  await advanceGameTime(page, 0.1);
  const unrelatedLootIgnored = await page.evaluate(() => !window.game.tutorial.awaitingAction);
  await page.evaluate(() => {
    const game = window.game;
    game.tutorial.stageForTest('seekers');
    game.player.object.rotateY(Math.PI);
    game.chaseCam.snapTo(game.player.object);
    game.input.setVirtualButton(2, true);
  });
  await advanceGameTime(page, 16);
  await page.evaluate(() => window.game.input.setVirtualButton(2, false));
  const seekersRecoverable = await page.evaluate(() => {
    const game = window.game;
    return game.tutorial.awaitingAction || game.inventory.missiles > 0;
  });
  return { empReachable, ambientCraftSafe, ambientCraftButton, seekersRecoverable, unrelatedLootIgnored };
}

export function isolationFailures(result) {
  return Object.entries(result).filter(([, passed]) => !passed)
    .map(([key]) => `tutorial isolation: ${key}`);
}
