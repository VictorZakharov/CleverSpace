/** Exercise the attacked carrier's wake, pursuit, mount, and retaliation path. */
export async function runCapitalRetaliationSmoke(page) {
  const result = await page.evaluate(() => {
    const game = window.game;
    const capital = game.capital;
    if (!capital) return { retaliationPursuit: false };
    const initialRotation = capital.object.quaternion.clone();
    const inverseRotation = initialRotation.clone().invert();
    const turret = game.capitalTurrets.find(
      (candidate) => candidate.alive && candidate.mountNormal &&
        candidate.position.clone().sub(capital.position)
          .applyQuaternion(inverseRotation).x > 2,
    );
    if (!turret) return { retaliationPursuit: false };
    game.loop.stop();
    game.projectiles.clear();
    const activeBodies = game.world.bodies.filter((body) => !body.destroyed);
    for (const body of activeBodies) body.destroyed = true;
    game.player.alive = true;
    game.player.hull = game.player.hullMax;
    game.player.shield = game.player.shieldMax;
    game.player.velocity.set(0, 0, 0);
    capital.phase = 'idle';
    capital.cooldown = 999;
    capital.velocity.set(0, 0, 0);
    const localMountPosition = turret.position.clone()
      .sub(capital.position)
      .applyQuaternion(inverseRotation);
    const localMountNormal = turret.mountNormal.clone().applyQuaternion(inverseRotation);
    const side = capital.position.clone().set(1, 0, 0).applyQuaternion(initialRotation);
    game.player.position.copy(capital.position).addScaledVector(side, 900);
    const losFromTurret = () => game.combat.hasLineOfSight(
      turret.position.clone().addScaledVector(turret.mountNormal, 3),
      game.player.position,
    );
    const blockedBefore = !turret.canTraverse(game.player.position) || !losFromTurret();
    const startDistance = capital.position.distanceTo(game.player.position);
    const facing = capital.position.clone();
    capital.forward(facing);
    const startFacing = facing.dot(side);
    const hullBefore = capital.hull;
    const dormantBefore = !capital.isAwake;
    let charges = 0;
    let chargeDistance = 0;
    const context = {
      player: game.player,
      playerVisible: true,
      canSeePlayer: () => true,
      syncMounts: () => {
        for (const mounted of game.capitalTurrets) {
          mounted.syncCapitalMount(
            capital.position,
            capital.object.quaternion,
            capital.velocity,
          );
        }
      },
      onCharge: () => {
        charges++;
        chargeDistance = capital.position.distanceTo(game.player.position);
      },
      onFire: (shot) => shot.range,
    };

    game.combat.resolveHit({
      ship: capital,
      asteroid: null,
      point: capital.position.clone(),
      damage: 26,
      faction: 'player',
      wasMissile: false,
    });
    let oneSecondFacing = startFacing;
    for (let frame = 0; frame < 900; frame++) {
      capital.update(1 / 60, context);
      if (frame === 59) {
        capital.forward(facing);
        oneSecondFacing = facing.dot(side);
      }
    }

    capital.forward(facing);
    const endDistance = capital.position.distanceTo(game.player.position);
    const expectedMount = localMountPosition.clone()
      .applyQuaternion(capital.object.quaternion)
      .add(capital.position);
    const expectedNormal = localMountNormal.clone()
      .applyQuaternion(capital.object.quaternion)
      .normalize();
    const mountAttached =
      turret.position.distanceTo(expectedMount) < 0.001 &&
      turret.mountNormal.distanceTo(expectedNormal) < 0.001 &&
      turret.velocity.distanceTo(capital.velocity) < 0.001;
    const traverseClear = turret.canTraverse(game.player.position);
    const lineOfSightClear = losFromTurret();
    const turretClear = traverseClear && lineOfSightClear;
    const slowTurn = oneSecondFacing > startFacing + 0.03 && oneSecondFacing < 0.25;
    const retaliationPursuit =
      dormantBefore && capital.isAwake && capital.hull === hullBefore - 26 &&
      blockedBefore && slowTurn && facing.dot(side) > 0.75 &&
      endDistance < startDistance - 5 && mountAttached && turretClear &&
      charges === 1 && chargeDistance > 500;
    for (const body of activeBodies) body.destroyed = false;
    return {
      retaliationPursuit,
      dormantBefore,
      nonMissileDamage: hullBefore - capital.hull,
      blockedBefore,
      slowTurn,
      oneSecondFacing: Number(oneSecondFacing.toFixed(3)),
      finalFacing: Number(facing.dot(side).toFixed(3)),
      distanceClosed: Number((startDistance - endDistance).toFixed(2)),
      mountAttached, turretClear, traverseClear, lineOfSightClear,
      charges,
      chargeDistance: Number(chargeDistance.toFixed(1)),
    };
  });
  console.log('capital retaliation pursuit:', JSON.stringify(result));
  return result;
}
