import * as THREE from "three";
import { mergeStaticGeometry } from "./StaticGeometry";
import { photoUrl, type Photo } from "../types";

export interface FrameEntry {
  index: number;
  group: THREE.Group;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  aislePosition: THREE.Vector3;
  aisleTarget: THREE.Vector3;
  side: number;
  width: number;
  height: number;
  mipBiasUniform: { value: number };
}

interface MountSlot {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  aislePosition: THREE.Vector3;
  aisleTarget: THREE.Vector3;
  side: number;
  baffle?: boolean;
}

const CURATED_SLOTS: MountSlot[] = [
  // 01: Zone 1 — Left projecting architectural bay 1
  {
    position: new THREE.Vector3(-5.56, 1.65, -1.3),
    normal: new THREE.Vector3(1, 0, 0),
    aislePosition: new THREE.Vector3(1.6, 1.6, 2.2),
    aisleTarget: new THREE.Vector3(-4.2, 1.6, -2.4),
    side: -1,
  },
  // 02: Zone 1 — Right recessed gallery wall bay 1
  {
    position: new THREE.Vector3(6.0, 1.65, -2.2),
    normal: new THREE.Vector3(-1, 0, 0),
    aislePosition: new THREE.Vector3(-1.4, 1.6, 1.2),
    aisleTarget: new THREE.Vector3(4.5, 1.6, -3.4),
    side: 1,
  },
  // 03: Zone 1 — Freestanding central Baffle 1 (front face)
  {
    position: new THREE.Vector3(-1.65, 1.65, -4.64),
    normal: new THREE.Vector3(0, 0, 1),
    aislePosition: new THREE.Vector3(1.2, 1.6, 0.8),
    aisleTarget: new THREE.Vector3(-1.1, 1.6, -5.2),
    side: -1,
    baffle: true,
  },
  // 04: Zone 1 — Right projecting architectural bay 1 (beside central marble bench)
  {
    position: new THREE.Vector3(5.56, 1.65, -7.2),
    normal: new THREE.Vector3(-1, 0, 0),
    aislePosition: new THREE.Vector3(-2.1, 1.6, -5.8),
    aisleTarget: new THREE.Vector3(4.2, 1.6, -7.8),
    side: 1,
  },
  // 05: Zone 2 — Left recessed gallery wall bay (across from central marble bench)
  {
    position: new THREE.Vector3(-6.0, 1.65, -8.8),
    normal: new THREE.Vector3(1, 0, 0),
    aislePosition: new THREE.Vector3(2.2, 1.6, -6.6),
    aisleTarget: new THREE.Vector3(-4.5, 1.6, -9.5),
    side: -1,
  },
  // 06: Zone 2 — Right recessed gallery wall bay 2
  {
    position: new THREE.Vector3(6.0, 1.65, -12.2),
    normal: new THREE.Vector3(-1, 0, 0),
    aislePosition: new THREE.Vector3(-1.8, 1.6, -10.4),
    aisleTarget: new THREE.Vector3(4.5, 1.6, -12.8),
    side: 1,
  },
  // 07: Zone 2 — Freestanding central Baffle 2 (front face)
  {
    position: new THREE.Vector3(1.65, 1.65, -13.64),
    normal: new THREE.Vector3(0, 0, 1),
    aislePosition: new THREE.Vector3(-1.1, 1.6, -8.2),
    aisleTarget: new THREE.Vector3(1.2, 1.6, -14.2),
    side: 1,
    baffle: true,
  },
  // 08: Zone 2 — Left projecting architectural bay 2
  {
    position: new THREE.Vector3(-5.56, 1.65, -14.6),
    normal: new THREE.Vector3(1, 0, 0),
    aislePosition: new THREE.Vector3(1.6, 1.6, -11.2),
    aisleTarget: new THREE.Vector3(-4.2, 1.6, -15.2),
    side: -1,
  },
  // 09: Zone 2 — Right projecting architectural bay 2
  {
    position: new THREE.Vector3(5.56, 1.65, -17.6),
    normal: new THREE.Vector3(-1, 0, 0),
    aislePosition: new THREE.Vector3(-1.9, 1.6, -15.4),
    aisleTarget: new THREE.Vector3(4.2, 1.6, -18.2),
    side: 1,
  },
  // 10: Zone 3 — Left recessed gallery wall bay 3 (beside rear marble bench)
  {
    position: new THREE.Vector3(-6.0, 1.65, -20.2),
    normal: new THREE.Vector3(1, 0, 0),
    aislePosition: new THREE.Vector3(2.1, 1.6, -18.2),
    aisleTarget: new THREE.Vector3(-4.5, 1.6, -20.8),
    side: -1,
  },
  // 11: Zone 3 — Freestanding central Baffle 3 (front face)
  {
    position: new THREE.Vector3(-1.65, 1.65, -23.24),
    normal: new THREE.Vector3(0, 0, 1),
    aislePosition: new THREE.Vector3(1.2, 1.6, -17.8),
    aisleTarget: new THREE.Vector3(-1.1, 1.6, -23.8),
    side: -1,
    baffle: true,
  },
  // 12: Zone 3 — Right recessed gallery wall bay 3
  {
    position: new THREE.Vector3(6.0, 1.65, -22.8),
    normal: new THREE.Vector3(-1, 0, 0),
    aislePosition: new THREE.Vector3(-1.6, 1.6, -20.6),
    aisleTarget: new THREE.Vector3(4.5, 1.6, -23.4),
    side: 1,
  },
  // 13: Zone 3 — Left projecting architectural bay 3
  {
    position: new THREE.Vector3(-5.56, 1.65, -26.8),
    normal: new THREE.Vector3(1, 0, 0),
    aislePosition: new THREE.Vector3(1.8, 1.6, -24.8),
    aisleTarget: new THREE.Vector3(-4.2, 1.6, -27.4),
    side: -1,
  },
  // 14: Zone 3 — Right projecting architectural bay 3
  {
    position: new THREE.Vector3(5.56, 1.65, -28.0),
    normal: new THREE.Vector3(-1, 0, 0),
    aislePosition: new THREE.Vector3(-1.8, 1.6, -25.8),
    aisleTarget: new THREE.Vector3(4.2, 1.6, -28.6),
    side: 1,
  },
  // 15: Zone 3 — Focal Back Wall Centerpiece
  {
    position: new THREE.Vector3(0.4, 1.65, -32.85),
    normal: new THREE.Vector3(0, 0, 1),
    aislePosition: new THREE.Vector3(-1.2, 1.6, -26.8),
    aisleTarget: new THREE.Vector3(0.2, 1.6, -32.9),
    side: 1,
  },
];

function slotForIndex(index: number): MountSlot {
  if (index < CURATED_SLOTS.length) return CURATED_SLOTS[index];
  const extra = index - CURATED_SLOTS.length;
  const side = extra % 2 === 0 ? -1 : 1;
  const z = -34.2 - Math.floor(extra / 2) * 4.8 - (side > 0 ? 1.4 : 0);
  return {
    position: new THREE.Vector3(side * 6.0, 1.65, z),
    normal: new THREE.Vector3(-side, 0, 0),
    aislePosition: new THREE.Vector3(-side * 1.8, 1.6, z + 3.0),
    aisleTarget: new THREE.Vector3(side * 4.2, 1.6, z - 0.6),
    side,
  };
}

const vertex =
  "varying mediump vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}";

function aura(color: THREE.Color, opacity: number, square = false) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    uniforms: {
      tint: { value: color },
      strength: { value: opacity },
    },
    vertexShader: vertex,
    fragmentShader: `precision mediump float;
varying mediump vec2 vUv;uniform vec3 tint;uniform float strength;
    void main(){ vec2 p=abs(vUv-.5);float d=${square ? "pow(pow(p.x,6.)+pow(p.y,6.),1./6.)" : "length(p)"};
    float a=1.-smoothstep(.20,.5,d);gl_FragColor=vec4(tint,a*strength); }`,
  });
}

function dropShadowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    vertexShader: vertex,
    fragmentShader: `precision mediump float;
varying mediump vec2 vUv;
    void main(){
      vec2 p = abs(vUv - 0.5);
      float sx = 1.0 - smoothstep(0.39, 0.5, p.x);
      float sy = 1.0 - smoothstep(0.39, 0.5, p.y);
      float shadow = sx * sy;
      gl_FragColor = vec4(0.11, 0.10, 0.08, shadow * 0.42);
    }`,
  });
}

function createHighAcuityTexture(
  image: HTMLImageElement,
  maxAnisotropy: number,
  maxTextureSize: number,
): THREE.Texture {
  const cap = Math.min(4096, maxTextureSize);
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  let source: TexImageSource = image;

  // Normalize oversized or odd-dimensioned source images with high-quality resampling
  // so GPU mipmap generation avoids odd-dimension box-filter phase shift.
  if (srcW > cap || srcH > cap || srcW % 2 !== 0 || srcH % 2 !== 0) {
    const scale = Math.min(1, cap / Math.max(srcW, srcH));
    const targetW = Math.max(2, Math.round((srcW * scale) / 2) * 2);
    const targetH = Math.max(2, Math.round((srcH * scale) / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, targetW, targetH);
      source = canvas;
    }
  }

  const texture = new THREE.Texture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export class FrameManager {
  readonly frames: FrameEntry[] = [];
  readonly hitTargets: THREE.Mesh[] = [];
  private readonly targets: {
    index: number;
    inverse: THREE.Matrix4;
    bounds: THREE.Box3;
    plane: boolean;
  }[] = [];
  private readonly localRay = new THREE.Ray();
  private readonly localHit = new THREE.Vector3();
  private readonly worldHit = new THREE.Vector3();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private disposed = false;
  readonly ready: Promise<void[]>;

  constructor(
    scene: THREE.Scene,
    photos: Photo[],
    maxAnisotropy = 16,
    maxTextureSize = 4096,
  ) {
    const imageLoader = new THREE.ImageLoader();
    const loading: Promise<void>[] = [];

    const microBronze = new THREE.MeshStandardMaterial({
      color: "#2a2722",
      roughness: 0.34,
      metalness: 0.78,
    });
    const recessedMountMat = new THREE.MeshStandardMaterial({
      color: "#1e1d1a",
      roughness: 0.65,
      metalness: 0.3,
    });

    const planeGeometry = new THREE.PlaneGeometry(1, 1);
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const dropShadow = dropShadowMaterial();
    const bezels = new Map<string, THREE.BufferGeometry>();
    photos.forEach((photo, index) => {
      const slot = slotForIndex(index);
      const maxWidth = slot.baffle ? 1.78 : 2.32;
      const maxHeight = slot.baffle ? 1.88 : 1.98;
      let width = Math.min(maxWidth, 1.56 * photo.aspectRatio);
      let height = width / photo.aspectRatio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * photo.aspectRatio;
      }

      const group = new THREE.Group();
      group.position.copy(slot.position);
      group.lookAt(slot.position.clone().add(slot.normal));

      // Chromatic color bleed directly onto the surrounding wall
      const dominant = new THREE.Color().setRGB(
        ...(photo.dominantColor.map((v) => v / 255) as [
          number,
          number,
          number,
        ]),
        THREE.SRGBColorSpace,
      );
      const bleed = new THREE.Mesh(planeGeometry, aura(dominant, 0.16, true));
      bleed.scale.set(width + 1.45, height + 1.45, 1);
      bleed.position.z = 0.003;
      group.add(bleed);

      // Realistic floating gallery-mount drop shadow against the wall
      const shadow = new THREE.Mesh(planeGeometry, dropShadow);
      shadow.scale.set(width + 0.16, height + 0.16, 1);
      shadow.position.set(0.008, -0.026, 0.006);
      group.add(shadow);

      // Recessed gallery sub-frame (creates the floating shadow gap behind the print)
      const subframe = new THREE.Mesh(boxGeometry, recessedMountMat);
      subframe.scale.set(width - 0.09, height - 0.09, 0.026);
      subframe.position.z = 0.015;
      subframe.castShadow = true;
      group.add(subframe);

      // Thin rigid aluminum Dibond backing plate (exact size of the print, no white mat)
      const plate = new THREE.Mesh(boxGeometry, recessedMountMat);
      plate.scale.set(width, height, 0.008);
      plate.position.z = 0.032;
      plate.castShadow = true;
      plate.receiveShadow = true;
      plate.userData = { kind: "photo", index };
      group.add(plate);
      this.hitTargets.push(plate);

      // Ultra-thin (6mm) dark bronze/anodized aluminum micro-frame bezel flush around print
      const bezelThickness = 0.006;
      const bezelDepth = 0.014;
      const bezelKey = `${width}:${height}`;
      let bezel = bezels.get(bezelKey);
      if (!bezel) {
        const rails: THREE.Mesh[] = [];
        for (const y of [-1, 1]) {
          const rail = new THREE.Mesh(boxGeometry, microBronze);
          rail.scale.set(
            width + bezelThickness * 2,
            bezelThickness,
            bezelDepth,
          );
          rail.position.set(0, y * (height / 2 + bezelThickness / 2), 0.032);
          rails.push(rail);
        }
        for (const x of [-1, 1]) {
          const rail = new THREE.Mesh(boxGeometry, microBronze);
          rails.push(rail);
          rail.scale.set(bezelThickness, height, bezelDepth);
          rail.position.set(x * (width / 2 + bezelThickness / 2), 0, 0.032);
        }

        bezel = mergeStaticGeometry(rails);
        bezels.set(bezelKey, bezel);
      }
      group.add(new THREE.Mesh(bezel, microBronze));

      // Color-accurate, fog-exempt, high-acuity photograph print material
      const mipBiasUniform = { value: -0.45 };
      const printMat = new THREE.MeshBasicMaterial({
        color: "#ddd5c2",
        toneMapped: false,
        fog: false,
      });
      printMat.onBeforeCompile = (shader) => {
        shader.uniforms.uMipBias = mipBiasUniform;
        shader.fragmentShader =
          "uniform float uMipBias;\n" +
          shader.fragmentShader.replace(
            "#include <map_fragment>",
            `#ifdef USE_MAP
              vec4 sampledDiffuseColor = texture2D( map, vMapUv, uMipBias );
              diffuseColor *= sampledDiffuseColor;
            #endif`,
          );
      };

      const print = new THREE.Mesh(planeGeometry, printMat);
      print.scale.set(width, height, 1);
      print.position.z = 0.038;
      print.userData = { kind: "photo", index };
      group.add(print);
      this.hitTargets.push(print);

      loading.push(
        imageLoader.loadAsync(photoUrl(photo)).then((image) => {
          // Pending image requests may settle after teardown or a failed load.
          if (this.disposed) return;
          const texture = createHighAcuityTexture(
            image,
            maxAnisotropy,
            maxTextureSize,
          );
          printMat.color.set("#ffffff");
          printMat.map?.dispose();
          printMat.map = texture;
          printMat.needsUpdate = true;
        }),
      );

      // Floor chromatic reflection bleed in front of the artwork
      const floorBleedPos = slot.position
        .clone()
        .addScaledVector(slot.normal, 1.15);
      const floorBleed = new THREE.Mesh(planeGeometry, aura(dominant, 0.11));
      floorBleed.scale.set(2.8, 2.8, 1);
      floorBleed.rotation.x = -Math.PI / 2;
      floorBleed.position.set(floorBleedPos.x, 0.028, floorBleedPos.z);
      scene.add(floorBleed);

      scene.add(group);
      this.frames.push({
        index,
        group,
        center: slot.position.clone().addScaledVector(slot.normal, 0.038),
        normal: slot.normal.clone(),
        aislePosition: slot.aislePosition.clone(),
        aisleTarget: slot.aisleTarget.clone(),
        side: slot.side,
        width,
        height,
        mipBiasUniform,
      });
    });

    scene.updateMatrixWorld(true);
    for (const mesh of this.hitTargets) {
      mesh.geometry.computeBoundingBox();
      const index: unknown = mesh.userData.index;
      if (typeof index !== "number")
        throw new Error("Missing photo hit target index.");
      this.targets.push({
        index,
        inverse: mesh.matrixWorld.clone().invert(),
        bounds: mesh.geometry.boundingBox!,
        plane: mesh.geometry === planeGeometry,
      });
    }
    this.ready = Promise.all(loading);
  }

  /** Exact plane/box hits for static prints, without Raycaster's hit-object allocations. */
  pick(ray: THREE.Ray): number {
    let nearest = Infinity;
    let index = -1;
    for (let i = 0; i < this.targets.length; i++) {
      const target = this.targets[i];
      this.localRay.copy(ray).applyMatrix4(target.inverse);
      if (target.plane) {
        if (
          this.localRay.direction.z >= 0 ||
          !this.localRay.intersectPlane(this.plane, this.localHit) ||
          Math.abs(this.localHit.x) > 0.5 ||
          Math.abs(this.localHit.y) > 0.5
        )
          continue;
      } else if (!this.localRay.intersectBox(target.bounds, this.localHit))
        continue;
      this.worldHit
        .copy(this.localHit)
        .applyMatrix4(this.hitTargets[i].matrixWorld);
      const distance = ray.origin.distanceToSquared(this.worldHit);
      if (distance < nearest) {
        nearest = distance;
        index = target.index;
      }
    }
    return index;
  }

  dispose() {
    this.disposed = true;
    this.targets.length = 0;
    this.hitTargets.length = 0;
    this.frames.length = 0;
  }

  setFocused(focusedIndex: number) {
    for (const frame of this.frames) {
      frame.mipBiasUniform.value = frame.index === focusedIndex ? -0.85 : -0.45;
    }
  }
}
