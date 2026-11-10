import * as THREE from "three";
import { mergeStaticGeometry } from "./StaticGeometry";

function leafGeometry(length: number, width: number) {
  const vertices: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14,
      w = Math.pow(Math.sin(t * Math.PI), 0.8) * width;
    for (let j = 0; j <= 8; j++) {
      const s = (j / 8) * 2 - 1;
      vertices.push(
        s * w,
        t * length,
        Math.sin(t * Math.PI) * length * 0.22 + s * s * width * 0.25,
      );
      uvs.push(j / 8, t);
      if (i < 14 && j < 8) {
        const a = i * 9 + j;
        indices.push(a, a + 1, a + 9, a + 1, a + 10, a + 9);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function foliageMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: "#526444",
    roughness: 0.55,
    side: THREE.DoubleSide,
    clearcoat: 0.18,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = "varying vec2 vLeafUv;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      "#include <uv_vertex>\nvLeafUv=uv;",
    );
    shader.fragmentShader = "varying vec2 vLeafUv;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float vein=1.-smoothstep(.005,.018,abs(vLeafUv.x-.5));
      float ribs=pow(.5+.5*sin(vLeafUv.y*85.+abs(vLeafUv.x-.5)*28.),15.);
      diffuseColor.rgb*=.75+.3*vLeafUv.y+vein*.25+ribs*.07;
    `,
    );
  };
  return m;
}
function plantTemplate() {
  const group = new THREE.Group();
  const potMat = new THREE.MeshStandardMaterial({
    color: "#cbc6b8",
    roughness: 0.94,
  });
  potMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      diffuseColor.rgb *= .94 + .06 * fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);`,
    );
  };
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.43, 0.33, 0.71, 48),
    potMat,
  );
  pot.position.y = 0.36;
  pot.castShadow = true;
  pot.receiveShadow = true;
  group.add(pot);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.415, 0.026, 10, 48),
    potMat,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.71;
  group.add(rim);
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(0.39, 40),
    new THREE.MeshStandardMaterial({ color: "#3e3627", roughness: 1 }),
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.7;
  group.add(soil);
  const leafMat = foliageMaterial();
  const stemMat = new THREE.MeshStandardMaterial({
    color: "#65664b",
    roughness: 0.9,
  });
  const stems: THREE.Mesh[] = [];
  const leaves: THREE.Mesh[] = [];
  for (let i = 0; i < 18; i++) {
    const angle = i * 2.39996,
      height = 0.85 + (i % 6) * 0.19;
    const extent = 0.22 + (i % 4) * 0.12;
    const end = new THREE.Vector3(
      Math.cos(angle) * extent,
      height,
      Math.sin(angle) * extent,
    );
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.69, 0),
      new THREE.Vector3(end.x * 0.25, height, end.z * 0.25),
      end,
    );
    const stem = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 8, 0.011, 5, false),
      stemMat,
    );
    stem.castShadow = true;
    stems.push(stem);
    const leaf = new THREE.Mesh(
      leafGeometry(0.48 + (i % 3) * 0.12, 0.16 + (i % 4) * 0.018),
      leafMat,
    );
    leaf.position.copy(end);
    leaf.rotation.set(0.65 + (i % 4) * 0.2, angle, -0.35);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    leaves.push(leaf);
  }
  const stemsMesh = new THREE.Mesh(mergeStaticGeometry(stems), stemMat);
  stemsMesh.castShadow = true;
  const leavesMesh = new THREE.Mesh(mergeStaticGeometry(leaves), leafMat);
  leavesMesh.castShadow = leavesMesh.receiveShadow = true;
  group.add(stemsMesh, leavesMesh);
  for (const mesh of [...stems, ...leaves]) mesh.geometry.dispose();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader:
        "varying mediump vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "precision mediump float;varying mediump vec2 vUv;void main(){float a=exp(-dot(vUv-.5,vUv-.5)*20.)*.23;gl_FragColor=vec4(.18,.18,.12,a);}",
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.035;
  group.add(shadow);
  return group;
}

/** One set of pot, stem and foliage resources per gallery, shared by all plants. */
export function buildPlants(scene: THREE.Scene, roomLength: number) {
  const template = plantTemplate();
  const placements = [
    [-4.6, 3.6, 1.1],
    [-4.65, -5.8, 1.15],
    [-4.7, 9 - roomLength, 1.25],
  ];
  for (const [x, z, scale] of placements) {
    const plant = template.clone();
    plant.position.set(x, 0, z);
    plant.scale.setScalar(scale);
    scene.add(plant);
  }
}
