export async function runSceneProbeSmoke(page) {
  const result = await page.evaluate(() => {
    const game = window.game;
    game.loop.stop();
    const body = game.sector.asteroids.bodies.find(
      (candidate) => !candidate.destroyed && candidate.mesh,
    );
    if (!body) return { staged: false };

    const camera = game.chaseCam.camera;
    const previousState = game.state;
    const playerVisible = game.player.object.visible;
    const originalInspect = game.inspectCrosshair;
    let hotkeyCalls = 0;
    try {
      game.player.object.visible = false;
      const outward = body.position.clone().normalize();
      if (outward.lengthSq() < 0.001) outward.set(0, 0, 1);
      camera.position
        .copy(body.position)
        .addScaledVector(outward, body.radius * 3 + 10);
      camera.lookAt(body.position);
      camera.updateMatrixWorld(true);
      game.scene.updateMatrixWorld(true);

      const report = originalInspect.call(game);
      game.inspectCrosshair = function inspectCrosshairFromHotkey() {
        hotkeyCalls++;
        return originalInspect.call(this);
      };
      game.state = 'playing';
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' }));
      game.updatePlaying(0);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'F8' }));
      game.input.endFrame();

      const instanceHit = report.hits.find(
        (hit) => hit.uuid === body.mesh.uuid && hit.instanceId === body.index,
      );
      return {
        staged: true,
        hitCount: report.hits.length,
        instanceMatched: Boolean(instanceHit),
        bounded: Boolean(
          instanceHit?.worldSize &&
          Object.values(instanceHit.worldSize).every(
            (value) => Number.isFinite(value) && value > 0,
          ),
        ),
        copyable: JSON.stringify(report).includes(body.mesh.uuid),
        hotkeyCalls,
      };
    } finally {
      game.inspectCrosshair = originalInspect;
      game.player.object.visible = playerVisible;
      game.state = previousState;
    }
  });
  console.log('scene probe:', JSON.stringify(result));
  return result;
}

export function collectSceneProbeFailures(result) {
  const failures = [];
  if (!result.staged) failures.push('scene probe staging');
  if (result.hitCount < 1) failures.push('scene probe raycast');
  if (!result.instanceMatched) failures.push('scene probe instance identity');
  if (!result.bounded) failures.push('scene probe instance bounds');
  if (!result.copyable) failures.push('scene probe copyable report');
  if (result.hotkeyCalls !== 1) failures.push('scene probe F8 hotkey');
  return failures;
}
