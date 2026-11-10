import * as THREE from "three";
import { RoomBuilder } from "./scene/RoomBuilder";
import { Atmosphere } from "./scene/Atmosphere";
import { buildPlants } from "./scene/PlantBuilder";
import { FrameManager } from "./scene/FrameManager";
import { CameraDirector, type CameraState } from "./camera/CameraDirector";
import { releaseSceneGpu } from "./scene/SceneResources";
import type { Photo } from "./types";

export class Gallery {
  readonly director: CameraDirector;
  readonly ready: Promise<void[]>;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private atmosphere: Atmosphere;
  private frames: FrameManager;
  private lastTime = 0;
  private elapsed = 0;
  private active = false;
  private disposed = false;
  private gpuReleased = false;
  private abort = new AbortController();
  private resizeObserver: ResizeObserver;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  constructor(
    private viewport: HTMLElement,
    photos: Photo[],
    onChange: (state: CameraState) => void,
    onFailure: () => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.updatePixelRatio();
    this.renderer.shadowMap.enabled = true;
    // Every shadow caster and light is static. Render the map only on (re)activation.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Sunlit three-dimensional photo exhibition",
    );
    this.viewport.appendChild(this.renderer.domElement);
    const room = new RoomBuilder(this.scene, photos.length);
    this.atmosphere = new Atmosphere(this.scene, room.length);
    buildPlants(this.scene, room.length);
    this.frames = new FrameManager(
      this.scene,
      photos,
      this.renderer.capabilities.getMaxAnisotropy(),
      this.renderer.capabilities.maxTextureSize,
    );
    this.camera = new THREE.PerspectiveCamera(
      51,
      1,
      0.07,
      Math.max(120, room.length * 1.5),
    );
    this.director = new CameraDirector(
      this.camera,
      this.renderer.domElement,
      this.frames,
      room.length,
      (state) => {
        this.frames.setFocused(state.inspecting ? state.index : -1);
        onChange(state);
      },
    );
    this.scene.updateMatrixWorld(true);
    this.scene.traverse((object) => {
      object.matrixAutoUpdate = false;
      object.matrixWorldAutoUpdate = false;
      object.frustumCulled = true;
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        if (!object.geometry.boundingSphere)
          object.geometry.computeBoundingSphere();
      }
    });
    this.ready = this.frames.ready;
    this.director.setEnabled(false);
    this.resize();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.viewport);
    window.addEventListener("resize", this.resize, {
      signal: this.abort.signal,
    });
    document.addEventListener("visibilitychange", this.visibility, {
      signal: this.abort.signal,
    });
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        this.setActive(false);
        onFailure();
      },
      { signal: this.abort.signal },
    );
  }
  private updatePixelRatio() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  }
  private resize = () => {
    if (this.disposed || !this.viewport.clientWidth || !this.active) return;
    const width = this.viewport.clientWidth || innerWidth,
      height = this.viewport.clientHeight || innerHeight;
    this.updatePixelRatio();
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.director.resize();
  };
  private visibility = () => {
    const running = this.active && !document.hidden && !this.disposed;
    this.director.setEnabled(running);
    this.renderer.setAnimationLoop(running ? this.render : null);
    this.lastTime = 0;
  };
  setActive(active: boolean) {
    if (this.disposed) return;
    const changed = this.active !== active;
    this.active = active;
    if (active && changed) {
      this.gpuReleased = false;
      this.renderer.shadowMap.needsUpdate = true;
      this.resize();
    }
    this.visibility();
    if (!active) this.releaseGpu();
  }

  private releaseGpu() {
    if (this.gpuReleased) return;
    releaseSceneGpu(this.scene);
    this.renderer.renderLists.dispose();
    // Release the full-resolution default framebuffer while the canvas is hidden.
    this.renderer.setSize(1, 1, false);
    this.gpuReleased = true;
  }
  private render = (time: number) => {
    // Context loss can precede delivery of the browser's contextlost event.
    if (
      !this.active ||
      this.disposed ||
      document.hidden ||
      this.renderer.getContext().isContextLost()
    )
      return;
    const frameDt = this.lastTime ? (time - this.lastTime) / 1000 : 0.016;
    const dt = Math.min(frameDt, 0.05);
    this.lastTime = time;
    this.elapsed += dt;
    this.director.update(dt, frameDt);
    this.atmosphere.update(this.reduced ? 0 : this.elapsed);
    this.renderer.render(this.scene, this.camera);
  };
  dispose() {
    if (this.disposed) return;
    this.resizeObserver.disconnect();
    this.setActive(false);
    this.disposed = true;
    this.abort.abort();
    this.director.dispose();
    this.frames.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
