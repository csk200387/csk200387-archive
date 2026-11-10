import * as THREE from "three";
import { RoomBuilder } from "./scene/RoomBuilder";
import { Atmosphere } from "./scene/Atmosphere";
import { buildPlant } from "./scene/PlantBuilder";
import { FrameManager } from "./scene/FrameManager";
import { CameraDirector, type CameraState } from "./camera/CameraDirector";
import type { Photo } from "./types";

export class Gallery {
  readonly director: CameraDirector;
  readonly ready: Promise<unknown>;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private atmosphere: Atmosphere;
  private frames: FrameManager;
  private lastTime = 0;
  private elapsed = 0;
  private active = false;
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
    buildPlant(this.scene, -4.6, 3.6, 1.1);
    buildPlant(this.scene, -4.65, -5.8, 1.15);
    buildPlant(this.scene, -4.7, 9 - room.length, 1.25);
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
    this.ready = this.frames.ready;
    this.resize();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.viewport);
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.visibility);
    this.renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.setActive(false);
      onFailure();
    });
  }
  private updatePixelRatio() {
    const coarse = matchMedia("(pointer: coarse)").matches;
    const maxDpr = coarse ? 2.5 : 3;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  }
  private resize = () => {
    if (!this.viewport.clientWidth) return;
    const width = this.viewport.clientWidth || innerWidth,
      height = this.viewport.clientHeight || innerHeight;
    this.updatePixelRatio();
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.director.resize();
  };
  private visibility = () => {
    this.renderer.setAnimationLoop(
      this.active && !document.hidden ? this.render : null,
    );
    this.lastTime = 0;
  };
  setActive(active: boolean) {
    this.active = active;
    this.director.setEnabled(active);
    if (active) this.resize();
    this.visibility();
  }
  private render = (time: number) => {
    const dt = Math.min(
      this.lastTime ? (time - this.lastTime) / 1000 : 0.016,
      0.05,
    );
    this.lastTime = time;
    this.elapsed += dt;
    this.director.update(dt);
    this.atmosphere.update(this.reduced ? 0 : this.elapsed);
    this.renderer.render(this.scene, this.camera);
  };
  dispose() {
    this.resizeObserver.disconnect();
    this.setActive(false);
    this.director.dispose();
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.visibility);
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
