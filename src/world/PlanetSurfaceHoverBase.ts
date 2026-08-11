import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';
import { getSurfaceTexture } from '../rendering/SurfaceTextures';
import { PlanetInfo } from './Sector';
import { SurfaceStructureHost } from './PlanetSurfaceStructures';

export const HOVER_BASE_RADIUS = 86;

/** Build one stationary airborne Vigil station with a readable lift system. */
export function buildSurfaceHoverBase(
  host: SurfaceStructureHost,
  rng: Rng,
  x: number,
  y: number,
  z: number,
  planet: PlanetInfo,
): void {
  const plating = getSurfaceTexture('metal', 3, 3);
  const hull = new MeshStandardMaterial({
    color: new Color(0x66717c).lerp(planet.surfaceA, 0.14),
    metalness: 0.32,
    roughness: 0.46,
    map: plating,
    bumpMap: plating,
    bumpScale: 0.34,
    flatShading: true,
  });
  const armor = new MeshStandardMaterial({
    color: new Color(0x343d47).lerp(planet.surfaceB, 0.12),
    metalness: 0.35,
    roughness: 0.42,
    map: plating,
    bumpMap: plating,
    bumpScale: 0.3,
    flatShading: true,
  });
  const dark = new MeshStandardMaterial({
    color: 0x171d24,
    metalness: 0.28,
    roughness: 0.58,
    flatShading: true,
  });
  const window = new MeshStandardMaterial({
    color: 0x03090d,
    emissive: new Color(0x8be2ff),
    emissiveIntensity: 2.5,
    metalness: 0.2,
    roughness: 0.2,
  });
  const warning = new MeshStandardMaterial({
    color: 0x170403,
    emissive: new Color(0xff4433),
    emissiveIntensity: 2.7,
    metalness: 0.15,
    roughness: 0.38,
  });
  const lift = new MeshStandardMaterial({
    color: 0x02090c,
    emissive: new Color(0x42dfff),
    emissiveIntensity: 4.2,
    metalness: 0.18,
    roughness: 0.22,
  });
  const center = new Vector3(x, y, z);
  host.hoverBaseLandmarks.push({ center: center.clone(), radius: HOVER_BASE_RADIUS });

  const add = (
    mesh: Mesh,
    ox: number,
    oy: number,
    oz: number,
    collides = false,
  ): Mesh => {
    mesh.position.set(x + ox, y + oy, z + oz);
    host.group.add(mesh);
    if (collides) host.registerObstacle(mesh, 0.2);
    return mesh;
  };
  const box = (
    ox: number,
    oy: number,
    oz: number,
    width: number,
    height: number,
    depth: number,
    material = hull,
    collides = true,
  ): Mesh => add(
    new Mesh(new BoxGeometry(width, height, depth), material),
    ox, oy, oz, collides,
  );
  const cylinder = (
    ox: number,
    oy: number,
    oz: number,
    radius: number,
    height: number,
    material = hull,
    sides = 12,
    collides = true,
  ): Mesh => add(
    new Mesh(new CylinderGeometry(radius, radius * 1.08, height, sides), material),
    ox, oy, oz, collides,
  );

  // Layered octagonal core: broad enough to circle at close range, but much
  // smaller than the grounded districts below.
  cylinder(0, 0, 0, 38, 12, hull, 8);
  cylinder(0, 8, 0, 30, 8, armor, 8);
  cylinder(0, -9, 0, 28, 7, dark, 8);
  const equator = add(new Mesh(new TorusGeometry(39.5, 1.4, 8, 32), armor), 0, 0, 0, false);
  equator.rotation.x = Math.PI / 2;
  const lightRing = add(new Mesh(new TorusGeometry(40, 0.28, 6, 40), window), 0, 2.6, 0, false);
  lightRing.rotation.x = Math.PI / 2;

  // Four docking arms and terminal modules create flyable negative space.
  for (let armIndex = 0; armIndex < 4; armIndex++) {
    const angle = armIndex * Math.PI * 0.5;
    const ux = Math.cos(angle);
    const uz = Math.sin(angle);
    const arm = box(ux * 52, 2, uz * 52, 54, 7, 10, armor, false);
    arm.rotation.y = -angle;
    host.registerObstacle(arm, 0.2);

    const terminal = cylinder(ux * 77, 1, uz * 77, 10.5, 13, hull, 8);
    terminal.rotation.y = -angle;
    const collar = add(
      new Mesh(new TorusGeometry(10.6, 0.75, 6, 20), dark),
      ux * 77,
      4.5,
      uz * 77,
      false,
    );
    collar.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      box(
        ux * 77 + (armIndex % 2 === 0 ? 0 : side * 6.7),
        1.5,
        uz * 77 + (armIndex % 2 === 0 ? side * 6.7 : 0),
        armIndex % 2 === 0 ? 0.35 : 8,
        0.7,
        armIndex % 2 === 0 ? 8 : 0.35,
        window,
        false,
      );
    }
  }

  // Command tower, observation deck, radome, and antenna crown.
  box(0, 18, -4, 23, 20, 21, hull);
  box(0, 29, -4, 17, 5, 18, armor);
  for (const side of [-1, 1]) {
    box(0, 22 + side * 5, -14.7, 13, 1.0, 0.4, window, false);
  }
  cylinder(0, 35, -1, 7.5, 6, dark, 10);
  add(new Mesh(new SphereGeometry(6.5, 14, 8), hull), 0, 41, -1, false);
  cylinder(0, 48, -1, 0.45, 14, dark, 6, false);
  add(new Mesh(new OctahedronGeometry(1.2, 0), warning), 0, 56, -1, false);

  // Ventral keel and four visible lift pods make the airborne mass believable.
  box(0, -18, 0, 12, 17, 31, armor);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = sx * 23;
      const pz = sz * 20;
      cylinder(px, -18, pz, 5.6, 18, dark, 10);
      const nozzle = add(
        new Mesh(new CylinderGeometry(4.8, 3.7, 3.2, 12), armor),
        px,
        -29,
        pz,
        false,
      );
      const flame = add(
        new Mesh(new ConeGeometry(3.4, 10, 12, 1, true), lift),
        px,
        -35,
        pz,
        false,
      );
      flame.rotation.z = Math.PI;
      add(new Mesh(new SphereGeometry(2.4, 10, 7), lift), px, -31.2, pz, false);
      nozzle.name = 'hover-lift-nozzle';
    }
  }

  // Two open landing decks with painted approach rails and low blast screens.
  for (const side of [-1, 1]) {
    const deckX = side * 52;
    box(deckX, 8.2, 0, 37, 1.8, 28, dark);
    for (const railZ of [-10.5, 10.5]) {
      box(deckX, 9.25, railZ, 31, 0.22, 0.45, side > 0 ? window : warning, false);
    }
    for (let mark = -2; mark <= 2; mark++) {
      box(deckX + mark * 6, 9.28, 0, 3.5, 0.18, 0.55, warning, false);
    }
    box(deckX, 11, side * -13.3, 32, 5, 1.1, armor, false);
  }

  // Dense close-range machinery: radiator vanes, tanks, conduits, and lamps.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 4; index++) {
      const vane = box(side * 25, 14 + index * 3.1, 18, 13, 0.45, 6.5, dark, false);
      vane.rotation.z = side * 0.12;
      box(side * 25, 14.35 + index * 3.1, 14.6, 10, 0.15, 0.25, window, false);
    }
    cylinder(side * 16, -2, 26, 3.2, 13, armor, 10, false);
    cylinder(side * 24, -2, 26, 3.2, 13, armor, 10, false);
  }
  for (let index = 0; index < 16; index++) {
    const angle = (index / 16) * Math.PI * 2;
    add(
      new Mesh(new SphereGeometry(0.55, 7, 5), index % 2 === 0 ? warning : window),
      Math.cos(angle) * 41,
      5.3,
      Math.sin(angle) * 41,
      false,
    );
  }

  // A translucent-looking but opaque navigation halo reads through fog.
  const halo = add(
    new Mesh(
      new RingGeometry(48, 49, 48),
      new MeshBasicMaterial({ color: 0x61ddff, transparent: true, opacity: 0.2, depthWrite: false }),
    ),
    0,
    -6,
    0,
    false,
  );
  halo.rotation.x = -Math.PI / 2;

  host.addTurretPost(x - 24, y + 10, z, x - 220, z);
  host.addTurretPost(x + 24, y + 10, z, x + 220, z);
  host.addTurretPost(x, y + 6.5, z + 24, x, z + 220);
  host.addStash(rng, x + 52, y + 10.5, z);
  host.patrols.push({
    waypoints: Array.from({ length: 5 }, (_, index) => {
      const angle = (index / 5) * Math.PI * 2 + 0.35;
      return new Vector3(
        x + Math.cos(angle) * 180,
        y + 36 + Math.sin(angle * 2) * 18,
        z + Math.sin(angle) * 180,
      );
    }),
    size: rng.int(2, 3),
  });
}
