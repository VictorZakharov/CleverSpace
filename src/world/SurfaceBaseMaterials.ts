import { Color, Group, MeshStandardMaterial } from 'three';
import { getSurfaceTexture } from '../rendering/SurfaceTextures';
import { PlanetInfo } from './Sector';

export interface SurfaceBaseMaterials {
  wall: MeshStandardMaterial;
  dark: MeshStandardMaterial;
  accent: MeshStandardMaterial;
  window: MeshStandardMaterial;
  hazard: MeshStandardMaterial;
  pad: MeshStandardMaterial;
  armor: MeshStandardMaterial;
  deck: MeshStandardMaterial;
}

const palettes = new WeakMap<Group, SurfaceBaseMaterials>();

/** One planet-wide palette lets every installation share static render batches. */
export function getSurfaceBaseMaterials(
  root: Group,
  planet: PlanetInfo,
): SurfaceBaseMaterials {
  const cached = palettes.get(root);
  if (cached) return cached;
  const plating = getSurfaceTexture('metal', 2, 2);
  const textured = (color: Color | number, metalness: number, roughness: number) =>
    new MeshStandardMaterial({
      color,
      metalness,
      roughness,
      flatShading: true,
      map: plating,
      bumpMap: plating,
      bumpScale: 0.4,
    });
  const palette: SurfaceBaseMaterials = {
    wall: textured(new Color(0x59626c).lerp(planet.surfaceB, 0.25), 0.3, 0.55),
    dark: textured(0x31373e, 0.35, 0.5),
    accent: new MeshStandardMaterial({
      color: 0x140505,
      emissive: new Color(0xff3b30),
      emissiveIntensity: 1.9,
    }),
    window: new MeshStandardMaterial({
      color: 0x05090e,
      emissive: new Color(0x9fd8ff),
      emissiveIntensity: 1.9,
    }),
    hazard: new MeshStandardMaterial({
      color: 0x1a1206,
      emissive: new Color(0xffb347),
      emissiveIntensity: 1.45,
    }),
    pad: textured(0x4a5158, 0.12, 0.88),
    armor: textured(new Color(0x414a54).lerp(planet.surfaceB, 0.12), 0.32, 0.5),
    deck: textured(0x4b535b, 0.2, 0.82),
  };
  palettes.set(root, palette);
  return palette;
}
