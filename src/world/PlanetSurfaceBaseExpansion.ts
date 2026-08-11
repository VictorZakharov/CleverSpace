import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';
import { PlanetInfo } from './Sector';
import { BaseKind, SurfaceStructureHost } from './PlanetSurfaceStructures';
import { getSurfaceBaseMaterials } from './SurfaceBaseMaterials';

const BASE_HALF_EXTENT = 112;

/**
 * Grow the compact inner installation into a landmark-scale fortified district.
 * Major masses receive collision; panel seams, windows, lamps, and machinery do
 * not, keeping close flight honest without flooding the surface broadphase.
 */
export function buildSurfaceBaseExpansion(
  host: SurfaceStructureHost,
  rng: Rng,
  x: number,
  z: number,
  kind: BaseKind,
  planet: PlanetInfo,
): void {
  new BaseExpansionBuilder(host, rng, x, z, kind, planet).build();
}

class BaseExpansionBuilder {
  private readonly ground: number;
  private readonly wall: MeshStandardMaterial;
  private readonly armor: MeshStandardMaterial;
  private readonly dark: MeshStandardMaterial;
  private readonly window: MeshStandardMaterial;
  private readonly warning: MeshStandardMaterial;
  private readonly deck: MeshStandardMaterial;
  private readonly halfExtent: number;

  constructor(
    private readonly host: SurfaceStructureHost,
    private readonly rng: Rng,
    private readonly bx: number,
    private readonly bz: number,
    private readonly kind: BaseKind,
    planet: PlanetInfo,
  ) {
    this.ground = host.heightAt(bx, bz);
    this.halfExtent = kind === 'fortress' ? 122 : BASE_HALF_EXTENT;
    const palette = getSurfaceBaseMaterials(host.group, planet);
    this.wall = palette.wall;
    this.armor = palette.armor;
    this.dark = palette.dark;
    this.window = palette.window;
    this.warning = palette.accent;
    this.deck = palette.deck;
  }

  build(): void {
    this.addPerimeter();
    this.addInfrastructure();
    if (this.kind === 'compound') this.addCompoundDistrict();
    else if (this.kind === 'comm') this.addCommunicationsDistrict();
    else if (this.kind === 'depot') this.addRefineryDistrict();
    else this.addFortressDistrict();
    this.addGroundLaunchers();
  }

  private addMesh(mesh: Mesh, x: number, y: number, z: number, collides = false): Mesh {
    mesh.position.set(this.bx + x, this.ground + y, this.bz + z);
    this.host.group.add(mesh);
    if (collides) this.host.registerObstacle(mesh, 0.22);
    return mesh;
  }

  private box(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    material = this.wall,
    collides = true,
  ): Mesh {
    return this.addMesh(
      new Mesh(new BoxGeometry(width, height, depth), material),
      x,
      y + height * 0.5,
      z,
      collides,
    );
  }

  private cylinder(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    material = this.wall,
    sides = 10,
    collides = true,
  ): Mesh {
    return this.addMesh(
      new Mesh(new CylinderGeometry(radius, radius * 1.08, height, sides), material),
      x,
      y + height * 0.5,
      z,
      collides,
    );
  }

  private addPerimeter(): void {
    const half = this.halfExtent;
    const wallHeight = this.kind === 'fortress' ? 20 : 16;
    const wallThickness = this.kind === 'fortress' ? 5.5 : 4.2;
    const gateHalf = 17;
    const sideSegment = (half * 2 - 18) / 3;

    // Rear wall and flanks are broken into architectural bays. The front wall
    // leaves a ship-wide gate instead of presenting an unbroken collision slab.
    for (let index = 0; index < 3; index++) {
      const along = -half + 9 + sideSegment * (index + 0.5);
      this.wallBay(along, -half, sideSegment - 3, wallHeight, wallThickness, false);
      this.wallBay(-half, along, sideSegment - 3, wallHeight, wallThickness, true);
      this.wallBay(half, along, sideSegment - 3, wallHeight, wallThickness, true);
    }
    const frontLength = half - gateHalf - 4;
    for (const side of [-1, 1]) {
      const x = side * (gateHalf + frontLength * 0.5);
      this.wallBay(x, half, frontLength, wallHeight, wallThickness, false);
    }

    // Gate pylons and high lintel leave roughly 15 m of vertical clearance.
    for (const side of [-1, 1]) {
      this.box(side * (gateHalf + 2.6), 0, half, 5.2, wallHeight + 8, 8, this.armor);
      this.box(side * (gateHalf + 2.6), wallHeight + 8.4, half, 2.6, 1.0, 8.4, this.warning, false);
    }
    this.box(0, wallHeight + 5.5, half, gateHalf * 2, 4.2, 5.8, this.dark);
    this.box(0, wallHeight + 7.8, half + 0.2, gateHalf * 1.45, 0.6, 6.1, this.window, false);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) this.cornerBastion(sx * half, sz * half, wallHeight);
    }
  }

  private wallBay(
    x: number,
    z: number,
    length: number,
    height: number,
    thickness: number,
    alongZ: boolean,
  ): void {
    const wall = this.box(
      x,
      0,
      z,
      alongZ ? thickness : length,
      height,
      alongZ ? length : thickness,
      this.wall,
    );
    wall.name = 'fortified-perimeter-wall';
    this.box(
      x,
      height,
      z,
      alongZ ? thickness + 1.4 : length + 1.4,
      1.1,
      alongZ ? length + 1.4 : thickness + 1.4,
      this.dark,
      false,
    );
    this.box(
      x,
      height - 2.8,
      z + (alongZ ? 0 : thickness * 0.53),
      alongZ ? 0.36 : length * 0.88,
      0.38,
      alongZ ? length * 0.88 : 0.36,
      this.warning,
      false,
    );
    for (const offset of [-length * 0.33, length * 0.33]) {
      this.box(
        x + (alongZ ? 0 : offset),
        0,
        z + (alongZ ? offset : 0),
        alongZ ? thickness + 3 : 3,
        height + 3,
        alongZ ? 3 : thickness + 3,
        this.armor,
        false,
      );
    }
  }

  private cornerBastion(x: number, z: number, wallHeight: number): void {
    const height = wallHeight + 12;
    this.cylinder(x, 0, z, 8.5, height, this.armor, 8);
    this.addMesh(
      new Mesh(new ConeGeometry(9.2, 3.8, 8), this.dark),
      x,
      height + 1.9,
      z,
      false,
    );
    for (let side = 0; side < 8; side++) {
      const angle = (side / 8) * Math.PI * 2;
      this.box(
        x + Math.cos(angle) * 8.6,
        height * 0.58,
        z + Math.sin(angle) * 8.6,
        1.5,
        0.8,
        0.35,
        side % 2 === 0 ? this.window : this.warning,
        false,
      ).rotation.y = -angle;
    }
  }

  private addInfrastructure(): void {
    // Main avenue, transverse service lane, and inset runway markings establish
    // a readable city plan from the air while staying flush with the terrain.
    this.box(0, 0.05, 72, 27, 0.55, 92, this.deck, false);
    this.box(0, 0.06, -59, 164, 0.58, 19, this.deck, false);
    this.box(0, 0.08, 32, 118, 0.54, 16, this.deck, false);
    for (let index = -4; index <= 4; index++) {
      this.box(index * 12, 0.39, -59, 7.4, 0.12, 0.65, this.warning, false);
    }
    for (const side of [-1, 1]) {
      for (let step = 0; step < 5; step++) {
        const z = 48 + step * 16;
        this.box(side * 11.3, 0.38, z, 0.55, 0.14, 7.2, this.window, false);
      }
    }
    for (const x of [-82, -42, 42, 82]) {
      this.lightMast(x, 67);
      this.lightMast(x, -78);
    }
  }

  private lightMast(x: number, z: number): void {
    this.cylinder(x, 0, z, 0.28, 12, this.dark, 6, false);
    this.box(x, 11.6, z, 2.6, 0.65, 0.7, this.window, false);
    this.addMesh(new Mesh(new SphereGeometry(0.32, 7, 5), this.warning), x, 12.7, z, false);
  }

  private addCompoundDistrict(): void {
    this.tieredTower(-67, -36, 34, 48, 31);
    this.hangar(65, -37, 52, 22, 34);
    this.box(-20, 14, -47, 66, 5, 7, this.armor);
    this.box(-20, 15.5, -43.2, 52, 0.5, 0.35, this.window, false);
    this.rooftopMachinery(-67, -36, 48);
    this.crane(75, 25, 33);
    for (let index = 0; index < 6; index++) {
      this.cargoContainer(-86 + (index % 3) * 13, 42 + Math.floor(index / 3) * 8, index);
    }
  }

  private addCommunicationsDistrict(): void {
    this.tieredTower(-62, -43, 31, 37, 27);
    this.box(62, 0, -42, 48, 18, 31, this.wall);
    this.facadeWindows(62, -42, 48, 18, 31);
    this.box(62, 18, -42, 42, 2.1, 34, this.dark, false);

    // The original relay remains the base of an 86 m segmented landmark mast.
    for (let segment = 0; segment < 4; segment++) {
      const radius = 2.4 - segment * 0.35;
      this.cylinder(0, 30 + segment * 13, 0, radius, 12, this.armor, 8, false);
      this.addMesh(
        new Mesh(new TorusGeometry(6.2 - segment * 0.65, 0.38, 7, 20), this.dark),
        0,
        42 + segment * 13,
        0,
        false,
      ).rotation.x = Math.PI / 2;
    }
    const dish = this.addMesh(
      new Mesh(new ConeGeometry(9.5, 4.1, 18, 1, true), this.wall),
      9,
      73,
      0,
      false,
    );
    dish.rotation.z = 1.12;
    this.addMesh(new Mesh(new SphereGeometry(1.1, 9, 6), this.warning), 0, 86, 0, false);
  }

  private addRefineryDistrict(): void {
    this.box(61, 0, -40, 49, 27, 34, this.wall);
    this.facadeWindows(61, -40, 49, 27, 34);
    this.box(61, 27, -40, 53, 2.1, 38, this.dark, false);
    for (const x of [-74, -55]) {
      this.cylinder(x, 0, -42, 8.2, 29, this.wall, 14);
      this.addMesh(
        new Mesh(new SphereGeometry(8.2, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), this.dark),
        x,
        29,
        -42,
        false,
      );
      this.box(x, 8, -33.7, 1.1, 9, 0.45, this.warning, false);
    }
    for (const x of [48, 67, 82]) {
      this.cylinder(x, 28, -46, 2.3, this.rng.range(24, 34), this.dark, 10);
      this.addMesh(new Mesh(new SphereGeometry(0.65, 7, 5), this.warning), x, 62, -46, false);
    }
    this.pipe(-55, 32, -42, 42, 32, -42, 1.05);
    this.pipe(42, 32, -42, 42, 14, -25, 0.8);
    for (let index = 0; index < 5; index++) this.cargoContainer(-84 + index * 14, 43, index);
  }

  private addFortressDistrict(): void {
    // A stepped citadel crown raises the existing keep into a skyline anchor.
    this.box(0, 13, 0, 44, 22, 42, this.armor);
    this.box(0, 35, 2, 31, 13, 29, this.wall);
    this.box(0, 48, 5, 22, 7, 19, this.dark);
    this.facadeWindows(0, 2, 44, 48, 42);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * 70;
        const z = sz * 54;
        this.cylinder(x, 0, z, 11, 39, this.armor, 10);
        this.box(x, 38, z, 18, 3, 18, this.dark, false);
        this.box(x, 34, z + sz * 10.5, 8, 0.55, 0.4, this.warning, false);
      }
    }
    this.box(-46, 23, 0, 48, 6, 8, this.armor);
    this.box(46, 23, 0, 48, 6, 8, this.armor);
  }

  private tieredTower(x: number, z: number, width: number, height: number, depth: number): void {
    this.box(x, 0, z, width, height * 0.55, depth, this.wall);
    this.box(x, height * 0.55, z, width * 0.78, height * 0.28, depth * 0.82, this.armor);
    this.box(x, height * 0.83, z, width * 0.55, height * 0.17, depth * 0.6, this.wall);
    this.facadeWindows(x, z, width, height, depth);
    for (const side of [-1, 1]) {
      this.box(x + side * (width * 0.5 + 1.4), 0, z, 2.8, height * 0.78, depth * 0.72, this.dark, false);
    }
  }

  private facadeWindows(x: number, z: number, width: number, height: number, depth: number): void {
    const columns = Math.max(4, Math.floor(width / 6));
    const rows = Math.max(2, Math.floor(height / 9));
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const wx = x - width * 0.43 + column * (width * 0.86 / Math.max(1, columns - 1));
        const wy = 5 + row * ((height - 8) / Math.max(1, rows));
        for (const side of [-1, 1]) {
          this.box(wx, wy, z + side * (depth * 0.5 + 0.08), 2.7, 0.85, 0.16, this.window, false);
        }
      }
    }
  }

  private hangar(x: number, z: number, width: number, height: number, depth: number): void {
    this.box(x, 0, z, width, height, depth, this.wall);
    this.box(x, 2.2, z + depth * 0.51, width * 0.72, height * 0.68, 0.7, this.dark, false);
    this.box(x, height * 0.75, z + depth * 0.54, width * 0.78, 0.7, 0.75, this.warning, false);
    for (const side of [-1, 1]) {
      this.box(x + side * width * 0.44, 0, z, 3.2, height + 3, depth + 2, this.armor, false);
    }
    for (let rib = -2; rib <= 2; rib++) {
      this.box(x + rib * width * 0.17, height, z, 1.5, 2.3, depth * 0.84, this.dark, false);
    }
  }

  private rooftopMachinery(x: number, z: number, roofY: number): void {
    for (let index = 0; index < 5; index++) {
      this.box(
        x - 11 + index * 5.5,
        roofY,
        z + this.rng.range(-7, 7),
        3.6,
        this.rng.range(2.5, 5),
        4.2,
        index % 2 === 0 ? this.dark : this.armor,
        false,
      );
    }
  }

  private pipe(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    radius: number,
  ): void {
    const direction = new Vector3(bx - ax, by - ay, bz - az);
    const length = direction.length();
    const pipe = new Mesh(new CylinderGeometry(radius, radius, length, 9), this.dark);
    pipe.position.set(
      this.bx + (ax + bx) * 0.5,
      this.ground + (ay + by) * 0.5,
      this.bz + (az + bz) * 0.5,
    );
    pipe.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
    this.host.group.add(pipe);
    this.host.registerObstacle(pipe, 0.15);
  }

  private crane(x: number, z: number, height: number): void {
    this.box(x, 0, z, 3.2, height, 3.2, this.dark, false);
    this.box(x - 8, height - 2.2, z, 19, 2.2, 2.6, this.armor, false);
    this.cylinder(x - 16.5, height - 7, z, 0.24, 10, this.warning, 6, false);
  }

  private cargoContainer(x: number, z: number, index: number): void {
    const container = this.box(x, 0.5, z, 10.5, 4.2, 4.5, index % 2 === 0 ? this.armor : this.dark);
    container.rotation.y = index % 2 === 0 ? 0 : 0.04;
    for (const stripe of [-3.5, 0, 3.5]) {
      this.box(x + stripe, 1.0, z + 2.31, 0.32, 3.1, 0.12, this.warning, false);
    }
  }

  private addGroundLaunchers(): void {
    const candidates = [[-42, 80]];
    for (const [x, z] of candidates) {
      const ground = this.host.heightAt(this.bx + x, this.bz + z);
      const position = new Vector3(this.bx + x, ground + 0.2, this.bz + z);
      this.host.groundLauncherSpawns.push({
        position,
        baseCenter: new Vector3(this.bx, this.ground, this.bz),
        leashRadius: this.halfExtent - 14,
        lookAt: new Vector3(this.bx, ground + 6, this.bz),
      });
      // Recessed maintenance marking around the mobile unit's starting bay.
      this.addMesh(
        new Mesh(new TorusGeometry(8.2, 0.32, 5, 20), this.warning),
        x,
        0.5,
        z,
        false,
      ).rotation.x = Math.PI / 2;
    }
  }
}
