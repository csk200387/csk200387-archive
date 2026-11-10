import * as THREE from "three";

export class Atmosphere {
  private time = { value: 0 };
  constructor(scene: THREE.Scene, length: number) {
    scene.background = new THREE.Color("#e6e1d4");
    scene.fog = new THREE.FogExp2("#e5dfd1", 0.014);
    scene.add(new THREE.HemisphereLight("#f9f2df", "#a8a392", 2.0));
    const sun = new THREE.DirectionalLight("#ffe1a1", 3.5);
    sun.position.set(-3, 9, -1);
    sun.target.position.set(3, 0, -8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -16,
      right: 16,
      top: 20,
      bottom: -20,
      near: 0.5,
      far: 70,
    });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 5;
    scene.add(sun, sun.target);
    const shaftMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying mediump vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision mediump float;
varying mediump vec2 vUv; uniform float uTime;
      void main(){
        float edge=sin(vUv.x*3.14159265); edge*=edge;
        float fade=smoothstep(0.0,0.22,vUv.y)*(1.0-smoothstep(0.65,1.0,vUv.y));
        float bands=0.85+0.15*sin(vUv.x*48.0+uTime*0.08);
        gl_FragColor=vec4(1.0,0.85,0.53,edge*fade*bands*0.032);
      }`,
    });
    const beamGeometry = new THREE.PlaneGeometry(2.6, 7.3);
    const patchGeometry = new THREE.PlaneGeometry(4.1, 3.1);
    const patchMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying mediump vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `precision mediump float;
varying mediump vec2 vUv;void main(){vec2 p=abs(vUv-.5);float a=(1.0-smoothstep(.40,.5,p.x))*(1.0-smoothstep(.40,.5,p.y));gl_FragColor=vec4(1.,.82,.43,a*.15);}`,
    });
    for (let z = 0; z > 7 - length; z -= 4.8) {
      const beam = new THREE.Mesh(beamGeometry, shaftMaterial);
      beam.position.set(0.9, 2.8, z);
      beam.rotation.z = -0.5;
      beam.rotation.y = 0.25;
      scene.add(beam);
      // Soft quadrilateral pools of sunlight beneath each skylight.
      const patch = new THREE.Mesh(patchGeometry, patchMaterial);
      patch.rotation.set(-Math.PI / 2, 0, -0.32);
      patch.position.set(2, 0.025, z - 1);
      scene.add(patch);
    }
    const count = Math.min(1600, Math.ceil(length * 32));
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = Math.random() * 5 - 1.8;
      positions[i * 3 + 1] = Math.random() * 5.3;
      positions[i * 3 + 2] = 5 - Math.random() * length;
      phases[i] = Math.random() * 6.28;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    const dust = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { uTime: this.time },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `attribute float aPhase;uniform float uTime;varying mediump float vFade;
        void main(){ vec3 p=position; p.x+=sin(uTime*.13+aPhase)*.17;p.y+=sin(uTime*.09+aPhase)*.15;
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(13./(-mv.z),1.,2.5);vFade=.25+.25*sin(aPhase+uTime*.2); }`,
        fragmentShader: `precision mediump float;
varying mediump float vFade;void main(){float a=1.-smoothstep(.05,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(1.,.9,.7,a*vFade);}`,
      }),
    );
    // Vertex animation can move particles outside the unanimated geometry bounds.
    geometry.computeBoundingSphere();
    geometry.boundingSphere!.radius += Math.hypot(0.17, 0.15);
    scene.add(dust);
  }
  update(elapsed: number) {
    this.time.value = elapsed % (200 * Math.PI);
  }
}
