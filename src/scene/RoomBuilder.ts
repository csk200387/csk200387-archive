import * as THREE from "three";
import { mergeStaticGeometry } from "./StaticGeometry";
import { Reflector } from "three/addons/objects/Reflector.js";

export const ROOM_WIDTH = 15.2;
export const ROOM_HEIGHT = 5.6;

export interface ArchitecturalObstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const ARCHITECTURAL_OBSTACLES: ArchitecturalObstacle[] = [
  // Freestanding Baffle 1 (Zone 1 left-center bay)
  { minX: -2.95, maxX: -0.35, minZ: -5.0, maxZ: -4.6 },
  // Central White Marble Bench 1 under skylight
  { minX: -0.3, maxX: 0.8, minZ: -10.25, maxZ: -6.95 },
  // Freestanding Baffle 2 (Zone 2 right-center bay)
  { minX: 0.35, maxX: 2.95, minZ: -14.0, maxZ: -13.6 },
  // Central White Marble Bench 2 under rear skylight
  { minX: -0.8, maxX: 0.3, minZ: -21.05, maxZ: -17.75 },
  // Freestanding Baffle 3 (Zone 3 left-center bay)
  { minX: -2.95, maxX: -0.35, minZ: -23.6, maxZ: -23.2 },
];

export function roomLength(count: number) {
  if (count <= 8) return 31;
  if (count <= 15) return 40;
  return 40 + Math.ceil((count - 15) / 2) * 4.8;
}

function marbleTextures() {
  const size = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const pixels = ctx.createImageData(size, size);
  let seed = 431;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cloud =
        Math.sin(x * 0.009 + Math.sin(y * 0.003) * 4) * Math.cos(y * 0.007) * 3;
      const n = random() * 3 + cloud;
      pixels.data[i] = 236 + n;
      pixels.data[i + 1] = 234 + n;
      pixels.data[i + 2] = 225 + n;
      pixels.data[i + 3] = 255;
    }
  ctx.putImageData(pixels, 0, 0);
  for (let i = 0; i < 42; i++) {
    let x = random() * size * 1.6 - size * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, -20);
    for (let y = 0; y <= size + 200; y += 120) {
      const next = x + (random() - 0.28) * 150;
      ctx.bezierCurveTo(
        x + random() * 70,
        y + 30,
        next - 40,
        y + 70,
        next,
        y + 120,
      );
      x = next;
    }
    ctx.strokeStyle =
      i % 5 === 0
        ? "rgba(146,126,91,.10)"
        : `rgba(99,111,112,${0.025 + random() * 0.1})`;
    ctx.lineWidth = 0.4 + random() * 2.5;
    ctx.stroke();
    ctx.lineWidth = 9 + random() * 11;
    ctx.strokeStyle = "rgba(108,117,114,.018)";
    ctx.stroke();
  }
  const color = new THREE.CanvasTexture(canvas);
  color.colorSpace = THREE.SRGBColorSpace;
  color.wrapS = color.wrapT = THREE.RepeatWrapping;
  color.repeat.set(3, 7);
  color.anisotropy = 8;
  const rough = color.clone();
  rough.colorSpace = THREE.NoColorSpace;
  rough.needsUpdate = true;
  return { color, rough };
}

// Keep the procedural plaster hash highp: mediump quantizes its fine grain.
function architecturalMaterial(length: number) {
  const material = new THREE.MeshStandardMaterial({
    color: "#efede3",
    roughness: 0.92,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.roomEnd = { value: 7 - length };
    shader.vertexShader =
      "varying vec3 vArchitecturePosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvArchitecturePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    );
    shader.fragmentShader =
      "varying vec3 vArchitecturePosition;\nuniform float roomEnd;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float floorAO = smoothstep(0.0, 1.7, vArchitecturePosition.y);
      float ceilingAO = smoothstep(0.0, 1.1, 5.6 - vArchitecturePosition.y);
      float cornerAO = smoothstep(0.0, 1.1, abs(vArchitecturePosition.z - roomEnd));
      float plaster = fract(sin(dot(vArchitecturePosition.xz + vArchitecturePosition.yy, vec2(127.1,311.7))) * 43758.5453);
      diffuseColor.rgb *= (0.81 + 0.19 * floorAO) * (0.9 + 0.1 * ceilingAO) * (0.86 + 0.14 * cornerAO);
      diffuseColor.rgb *= 0.985 + plaster * 0.025;
    `,
    );
  };
  return material;
}

export class RoomBuilder {
  readonly group = new THREE.Group();
  readonly length: number;
  readonly reflection: Reflector;
  private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  private benchTemplate?: THREE.Group;
  constructor(scene: THREE.Scene, count: number) {
    this.length = roomLength(count);
    const centerZ = 7 - this.length / 2;
    const { color, rough } = marbleTextures();
    color.repeat.y = this.length / 4.4;
    rough.repeat.copy(color.repeat);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_WIDTH, this.length),
      new THREE.MeshPhysicalMaterial({
        map: color,
        roughnessMap: rough,
        roughness: 0.29,
        metalness: 0.04,
        clearcoat: 0.6,
        clearcoatRoughness: 0.2,
        color: "#f4f1e7",
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = centerZ;
    floor.receiveShadow = true;
    this.group.add(floor);
    this.reflection = new Reflector(floor.geometry, {
      color: 0xc9c9c4,
      textureWidth: 512,
      textureHeight: 512,
      multisample: 0,
      clipBias: 0.003,
    });
    this.reflection.rotation.x = -Math.PI / 2;
    this.reflection.position.set(0, 0.012, centerZ);
    const reflectiveMaterial = this.reflection.material as THREE.ShaderMaterial;
    // Keep projected UVs high precision; lower precision can shimmer along the far floor.
    reflectiveMaterial.transparent = true;
    reflectiveMaterial.depthWrite = false;
    reflectiveMaterial.fragmentShader = reflectiveMaterial.fragmentShader
      .replace(
        "return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );",
        "return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, base));",
      )
      .replace(
        "vec4 base = texture2DProj( tDiffuse, vUv );",
        `
      vec2 uv = vUv.xy / vUv.w;
      vec4 base = vec4(0.0);
      for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
        base += texture2D(tDiffuse, uv + vec2(float(x), float(y)) * 0.0028) / 9.0;
      }
    `,
      )
      .replace(
        "gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );",
        "gl_FragColor = vec4( blendOverlay( base.rgb, color ), 0.17 );",
      );
    this.group.add(this.reflection);

    const wallMaterial = architecturalMaterial(this.length);
    const box = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material = wallMaterial,
    ) => {
      const mesh = new THREE.Mesh(this.boxGeometry, mat);
      mesh.scale.set(w, h, d);
      mesh.frustumCulled = true;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    // Perimeter enclosure walls
    box(0.2, 5.6, this.length, -7.7, 2.8, centerZ);
    box(0.2, 5.6, this.length, 7.7, 2.8, centerZ);
    box(15.6, 5.6, 0.22, 0, 2.8, 7 - this.length);
    box(15.6, 5.6, 0.22, 0, 2.8, 7.0);

    // Staggered perimeter wall alcoves / projecting architectural wall planes
    // Zone 1 bays
    box(0.44, 5.6, 4.6, -7.38, 2.8, -1.3);
    box(0.44, 5.6, 4.8, 7.38, 2.8, -7.2);
    // Zone 2 bays
    box(0.44, 5.6, 4.8, -7.38, 2.8, -14.6);
    box(0.44, 5.6, 4.6, 7.38, 2.8, -17.6);
    // Zone 3 bays (when room extends deeper)
    if (count > 8) {
      box(0.44, 5.6, 4.6, -7.38, 2.8, -26.8);
      box(0.44, 5.6, 4.6, 7.38, 2.8, -28.0);
    }

    // Freestanding central architectural partition walls (baffles)
    const plinthMat = new THREE.MeshStandardMaterial({
      color: "#2c2a24",
      roughness: 0.5,
      metalness: 0.6,
    });
    // Baffle 1 (Zone 1, z = -4.8, x = -1.65)
    box(2.44, 0.05, 0.26, -1.65, 0.025, -4.8, plinthMat);
    box(2.5, 4.0, 0.32, -1.65, 2.05, -4.8);

    // Baffle 2 (Zone 2, z = -13.8, x = 1.65)
    box(2.44, 0.05, 0.26, 1.65, 0.025, -13.8, plinthMat);
    box(2.5, 4.0, 0.32, 1.65, 2.05, -13.8);

    // Minimalist white marble bench 1 in the center under the skylight
    this.addMarbleBench(0.25, -8.6, color, rough);

    if (count > 8) {
      // Minimalist white marble bench 2 in the rear court under skylight
      this.addMarbleBench(-0.25, -19.4, color, rough);
      // Baffle 3 (Zone 3, z = -23.4, x = -1.65)
      box(2.44, 0.05, 0.26, -1.65, 0.025, -23.4, plinthMat);
      box(2.5, 4.0, 0.32, -1.65, 2.05, -23.4);
    }

    // Long ceiling openings, cross beams, and recessed skylight glazing.
    box(5.2, 0.22, this.length, -5.0, 5.6, centerZ);
    box(5.2, 0.22, this.length, 5.0, 5.6, centerZ);
    const crossBeams: THREE.Mesh[] = [];
    for (let z = 6; z > 7 - this.length; z -= 4.8)
      crossBeams.push(box(4.8, 0.3, 0.23, 0, 5.6, z));
    const beams = new THREE.Mesh(mergeStaticGeometry(crossBeams), wallMaterial);
    beams.castShadow = beams.receiveShadow = true;
    this.group.remove(...crossBeams);
    this.group.add(beams);
    const glass = new THREE.MeshBasicMaterial({
      color: "#f4e8cc",
      side: THREE.DoubleSide,
    });
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, this.length),
      glass,
    );
    sky.rotation.x = Math.PI / 2;
    sky.position.set(0, 5.82, centerZ);
    this.group.add(sky);
    const trim = new THREE.MeshStandardMaterial({
      color: "#d8d2c5",
      roughness: 0.7,
    });
    for (const side of [-1, 1]) {
      box(0.035, 0.07, this.length, side * 7.585, 0.045, centerZ, trim);
      box(0.045, 0.035, this.length, side * 2.43, 5.43, centerZ, trim);
    }
    // Fine expansion seams make the large marble slabs legible.
    const seamMat = new THREE.MeshBasicMaterial({
      color: "#a9a99e",
      transparent: true,
      opacity: 0.14,
    });
    const seamGeometry = new THREE.PlaneGeometry(1, 1);
    for (let z = 5; z > 7 - this.length; z -= 3.2) {
      const seam = new THREE.Mesh(seamGeometry, seamMat);
      seam.scale.set(ROOM_WIDTH, 0.008, 1);
      seam.rotation.x = -Math.PI / 2;
      seam.position.set(0, 0.016, z);
      this.group.add(seam);
    }
    for (const x of [-3.8, 0, 3.8]) {
      const seam = new THREE.Mesh(seamGeometry, seamMat);
      seam.rotation.x = -Math.PI / 2;
      seam.scale.set(0.008, this.length, 1);
      seam.position.set(x, 0.016, centerZ);
      this.group.add(seam);
    }
    scene.add(this.group);
  }

  private addMarbleBench(
    x: number,
    z: number,
    floorColor: THREE.CanvasTexture,
    floorRough: THREE.CanvasTexture,
  ) {
    if (this.benchTemplate) {
      const bench = this.benchTemplate.clone();
      bench.position.set(x, 0, z);
      this.group.add(bench);
      return;
    }
    const benchColor = floorColor.clone();
    benchColor.repeat.set(1.2, 2.2);
    benchColor.needsUpdate = true;
    const benchRough = floorRough.clone();
    benchRough.repeat.set(1.2, 2.2);
    benchRough.needsUpdate = true;

    const benchMat = new THREE.MeshPhysicalMaterial({
      map: benchColor,
      roughnessMap: benchRough,
      color: "#f8f6f0",
      roughness: 0.22,
      metalness: 0.02,
      clearcoat: 0.45,
      clearcoatRoughness: 0.18,
    });

    const benchGroup = new THREE.Group();
    benchGroup.position.set(x, 0, z);

    // Top monolithic marble slab
    const seat = new THREE.Mesh(this.boxGeometry, benchMat);
    seat.scale.set(1.02, 0.12, 3.15);
    seat.position.set(0, 0.42, 0);
    seat.castShadow = true;
    seat.receiveShadow = true;
    benchGroup.add(seat);
    const pieces: THREE.Mesh[] = [seat];

    // Two recessed architectural marble plinth legs
    for (const zOffset of [-1.05, 1.05]) {
      const leg = new THREE.Mesh(this.boxGeometry, benchMat);
      leg.scale.set(0.74, 0.36, 0.38);
      leg.position.set(0, 0.18, zOffset);
      leg.castShadow = true;
      leg.receiveShadow = true;
      benchGroup.add(leg);
      pieces.push(leg);
    }

    const marble = new THREE.Mesh(mergeStaticGeometry(pieces), benchMat);
    marble.castShadow = marble.receiveShadow = true;
    benchGroup.clear();
    benchGroup.add(marble);

    // Soft ambient contact shadow beneath the bench
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.65, 3.8),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader:
          "varying mediump vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader:
          "precision mediump float;varying mediump vec2 vUv;void main(){vec2 p=abs(vUv-.5);float a=(1.-smoothstep(.22,.5,p.x))*(1.-smoothstep(.3,.5,p.y));gl_FragColor=vec4(.16,.15,.12,a*.28);}",
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.018;
    benchGroup.add(shadow);

    this.benchTemplate = benchGroup;
    this.group.add(benchGroup);
  }
}
