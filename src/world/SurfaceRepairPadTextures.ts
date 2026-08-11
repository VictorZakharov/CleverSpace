import {
  AdditiveBlending,
  CanvasTexture,
  LinearFilter,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three';

const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 112;
const ICON_WIDTH = 112;

export function makePanelTexture(
  canvas: HTMLCanvasElement,
  compactFraction: number,
): CanvasTexture {
  const texture = makeTexture(canvas);
  texture.repeat.set(compactFraction, 1);
  texture.offset.set(1 - compactFraction, 0);
  return texture;
}

export function makeAdditiveSpriteMaterial(canvas: HTMLCanvasElement): SpriteMaterial {
  return new SpriteMaterial({
    map: makeTexture(canvas),
    transparent: true,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

function makeTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

export function drawLockedPadPanel(): HTMLCanvasElement {
  const canvas = panelCanvas();
  const context = canvas.getContext('2d')!;
  panelFrame(context, 'rgba(6, 13, 18, 0.9)', '#ff5446', 'rgba(255, 84, 70, 0.16)');
  panelLabel(context, 'ENEMIES NEARBY', '#ff5b4d');

  const lockX = 456;
  context.lineWidth = 8;
  context.lineCap = 'round';
  context.strokeStyle = '#ffb17a';
  context.beginPath();
  context.arc(lockX, 47, 21, Math.PI, 0);
  context.stroke();
  drawLockBody(context, lockX, '#ff5b4d', '#160b0b');
  return canvas;
}

export function drawUnlockedPadPanel(): HTMLCanvasElement {
  const canvas = panelCanvas();
  const context = canvas.getContext('2d')!;
  panelFrame(context, 'rgba(5, 18, 15, 0.92)', '#4cffa6', 'rgba(76, 255, 166, 0.16)');
  panelLabel(context, 'PAD UNLOCKED', '#63ffb2');

  const lockX = 456;
  context.lineWidth = 8;
  context.lineCap = 'round';
  context.strokeStyle = '#a8ffd5';
  context.beginPath();
  context.moveTo(lockX - 14, 36);
  context.bezierCurveTo(lockX - 14, 12, lockX + 25, 12, lockX + 25, 47);
  context.stroke();
  drawLockBody(context, lockX, '#4cff9f', '#071812');
  return canvas;
}

export function drawRepairMote(): HTMLCanvasElement {
  const canvas = squareCanvas();
  const context = canvas.getContext('2d')!;
  drawGlow(context, 'rgba(170, 255, 216, 0.72)');
  context.strokeStyle = '#8fffc9';
  context.lineWidth = 8;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(32, 16);
  context.lineTo(32, 48);
  context.moveTo(16, 32);
  context.lineTo(48, 32);
  context.stroke();
  return canvas;
}

export function drawActivePadLight(): HTMLCanvasElement {
  const canvas = squareCanvas();
  const context = canvas.getContext('2d')!;
  drawGlow(context, 'rgba(130, 255, 198, 0.9)');
  context.fillStyle = '#68ffb5';
  context.beginPath();
  context.moveTo(32, 18);
  context.lineTo(46, 32);
  context.lineTo(32, 46);
  context.lineTo(18, 32);
  context.closePath();
  context.fill();
  return canvas;
}

function panelCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  return canvas;
}

function squareCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  return canvas;
}

function panelFrame(
  context: CanvasRenderingContext2D,
  fill: string,
  stroke: string,
  iconFill: string,
): void {
  roundedRect(context, 3, 3, 506, 106, 18);
  context.fillStyle = fill;
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = stroke;
  context.stroke();
  context.fillStyle = iconFill;
  context.fillRect(TEXTURE_WIDTH - ICON_WIDTH, 7, ICON_WIDTH - 7, 98);
}

function panelLabel(
  context: CanvasRenderingContext2D,
  label: string,
  color: string,
): void {
  context.fillStyle = color;
  context.font = '700 34px "Segoe UI", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 202, 57);
}

function drawLockBody(
  context: CanvasRenderingContext2D,
  lockX: number,
  fill: string,
  keyhole: string,
): void {
  roundedRect(context, lockX - 30, 45, 60, 47, 9);
  context.fillStyle = fill;
  context.fill();
  context.fillStyle = keyhole;
  context.beginPath();
  context.arc(lockX, 66, 5, 0, Math.PI * 2);
  context.fill();
  context.fillRect(lockX - 2.5, 66, 5, 12);
}

function drawGlow(context: CanvasRenderingContext2D, centerColor: string): void {
  const glow = context.createRadialGradient(32, 32, 2, 32, 32, 30);
  glow.addColorStop(0, centerColor);
  glow.addColorStop(1, 'rgba(55, 255, 157, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
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
