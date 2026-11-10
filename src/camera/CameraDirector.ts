import * as THREE from "three";
import gsap from "gsap";
import type { FrameManager } from "../scene/FrameManager";
import { ARCHITECTURAL_OBSTACLES } from "../scene/RoomBuilder";

export interface CameraState {
  index: number;
  inspecting: boolean;
  roaming: boolean;
}

export const EYE_LEVEL = 1.6;

function avoidObstacles(point: THREE.Vector3) {
  point.y = EYE_LEVEL;
  const pad = 0.65;
  for (const obs of ARCHITECTURAL_OBSTACLES) {
    if (
      point.x > obs.minX - pad &&
      point.x < obs.maxX + pad &&
      point.z > obs.minZ - pad &&
      point.z < obs.maxZ + pad
    ) {
      const centerX = (obs.minX + obs.maxX) * 0.5;
      if (centerX < -0.5) {
        point.x = Math.max(point.x, obs.maxX + pad + 0.5);
      } else if (centerX > 0.5) {
        point.x = Math.min(point.x, obs.minX - pad - 0.5);
      } else {
        point.x =
          point.x >= centerX ? obs.maxX + pad + 0.4 : obs.minX - pad - 0.4;
      }
    }
  }
  point.x = THREE.MathUtils.clamp(point.x, -4.7, 4.7);
}

export class CameraDirector {
  private readonly startPosition = new THREE.Vector3(-2.15, EYE_LEVEL, 3.1);
  private readonly startTarget = new THREE.Vector3(1.85, EYE_LEVEL, -6.4);
  private basePosition = this.startPosition.clone();
  private baseTarget = this.startTarget.clone();
  private pointer = new THREE.Vector2();
  private drift = new THREE.Vector2();
  private keys = new Set<string>();
  private velocity = new THREE.Vector3();
  private tween?: gsap.core.Tween;
  private raycaster = new THREE.Raycaster();
  private enabled = true;
  private dragging = false;
  private down = new THREE.Vector2();
  private last = new THREE.Vector2();
  private dragDistance = 0;
  private yaw = 0;
  private pitch = 0;
  private wheelTotal = 0;
  private lastWheel = 0;
  private abort = new AbortController();
  state: CameraState = { index: -1, inspecting: false, roaming: false };
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private canvas: HTMLCanvasElement,
    private frames: FrameManager,
    private length: number,
    private onChange: (state: CameraState) => void,
  ) {
    const options = { signal: this.abort.signal };
    canvas.addEventListener("pointermove", this.onPointerMove, options);
    canvas.addEventListener("pointerdown", this.onPointerDown, options);
    canvas.addEventListener("pointerup", this.onPointerUp, options);
    canvas.addEventListener(
      "pointercancel",
      () => {
        this.dragging = false;
      },
      options,
    );
    canvas.addEventListener("wheel", this.onWheel, {
      ...options,
      passive: false,
    });
    window.addEventListener("keydown", this.onKeyDown, options);
    window.addEventListener(
      "keyup",
      (e) => this.keys.delete(e.key.toLowerCase()),
      options,
    );
    window.addEventListener("blur", () => this.keys.clear(), options);
    camera.position.copy(this.basePosition);
    camera.lookAt(this.baseTarget);
  }

  private notify() {
    this.onChange({ ...this.state });
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.keys.clear();
    this.velocity.set(0, 0, 0);
    this.dragging = false;
    if (enabled) this.tween?.resume();
    else this.tween?.pause();
  }

  go(index: number, inspect = false) {
    if (!this.frames.frames.length) return;
    index = THREE.MathUtils.clamp(index, -1, this.frames.frames.length - 1);
    const shouldInspect = Boolean(inspect && index >= 0);
    this.state = { index, inspecting: shouldInspect, roaming: false };
    this.keys.clear();
    this.velocity.set(0, 0, 0);

    let position = this.startPosition.clone();
    let target = this.startTarget.clone();

    if (index >= 0) {
      const frame = this.frames.frames[index];
      if (shouldInspect) {
        target = frame.center.clone();
        const fit =
          Math.max(frame.height / 2, frame.width / (2 * this.camera.aspect)) /
          Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
        const dist = Math.max(1.65, fit * 1.24);
        position = frame.center.clone().addScaledVector(frame.normal, dist);
        position.y = frame.center.y;
      } else {
        // Wide-angle gallery aisle viewpoint showing multiple artworks & room context
        position = frame.aislePosition.clone();
        target = frame.aisleTarget.clone();
      }
    }

    this.transition(position, target);
    this.notify();
  }

  step(direction: number) {
    const total = this.frames.frames.length;
    if (!total) return;
    let next: number;
    if (this.state.index < 0) {
      next = direction >= 0 ? 0 : total - 1;
    } else {
      next = (this.state.index + direction + total) % total;
    }
    this.go(next, this.state.inspecting);
  }

  exit() {
    if (this.state.inspecting && this.state.index >= 0) {
      this.go(this.state.index, false);
    } else {
      this.go(-1, false);
    }
  }

  overview() {
    this.go(-1, false);
  }

  setRoaming(roaming: boolean) {
    if (!roaming) {
      this.go(this.state.index, false);
      return;
    }
    this.tween?.kill();
    this.state.inspecting = false;
    this.state.roaming = true;
    const direction = this.baseTarget
      .clone()
      .sub(this.basePosition)
      .normalize();
    this.yaw = Math.atan2(-direction.x, -direction.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -0.99, 0.99));
    this.notify();
  }

  private transition(destination: THREE.Vector3, target: THREE.Vector3) {
    this.tween?.kill();
    const start = this.basePosition.clone();
    const startTarget = this.baseTarget.clone();
    const delta = destination.clone().sub(start);
    const firstBend = start.clone().addScaledVector(delta, 0.33);
    const secondBend = start.clone().addScaledVector(delta, 0.67);
    if (delta.length() > 2.5) {
      avoidObstacles(firstBend);
      avoidObstacles(secondBend);
    }
    const curve = new THREE.CatmullRomCurve3([
      start,
      firstBend,
      secondBend,
      destination,
    ]);
    const progress = { value: 0 };
    this.tween = gsap.to(progress, {
      value: 1,
      duration: this.reduced ? 0.01 : 1.35,
      ease: "power2.inOut",
      onUpdate: () => {
        this.basePosition.copy(curve.getPoint(progress.value));
        this.baseTarget.lerpVectors(startTarget, target, progress.value);
      },
      onComplete: () => {
        this.tween = undefined;
      },
    });
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (
      !this.enabled ||
      document.querySelector("dialog[open]") ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      (event.target instanceof HTMLElement &&
        /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))
    )
      return;
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d"].includes(key)) {
      event.preventDefault();
      if (!this.state.roaming) this.setRoaming(true);
      this.keys.add(key);
    } else if (!event.repeat) {
      if (["arrowright", "]"].includes(key)) {
        event.preventDefault();
        this.step(1);
      }
      if (["arrowleft", "["].includes(key)) {
        event.preventDefault();
        this.step(-1);
      }
      if (key === "escape") {
        event.preventDefault();
        this.exit();
      }
      if (key === "f") this.setRoaming(!this.state.roaming);
      if (
        key === "enter" &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("button, a")
        )
      )
        this.go(Math.max(0, this.state.index), true);
    }
  };

  private onWheel = (event: WheelEvent) => {
    if (!this.enabled) return;
    event.preventDefault();
    const now = performance.now();
    if (now - this.lastWheel < 850) return;
    this.wheelTotal += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
    if (Math.abs(this.wheelTotal) > 35) {
      this.step(Math.sign(this.wheelTotal));
      this.wheelTotal = 0;
      this.lastWheel = now;
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.enabled || e.button !== 0) return;
    this.down.set(e.clientX, e.clientY);
    this.last.copy(this.down);
    this.dragDistance = 0;
    this.dragging = true;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.enabled) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    if (this.dragging) {
      this.dragDistance = Math.max(
        this.dragDistance,
        this.down.distanceTo(new THREE.Vector2(e.clientX, e.clientY)),
      );
      if (!this.state.inspecting && this.dragDistance > 6) {
        if (!this.state.roaming) {
          this.setRoaming(true);
        }
        this.yaw -= (e.clientX - this.last.x) * 0.003;
        this.pitch = THREE.MathUtils.clamp(
          this.pitch - (e.clientY - this.last.y) * 0.002,
          -0.45,
          0.45,
        );
      }
      this.last.set(e.clientX, e.clientY);
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.canvas.style.cursor =
      !this.state.inspecting && this.dragging
        ? "grabbing"
        : this.raycaster.intersectObjects(this.frames.hitTargets, false).length
          ? "pointer"
          : this.state.inspecting
            ? "zoom-out"
            : "grab";
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.enabled || !this.dragging) return;
    this.dragging = false;
    if (this.canvas.hasPointerCapture(e.pointerId))
      this.canvas.releasePointerCapture(e.pointerId);
    if (this.dragDistance > 8) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.frames.hitTargets,
      false,
    )[0];
    if (hit) {
      const hitIndex = hit.object.userData.index as number;
      if (this.state.inspecting && this.state.index === hitIndex) {
        return;
      }
      this.go(hitIndex, true);
    } else if (this.state.inspecting) {
      this.exit();
    }
  };

  update(dt: number) {
    if (!this.enabled) return;
    if (this.state.roaming) {
      const forward = new THREE.Vector3(
        -Math.sin(this.yaw),
        0,
        -Math.cos(this.yaw),
      );
      const right = new THREE.Vector3(
        Math.cos(this.yaw),
        0,
        -Math.sin(this.yaw),
      );
      const movement = new THREE.Vector3();
      if (this.keys.has("w")) movement.add(forward);
      if (this.keys.has("s")) movement.sub(forward);
      if (this.keys.has("d")) movement.add(right);
      if (this.keys.has("a")) movement.sub(right);
      if (movement.lengthSq()) movement.normalize().multiplyScalar(2.8);
      this.velocity.lerp(movement, 1 - Math.exp(-dt * 7));
      this.basePosition.addScaledVector(this.velocity, dt);
      this.basePosition.y = EYE_LEVEL;
      this.basePosition.x = THREE.MathUtils.clamp(
        this.basePosition.x,
        -4.8,
        4.8,
      );
      this.basePosition.z = THREE.MathUtils.clamp(
        this.basePosition.z,
        8.6 - this.length,
        6.1,
      );

      // Resolve collisions with freestanding baffles and central marble bench
      const radius = 0.48;
      for (const obs of ARCHITECTURAL_OBSTACLES) {
        const clampedX = THREE.MathUtils.clamp(
          this.basePosition.x,
          obs.minX,
          obs.maxX,
        );
        const clampedZ = THREE.MathUtils.clamp(
          this.basePosition.z,
          obs.minZ,
          obs.maxZ,
        );
        const dx = this.basePosition.x - clampedX;
        const dz = this.basePosition.z - clampedZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq) || 0.001;
          this.basePosition.x = clampedX + (dx / dist) * radius;
          this.basePosition.z = clampedZ + (dz / dist) * radius;
        }
      }

      // Keep clearance around the ceramic planters
      for (const [x, z] of [
        [-4.6, 3.6],
        [-4.65, -5.8],
        [-4.7, 9 - this.length],
      ]) {
        const d = new THREE.Vector2(
          this.basePosition.x - x,
          this.basePosition.z - z,
        );
        if (d.length() < 0.9) {
          d.setLength(0.9);
          this.basePosition.x = x + d.x;
          this.basePosition.z = z + d.y;
        }
      }
      this.baseTarget
        .copy(this.basePosition)
        .add(
          new THREE.Vector3(
            -Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            -Math.cos(this.yaw) * Math.cos(this.pitch),
          ),
        );
    }
    this.drift.lerp(
      this.reduced || this.state.inspecting
        ? new THREE.Vector2()
        : this.pointer,
      1 - Math.exp(-dt * (this.state.inspecting ? 8 : 3)),
    );
    this.camera.position.copy(this.basePosition);
    const forward = this.baseTarget.clone().sub(this.basePosition).normalize();
    const right = new THREE.Vector3()
      .crossVectors(forward, this.camera.up)
      .normalize();
    this.camera.position.addScaledVector(right, this.drift.x * 0.035);
    this.camera.position.y += this.drift.y * 0.02;
    const target = this.baseTarget
      .clone()
      .addScaledVector(
        right,
        this.drift.x * (this.state.inspecting ? 0.04 : 0.14),
      );
    target.y += this.drift.y * 0.055;
    this.camera.lookAt(target);
  }

  resize() {
    if (this.state.inspecting) this.go(this.state.index, true);
  }

  dispose() {
    this.abort.abort();
    this.tween?.kill();
  }
}
