import {
  CanvasTexture,
  Group,
  LinearFilter,
  MathUtils,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { SurfaceBaseId, SurfaceRepairPad } from './PlanetSurfaceStructures';

const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 112;
const ICON_WIDTH = 112;
const HEIGHT = 5.5;
const FULL_WIDTH = HEIGHT * TEXTURE_WIDTH / TEXTURE_HEIGHT;
const COMPACT_FRACTION = ICON_WIDTH / TEXTURE_WIDTH;
const NEAR_DISTANCE = 155;
const HOVER_HEIGHT = 9;

interface PadIndicator {
  readonly pad: SurfaceRepairPad;
  readonly sprite: Sprite;
  readonly texture: CanvasTexture;
  readonly bobPhase: number;
  expansion: number;
}

/** Camera-facing repair-pad locks that reveal their warning at close range. */
export class SurfaceRepairPadIndicators {
  readonly count: number;
  private readonly indicators: PadIndicator[];
  private elapsed = 0;

  constructor(root: Group, pads: readonly SurfaceRepairPad[]) {
    const canvas = drawLockedPadPanel();
    this.indicators = pads.map((pad, index) => {
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.repeat.set(COMPACT_FRACTION, 1);
      texture.offset.set(1 - COMPACT_FRACTION, 0);

      const material = new SpriteMaterial({
        map: texture,
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
      return { pad, sprite, texture, bobPhase: index * 2.1, expansion: 0 };
    });
    this.count = this.indicators.length;
  }

  update(
    dt: number,
    playerPosition: Vector3,
    isLocked: (baseId: SurfaceBaseId) => boolean,
  ): void {
    this.elapsed += dt;
    for (const indicator of this.indicators) {
      const locked = isLocked(indicator.pad.baseId);
      const nearby = locked &&
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
      indicator.texture.repeat.x = reveal;
      indicator.texture.offset.x = 1 - reveal;
      indicator.sprite.scale.x = FULL_WIDTH * reveal;
      indicator.sprite.position.y = indicator.pad.center.y + HOVER_HEIGHT +
        Math.sin(this.elapsed * 1.8 + indicator.bobPhase) * 0.35;
      indicator.sprite.visible = locked;
      indicator.sprite.userData.expansion = indicator.expansion;
      indicator.sprite.userData.messageVisible = indicator.expansion > 0.9;
    }
  }
}

function drawLockedPadPanel(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext('2d')!;

  roundedRect(context, 3, 3, 506, 106, 18);
  context.fillStyle = 'rgba(6, 13, 18, 0.9)';
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = 'rgba(255, 84, 70, 0.95)';
  context.stroke();

  context.fillStyle = 'rgba(255, 84, 70, 0.16)';
  context.fillRect(TEXTURE_WIDTH - ICON_WIDTH, 7, ICON_WIDTH - 7, 98);
  context.fillStyle = '#ff5b4d';
  context.font = '700 34px "Segoe UI", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('ENEMIES NEARBY', 202, 57);

  const lockX = 456;
  context.lineWidth = 8;
  context.lineCap = 'round';
  context.strokeStyle = '#ffb17a';
  context.beginPath();
  context.arc(lockX, 47, 21, Math.PI, 0);
  context.stroke();
  roundedRect(context, lockX - 30, 45, 60, 47, 9);
  context.fillStyle = '#ff5b4d';
  context.fill();
  context.fillStyle = '#160b0b';
  context.beginPath();
  context.arc(lockX, 66, 5, 0, Math.PI * 2);
  context.fill();
  context.fillRect(lockX - 2.5, 66, 5, 12);
  return canvas;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}
