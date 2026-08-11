import {
  CanvasTexture,
  Group,
  MathUtils,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { SurfaceBaseId, SurfaceRepairPad } from './PlanetSurfaceStructures';
import {
  drawActivePadLight,
  drawLockedPadPanel,
  drawRepairMote,
  drawUnlockedPadPanel,
  makeAdditiveSpriteMaterial,
  makePanelTexture,
} from './SurfaceRepairPadTextures';

const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 112;
const ICON_WIDTH = 112;
const HEIGHT = 5.5;
const FULL_WIDTH = HEIGHT * TEXTURE_WIDTH / TEXTURE_HEIGHT;
const COMPACT_FRACTION = ICON_WIDTH / TEXTURE_WIDTH;
const NEAR_DISTANCE = 155;
const HOVER_HEIGHT = 9;
const UNLOCK_HOLD_SECONDS = 3;
const UNLOCK_FADE_SECONDS = 0.65;

interface PadIndicator {
  readonly pad: SurfaceRepairPad;
  readonly sprite: Sprite;
  readonly material: SpriteMaterial;
  readonly lockedTexture: CanvasTexture;
  readonly unlockedTexture: CanvasTexture;
  readonly activeEffect: Group;
  readonly activeLights: Sprite[];
  readonly repairEffect: Group;
  readonly repairMotes: Sprite[];
  readonly bobPhase: number;
  expansion: number;
  wasLocked: boolean | null;
  unlockAge: number | null;
}

/** Camera-facing repair-pad locks that reveal their warning at close range. */
export class SurfaceRepairPadIndicators {
  readonly count: number;
  private readonly indicators: PadIndicator[];
  private elapsed = 0;

  constructor(root: Group, pads: readonly SurfaceRepairPad[]) {
    const lockedCanvas = drawLockedPadPanel();
    const unlockedCanvas = drawUnlockedPadPanel();
    const repairMaterial = makeAdditiveSpriteMaterial(drawRepairMote());
    const activeMaterial = makeAdditiveSpriteMaterial(drawActivePadLight());
    this.indicators = pads.map((pad, index) => {
      const lockedTexture = makePanelTexture(lockedCanvas, COMPACT_FRACTION);
      const unlockedTexture = makePanelTexture(unlockedCanvas, COMPACT_FRACTION);

      const material = new SpriteMaterial({
        map: lockedTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const sprite = new Sprite(material);
      sprite.name = `repair-pad-lock-${pad.baseId}`;
      sprite.center.set(1, 0.5);
      sprite.position.copy(pad.center).add(new Vector3(0, HOVER_HEIGHT, 0));
      sprite.scale.set(FULL_WIDTH * COMPACT_FRACTION, HEIGHT, 1);
      sprite.renderOrder = 80;
      sprite.userData.repairPadIndicator = true;
      sprite.userData.surfaceBaseId = pad.baseId;
      sprite.userData.expansion = 0;
      sprite.userData.messageVisible = false;
      root.add(sprite);

      const activeEffect = new Group();
      activeEffect.name = `repair-pad-online-${pad.baseId}`;
      activeEffect.position.copy(pad.center);
      activeEffect.visible = false;
      activeEffect.userData.repairPadActiveEffect = true;
      activeEffect.userData.surfaceBaseId = pad.baseId;
      activeEffect.userData.active = false;
      const activeLights = Array.from({ length: 8 }, (_, lightIndex) => {
        const light = new Sprite(activeMaterial);
        light.name = `repair-pad-online-light-${lightIndex}`;
        light.renderOrder = 78;
        activeEffect.add(light);
        return light;
      });
      root.add(activeEffect);

      const repairEffect = new Group();
      repairEffect.name = `repair-pad-effect-${pad.baseId}`;
      repairEffect.position.copy(pad.center);
      repairEffect.visible = false;
      repairEffect.userData.repairPadEffect = true;
      repairEffect.userData.surfaceBaseId = pad.baseId;
      repairEffect.userData.active = false;
      const repairMotes = Array.from({ length: 6 }, (_, moteIndex) => {
        const mote = new Sprite(repairMaterial);
        mote.name = `repair-mote-${moteIndex}`;
        mote.renderOrder = 79;
        repairEffect.add(mote);
        return mote;
      });
      root.add(repairEffect);
      return {
        pad,
        sprite,
        material,
        lockedTexture,
        unlockedTexture,
        activeEffect,
        activeLights,
        repairEffect,
        repairMotes,
        bobPhase: index * 2.1,
        expansion: 0,
        wasLocked: null,
        unlockAge: null,
      };
    });
    this.count = this.indicators.length;
  }

  update(
    dt: number,
    playerPosition: Vector3,
    isLocked: (baseId: SurfaceBaseId) => boolean,
    repairingBaseId: SurfaceBaseId | null,
  ): void {
    this.elapsed += dt;
    for (const indicator of this.indicators) {
      const locked = isLocked(indicator.pad.baseId);
      const justUnlocked = indicator.wasLocked === true && !locked;
      indicator.wasLocked = locked;
      if (locked) {
        indicator.unlockAge = null;
        if (indicator.material.map !== indicator.lockedTexture) {
          indicator.material.map = indicator.lockedTexture;
          indicator.material.needsUpdate = true;
        }
        indicator.material.opacity = 1;
        const nearby =
          playerPosition.distanceToSquared(indicator.pad.center) <= NEAR_DISTANCE ** 2;
        indicator.expansion = MathUtils.damp(
          indicator.expansion,
          nearby ? 1 : 0,
          7.5,
          dt,
        );
        if (Math.abs(indicator.expansion - (nearby ? 1 : 0)) < 0.001) {
          indicator.expansion = nearby ? 1 : 0;
        }
        const reveal = MathUtils.lerp(COMPACT_FRACTION, 1, indicator.expansion);
        indicator.lockedTexture.repeat.x = reveal;
        indicator.lockedTexture.offset.x = 1 - reveal;
        indicator.sprite.scale.set(FULL_WIDTH * reveal, HEIGHT, 1);
        indicator.sprite.visible = true;
        indicator.sprite.userData.status = 'locked';
        indicator.sprite.userData.messageVisible = indicator.expansion > 0.9;
      } else if (justUnlocked || indicator.unlockAge !== null) {
        if (justUnlocked) {
          indicator.unlockAge = 0;
          indicator.material.map = indicator.unlockedTexture;
          indicator.material.needsUpdate = true;
        }
        indicator.unlockAge = (indicator.unlockAge ?? 0) + dt;
        indicator.expansion = MathUtils.damp(indicator.expansion, 1, 8, dt);
        const fadeAge = indicator.unlockAge - UNLOCK_HOLD_SECONDS;
        indicator.material.opacity = fadeAge <= 0
          ? 1
          : Math.max(0, 1 - fadeAge / UNLOCK_FADE_SECONDS);
        indicator.unlockedTexture.repeat.set(1, 1);
        indicator.unlockedTexture.offset.set(0, 0);
        const pulse = indicator.unlockAge < 0.45
          ? 1 + Math.sin(indicator.unlockAge / 0.45 * Math.PI) * 0.09
          : 1;
        indicator.sprite.scale.set(FULL_WIDTH * indicator.expansion, HEIGHT * pulse, 1);
        indicator.sprite.visible = indicator.material.opacity > 0;
        indicator.sprite.userData.status = 'unlocked';
        indicator.sprite.userData.messageVisible = false;
        if (!indicator.sprite.visible) indicator.unlockAge = null;
      } else {
        indicator.material.opacity = 0;
        indicator.sprite.visible = false;
        indicator.sprite.userData.status = 'hidden';
        indicator.sprite.userData.messageVisible = false;
      }
      indicator.sprite.position.y = indicator.pad.center.y + HOVER_HEIGHT +
        Math.sin(this.elapsed * 1.8 + indicator.bobPhase) * 0.35;
      indicator.sprite.userData.expansion = indicator.expansion;

      indicator.activeEffect.visible = !locked;
      indicator.activeEffect.userData.active = !locked;
      if (!locked) {
        indicator.activeLights.forEach((light, index) => {
          const angle = this.elapsed * 0.38 + index / indicator.activeLights.length * Math.PI * 2;
          const chase = 0.5 + 0.5 * Math.sin(this.elapsed * 5.2 - index * 0.9);
          light.position.set(Math.cos(angle) * 7.35, 0.48, Math.sin(angle) * 7.35);
          const size = 0.7 + chase * 0.65;
          light.scale.set(size, size, 1);
        });
      }

      const repairing = repairingBaseId === indicator.pad.baseId;
      indicator.repairEffect.visible = repairing;
      indicator.repairEffect.userData.active = repairing;
      if (!repairing) continue;
      indicator.repairMotes.forEach((mote, index) => {
        const phase = (this.elapsed * 0.42 + index / indicator.repairMotes.length) % 1;
        const angle = this.elapsed * 0.85 + index * 2.4;
        const radius = 3.1 + Math.sin(this.elapsed * 1.7 + index) * 0.55;
        mote.position.set(
          Math.cos(angle) * radius,
          1.1 + phase * 8,
          Math.sin(angle) * radius,
        );
        const size = 1.25 + Math.sin(phase * Math.PI) * 0.7;
        mote.scale.set(size, size, 1);
      });
    }
  }
}
