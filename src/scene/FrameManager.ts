import * as THREE from "three";
import { mergeStaticGeometry } from "./StaticGeometry";
import { photoUrl, type Photo } from "../types";
import { artworkCaption, displayTitle, formatExifLine } from "../photoMetadata";
import { roomLength } from "./RoomBuilder";

export interface FrameEntry {
  index: number;
  group: THREE.Group;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
  aspectRatio: number;
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

// Continuous museum flow:
// 1. Right Wall from entrance to back (01 -> 06)
// 2. Back Wall Centerpiece (07)
// 3. Left Wall returning from back to entrance (08 -> 12)
// 4. Central Partition Baffles from front to back (13 -> 15)
const CURATED_SLOTS: MountSlot[] = [
  // 01: Right Wall — Zone 1 recessed gallery bay
  {
    position: new THREE.Vector3(7.6, 1.65, -2.2),
    normal: new THREE.Vector3(-1, 0, 0),
    aislePosition: new THREE.Vector3(3.85, 1.6, -0.85),
    aisleTarget: new THREE.Vector3(7.6, 1.62, -2.45),
    side: 1,
  },
  // 02: Right Wall — Zone 1 projecting architectural bay (beside central marble bench)
  {
    position: new THREE.Vector3(7.16, 1.65, -7.2),
    normal: new THREE.Vector3(-1, 0, 0),
    aislePosition: new THREE.Vector3(3.85, 1.6, -5.85),
    aisleTarget: new THREE.Vector3(7.16, 1.62, -7.45),
    side: 1,
  },
  // 03: Right Wall — Zone 2 recessed gallery bay
  {
    position: new THREE.Vector3(7.6, 1.65, -12.2),
    normal: new THREE.Vector3(-1, 0, 0),
    aislePosition: new THREE.Vector3(3.85, 1.6, -10.85),
    aisleTarget: new THREE.Vector3(7.6, 1.62, -12.45),
    side: 1,
  },
  // 04: Right Wall — Zone 2 projecting architectural bay
  {
    position: new THREE.Vector3(7.16, 1.65, -17.6),
    normal: new THREE.Vector3(-1, 0, 0),
    aislePosition: new THREE.Vector3(3.85, 1.6, -16.25),
    aisleTarget: new THREE.Vector3(7.16, 1.62, -17.85),
    side: 1,
  },
  // 05: Right Wall — Zone 3 recessed gallery bay
  {
    position: new THREE.Vector3(7.6, 1.65, -22.8),
    normal: new THREE.Vector3(-1, 0, 0),
    aislePosition: new THREE.Vector3(3.85, 1.6, -21.45),
    aisleTarget: new THREE.Vector3(7.6, 1.62, -23.05),
    side: 1,
  },
  // 06: Right Wall — Zone 3 projecting architectural bay
  {
    position: new THREE.Vector3(7.16, 1.65, -28.0),
    normal: new THREE.Vector3(-1, 0, 0),
    aislePosition: new THREE.Vector3(3.85, 1.6, -26.65),
    aisleTarget: new THREE.Vector3(7.16, 1.62, -28.25),
    side: 1,
  },
  // 07: Back Wall — Focal Centerpiece
  {
    position: new THREE.Vector3(0.4, 1.65, -32.85),
    normal: new THREE.Vector3(0, 0, 1),
    aislePosition: new THREE.Vector3(0.4, 1.6, -29.1),
    aisleTarget: new THREE.Vector3(0.4, 1.62, -32.85),
    side: 1,
  },
  // 08: Left Wall — Zone 3 projecting architectural bay (returning toward entrance)
  {
    position: new THREE.Vector3(-7.16, 1.65, -26.8),
    normal: new THREE.Vector3(1, 0, 0),
    aislePosition: new THREE.Vector3(-3.85, 1.6, -25.45),
    aisleTarget: new THREE.Vector3(-7.16, 1.62, -27.05),
    side: -1,
  },
  // 09: Left Wall — Zone 3 recessed gallery bay (beside rear marble bench)
  {
    position: new THREE.Vector3(-7.6, 1.65, -20.2),
    normal: new THREE.Vector3(1, 0, 0),
    aislePosition: new THREE.Vector3(-3.85, 1.6, -18.85),
    aisleTarget: new THREE.Vector3(-7.6, 1.62, -20.45),
    side: -1,
  },
  // 10: Left Wall — Zone 2 projecting architectural bay
  {
    position: new THREE.Vector3(-7.16, 1.65, -14.6),
    normal: new THREE.Vector3(1, 0, 0),
    aislePosition: new THREE.Vector3(-3.85, 1.6, -13.25),
    aisleTarget: new THREE.Vector3(-7.16, 1.62, -14.85),
    side: -1,
  },
  // 11: Left Wall — Zone 2 recessed gallery bay (across from central marble bench)
  {
    position: new THREE.Vector3(-7.6, 1.65, -8.8),
    normal: new THREE.Vector3(1, 0, 0),
    aislePosition: new THREE.Vector3(-3.85, 1.6, -7.45),
    aisleTarget: new THREE.Vector3(-7.6, 1.62, -9.05),
    side: -1,
  },
  // 12: Left Wall — Zone 1 projecting architectural bay (near entrance)
  {
    position: new THREE.Vector3(-7.16, 1.65, -1.3),
    normal: new THREE.Vector3(1, 0, 0),
    aislePosition: new THREE.Vector3(-3.85, 1.6, 0.05),
    aisleTarget: new THREE.Vector3(-7.16, 1.62, -1.55),
    side: -1,
  },
  // 13: Central Partition — Freestanding Baffle 1 (Zone 1 front face)
  {
    position: new THREE.Vector3(-1.65, 1.65, -4.64),
    normal: new THREE.Vector3(0, 0, 1),
    aislePosition: new THREE.Vector3(-1.15, 1.6, -1.05),
    aisleTarget: new THREE.Vector3(-1.65, 1.62, -4.64),
    side: -1,
    baffle: true,
  },
  // 14: Central Partition — Freestanding Baffle 2 (Zone 2 front face)
  {
    position: new THREE.Vector3(1.65, 1.65, -13.64),
    normal: new THREE.Vector3(0, 0, 1),
    aislePosition: new THREE.Vector3(1.75, 1.6, -10.05),
    aisleTarget: new THREE.Vector3(1.65, 1.62, -13.64),
    side: 1,
    baffle: true,
  },
  // 15: Central Partition — Freestanding Baffle 3 (Zone 3 front face)
  {
    position: new THREE.Vector3(-1.65, 1.65, -23.24),
    normal: new THREE.Vector3(0, 0, 1),
    aislePosition: new THREE.Vector3(-1.85, 1.6, -19.65),
    aisleTarget: new THREE.Vector3(-1.65, 1.62, -23.24),
    side: -1,
    baffle: true,
  },
];

// Compact 8-slot U-Loop + Central Baffles sequence when count <= 8 (roomLength = 31)
const COMPACT_SLOTS: MountSlot[] = [
  CURATED_SLOTS[0], // 01: Right Wall z = -2.2
  CURATED_SLOTS[1], // 02: Right Wall z = -7.2
  CURATED_SLOTS[2], // 03: Right Wall z = -12.2
  CURATED_SLOTS[3], // 04: Right Wall z = -17.6
  CURATED_SLOTS[9], // 05: Left Wall z = -14.6
  CURATED_SLOTS[10], // 06: Left Wall z = -8.8
  CURATED_SLOTS[11], // 07: Left Wall z = -1.3
  CURATED_SLOTS[12], // 08: Central Baffle 1 z = -4.64
];

function slotForIndex(index: number, totalCount = 15): MountSlot {
  if (totalCount <= 8 && index < COMPACT_SLOTS.length) {
    return COMPACT_SLOTS[index];
  }
  if (index < CURATED_SLOTS.length) return CURATED_SLOTS[index];
  const extra = index - CURATED_SLOTS.length;
  const side = extra % 2 === 0 ? 1 : -1;
  const z = -34.2 - Math.floor(extra / 2) * 4.8 - (side > 0 ? 1.4 : 0);
  return {
    position: new THREE.Vector3(side * 7.6, 1.65, z),
    normal: new THREE.Vector3(-side, 0, 0),
    aislePosition: new THREE.Vector3(side * 3.85, 1.6, z + 1.35),
    aisleTarget: new THREE.Vector3(side * 7.6, 1.62, z - 0.25),
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

function dropShadowMaterial(wallLabel = false) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: wallLabel,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: wallLabel ? -1 : -2,
    polygonOffsetUnits: wallLabel ? -4 : 0,
    vertexShader: vertex,
    fragmentShader: `precision mediump float;
varying mediump vec2 vUv;
    void main(){
      vec2 p = abs(vUv - 0.5);
      float sx = 1.0 - smoothstep(0.39, 0.5, p.x);
      float sy = 1.0 - smoothstep(0.39, 0.5, p.y);
      float shadow = sx * sy;
      ${wallLabel ? "if (shadow < 0.001) discard;" : ""}
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

const LABEL_WIDTH = 0.36;
const LABEL_HEIGHT = 0.225;
const LABEL_GAP = 0.16;
const LABEL_DEPTH = 0.006;
const LABEL_BEVEL = 0.0007;
// Separate all depth layers, including the paper face and bronze front cap.
const LABEL_WALL_OFFSET = 0.008;
const LABEL_SHADOW_OFFSET = 0.006;
const LABEL_FACE_GAP = 0.001;

/** One shallow, chamfered bronze body shared by every plaque. */
function createLabelBodyGeometry(): THREE.ExtrudeGeometry {
  const x = LABEL_WIDTH / 2 - LABEL_BEVEL;
  const y = LABEL_HEIGHT / 2 - LABEL_BEVEL;
  const outline = new THREE.Shape();
  outline.moveTo(-x, -y);
  outline.lineTo(x, -y);
  outline.lineTo(x, y);
  outline.lineTo(-x, y);
  outline.closePath();
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: LABEL_DEPTH - 2 * LABEL_BEVEL,
    bevelEnabled: true,
    bevelThickness: LABEL_BEVEL,
    bevelSize: LABEL_BEVEL,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, LABEL_BEVEL);
  return geometry;
}

/** Typeset once at construction; canvas sources survive GPU release/resume. */
function createWallLabelTexture(
  photo: Photo,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f3efe8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#24231f";

  // Wrap at measured glyph boundaries (including CJK), never squeeze lettering.
  const drawLines = (text: string, y: number, maxLines: number, lineHeight: number) => {
    const glyphs = Array.from(text.replace(/\s+/g, " ").trim());
    let cursor = 0;
    for (let line = 0; line < maxLines && cursor < glyphs.length; line++) {
      let value = "";
      while (cursor < glyphs.length) {
        const candidate = value + glyphs[cursor];
        const suffix = line === maxLines - 1 && cursor < glyphs.length - 1 ? "…" : "";
        if (ctx.measureText(candidate + suffix).width > 456) break;
        value = candidate;
        cursor++;
      }
      if (line === maxLines - 1 && cursor < glyphs.length) value += "…";
      ctx.fillText(value.trim(), 28, y + line * lineHeight);
    }
  };
  ctx.font = "bold 36px Helvetica, Arial, sans-serif";
  drawLines(displayTitle(photo), 28, 2, 41);
  ctx.fillStyle = "#575249";
  ctx.font = "26px Helvetica, Arial, sans-serif";
  if (photo.exif.date) drawLines(photo.exif.date, 118, 1, 30);
  const caption = [artworkCaption(photo), photo.location?.trim()]
    .filter(Boolean)
    .join(" · ");
  if (caption) {
    ctx.font = "25px Helvetica, Arial, sans-serif";
    drawLines(caption, 166, 2, 30);
  }
  ctx.fillStyle = "#44423b";
  ctx.font = "23px Menlo, Consolas, monospace";
  drawLines(formatExifLine(photo), 253, 2, 26);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
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
    const labelBodyGeometry = createLabelBodyGeometry();
    // Bias every plaque layer equally so the shadow cannot cross the bronze
    // edge at oblique angles. Do not change the artwork bezel material.
    const labelBronze = microBronze.clone();
    labelBronze.depthWrite = true;
    labelBronze.depthTest = true;
    labelBronze.polygonOffset = true;
    labelBronze.polygonOffsetFactor = -1;
    labelBronze.polygonOffsetUnits = -4;
    const dropShadow = dropShadowMaterial();
    // Label shadows write depth; keep the artwork shadow material independent.
    const labelDropShadow = dropShadowMaterial(true);
    const bezels = new Map<string, THREE.BufferGeometry>();
    photos.forEach((photo, index) => {
      const slot = slotForIndex(index, photos.length);
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

      // A flush architectural label, with the same shared unit plane as prints.
      // On a narrow baffle keep the entire card on plaster below the right corner.
      const labelRight = width / 2 + bezelThickness + LABEL_GAP + LABEL_WIDTH;
      const belowFrame = Boolean(slot.baffle && labelRight > 1.25 - 0.06);
      const label = new THREE.Mesh(
        planeGeometry,
        new THREE.MeshStandardMaterial({
          map: createWallLabelTexture(photo, maxAnisotropy),
          roughness: 0.96,
          metalness: 0,
          depthWrite: true,
          depthTest: true,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -4,
        }),
      );
      label.name = `wall-label-${index + 1}`;
      label.scale.set(
        LABEL_WIDTH - 2 * LABEL_BEVEL,
        LABEL_HEIGHT - 2 * LABEL_BEVEL,
        1,
      );
      // The back-wall frame has a 4cm mounting stand-off; measure the plaque's
      // clearance from the actual wall, as with perimeter and baffle labels.
      const wallOffset = slot.normal.z === 1 && !slot.baffle
        ? 7 - roomLength(photos.length) + 0.11 - slot.position.z
        : 0;
      label.position.set(
        belowFrame
          ? width / 2 + bezelThickness - LABEL_WIDTH / 2
          : width / 2 + bezelThickness + LABEL_GAP + LABEL_WIDTH / 2,
        belowFrame
          ? -height / 2 - bezelThickness - LABEL_GAP - LABEL_HEIGHT / 2
          : -height / 2 - bezelThickness + LABEL_HEIGHT / 2,
        wallOffset + LABEL_WALL_OFFSET + LABEL_DEPTH + LABEL_FACE_GAP,
      );
      const labelBody = new THREE.Mesh(labelBodyGeometry, labelBronze);
      labelBody.name = `wall-label-body-${index + 1}`;
      labelBody.position.set(
        label.position.x, label.position.y, wallOffset + LABEL_WALL_OFFSET,
      );
      labelBody.castShadow = true;
      // The submillimetre bevel should not sample its own coarse shadow map.
      labelBody.receiveShadow = false;
      group.add(labelBody);

      // Keep the shadow clear of plaster and behind the raised plaque body.
      // Zero-alpha fragments are discarded so they cannot occlude other effects.
      const labelShadow = new THREE.Mesh(planeGeometry, labelDropShadow);
      labelShadow.name = `wall-label-shadow-${index + 1}`;
      labelShadow.scale.set(LABEL_WIDTH + 0.04, LABEL_HEIGHT + 0.04, 1);
      labelShadow.position.set(
        label.position.x + 0.002,
        label.position.y - 0.003,
        wallOffset + LABEL_SHADOW_OFFSET,
      );
      group.add(labelShadow);

      label.userData = { kind: "wall-label", index };
      group.add(label);
      this.hitTargets.push(label);
      // Keeping the texture on material.map registers it with releaseSceneGpu's
      // deduplicated texture lifecycle, including hidden / offscreen plaques.

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
        tangent: new THREE.Vector3(slot.normal.z, 0, -slot.normal.x),
        aspectRatio: photo.aspectRatio,
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
