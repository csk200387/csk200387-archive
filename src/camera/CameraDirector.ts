import * as THREE from "three";
import type { FrameManager } from "../scene/FrameManager";
import { ARCHITECTURAL_OBSTACLES } from "../scene/RoomBuilder";

export interface CameraState {
  index: number;
  inspecting: boolean;
  roaming: boolean;
}

export const EYE_LEVEL = 1.6;
export const TRANSITION_DURATION = 1.7;

function evalPiecewiseX(
  start: THREE.Vector3,
  firstBend: THREE.Vector3,
  secondBend: THREE.Vector3,
  end: THREE.Vector3,
  t: number,
) {
  if (t <= 0.3333) return start.x + (firstBend.x - start.x) * (t / 0.3333);
  if (t <= 0.6667)
    return firstBend.x + (secondBend.x - firstBend.x) * ((t - 0.3333) / 0.3334);
  return secondBend.x + (end.x - secondBend.x) * ((t - 0.6667) / 0.3333);
}

function avoidObstacles(point: THREE.Vector3) {
  point.y = EYE_LEVEL;
  const pad = 0.6;
  for (let i = 0; i < ARCHITECTURAL_OBSTACLES.length; i++) {
    const obs = ARCHITECTURAL_OBSTACLES[i];
    if (
      point.x > obs.minX - pad &&
      point.x < obs.maxX + pad &&
      point.z > obs.minZ - pad &&
      point.z < obs.maxZ + pad
    ) {
      const centerX = (obs.minX + obs.maxX) * 0.5;
      point.x =
        point.x >= centerX ? obs.maxX + pad + 0.45 : obs.minX - pad - 0.45;
    }
  }
  point.x = THREE.MathUtils.clamp(point.x, -6.3, 6.3);
}

function deflectAroundObstacles(
  start: THREE.Vector3,
  end: THREE.Vector3,
  firstBend: THREE.Vector3,
  secondBend: THREE.Vector3,
) {
  // Same-side perimeter corridor lanes (|x| >= 3.5) are 100% outside all central
  // obstacles; keep their control points collinear for a zero-detour straight glide.
  if (
    (start.x >= 3.5 && end.x >= 3.5) ||
    (start.x <= -3.5 && end.x <= -3.5)
  ) {
    return;
  }
  const pad = 0.6;
  const dz = end.z - start.z;
  if (Math.abs(dz) > 15) {
    if (dz > 0) {
      firstBend.set(-1.65, EYE_LEVEL, -6.5);
      secondBend.set(1.25, EYE_LEVEL, -5.6);
    } else {
      firstBend.set(1.25, EYE_LEVEL, -5.6);
      secondBend.set(-1.65, EYE_LEVEL, -6.5);
    }
    return;
  }
  avoidObstacles(firstBend);
  avoidObstacles(secondBend);
  if (Math.abs(dz) < 0.001) return;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < ARCHITECTURAL_OBSTACLES.length; i++) {
      const obs = ARCHITECTURAL_OBSTACLES[i];
      const centerX = (obs.minX + obs.maxX) * 0.5;
      for (let k = 0; k <= 2; k++) {
        const zSample =
          obs.minZ - pad * 0.4 + (obs.maxZ - obs.minZ + pad * 0.8) * (k * 0.5);
        const t = (zSample - start.z) / dz;
        if (t <= 0.04 || t >= 0.96) continue;
        const xAtObs = evalPiecewiseX(start, firstBend, secondBend, end, t);
        if (xAtObs > obs.minX - pad && xAtObs < obs.maxX + pad) {
          const goRight = xAtObs >= centerX;
          const need = goRight
            ? obs.maxX + pad + 0.45 - xAtObs
            : obs.minX - pad - 0.45 - xAtObs;
          const bend = t < 0.5 ? firstBend : secondBend;
          bend.x = THREE.MathUtils.clamp(bend.x + need * 1.45, -6.3, 6.3);
        }
      }
    }
  }
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
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly movement = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly zeroPointer = new THREE.Vector2();
  private readonly curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  private readonly transitionTarget = new THREE.Vector3();
  private readonly transitionStartTarget = new THREE.Vector3();
  private transitionElapsed = 0;
  private transitioning = false;
  private readonly planterPositions: readonly (readonly [number, number])[];
  private canvasLeft = 0;
  private canvasTop = 0;
  private canvasWidth = 1;
  private canvasHeight = 1;
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
    this.planterPositions = [
      [-6.2, 3.6],
      [-6.25, -5.8],
      [-6.3, 9 - length],
    ];
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
    this.onChange(this.state);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.keys.clear();
    this.velocity.set(0, 0, 0);
    this.dragging = false;
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
        const vw = this.canvas.clientWidth || window.innerWidth || 1024;
        const vh = this.canvas.clientHeight || window.innerHeight || 768;
        const halfFovTan = Math.tan(
          THREE.MathUtils.degToRad(this.camera.fov / 2),
        );
        if (vw <= 680 || vh <= 700) {
          const topOccupied = vw <= 680 ? 114 : 64;
          const bottomOccupied = vw <= 680 ? (vh <= 640 ? 132 : 158) : 180;
          const availVert = Math.max(
            0.42,
            (vh - topOccupied - bottomOccupied) / vh,
          );
          const availHoriz = Math.max(0.78, (vw - 32) / vw);
          const distV = frame.height / 2 / (halfFovTan * availVert * 0.88);
          const distH =
            frame.width /
            (2 * this.camera.aspect) /
            (halfFovTan * availHoriz * 0.88);
          const dist = Math.max(1.65, distV, distH);
          const visibleHeight = 2 * dist * halfFovTan;
          const yShift =
            -((bottomOccupied - topOccupied) / (2 * vh)) * visibleHeight;
          position = frame.center.clone().addScaledVector(frame.normal, dist);
          position.y = frame.center.y + yShift;
          target.y = frame.center.y + yShift;
        } else {
          const fit =
            Math.max(frame.height / 2, frame.width / (2 * this.camera.aspect)) /
            halfFovTan;
          const dist = Math.max(1.65, fit * 1.24);
          position = frame.center.clone().addScaledVector(frame.normal, dist);
          position.y = frame.center.y;
        }
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

  setRoaming(roaming: boolean) {
    if (!roaming) {
      this.go(this.state.index, false);
      return;
    }
    this.transitioning = false;
    this.state.inspecting = false;
    this.state.roaming = true;
    const direction = this.forward
      .copy(this.baseTarget)
      .sub(this.basePosition)
      .normalize();
    this.yaw = Math.atan2(-direction.x, -direction.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -0.99, 0.99));
    this.notify();
  }

  private transition(destination: THREE.Vector3, target: THREE.Vector3) {
    this.transitioning = false;
    const [start, firstBend, secondBend, end] = this.curve.points;
    start.copy(this.basePosition);
    end.copy(destination);
    this.transitionStartTarget.copy(this.baseTarget);
    this.transitionTarget.copy(target);
    const delta = this.movement.subVectors(destination, start);
    firstBend.copy(start).addScaledVector(delta, 0.33);
    secondBend.copy(start).addScaledVector(delta, 0.67);
    if (delta.length() > 1.2) {
      deflectAroundObstacles(start, end, firstBend, secondBend);
    }
    this.transitionElapsed = 0;
    this.transitioning = true;
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
    this.pointer.set(
      ((e.clientX - this.canvasLeft) / this.canvasWidth) * 2 - 1,
      (-(e.clientY - this.canvasTop) / this.canvasHeight) * 2 + 1,
    );
    if (this.dragging) {
      this.dragDistance = Math.max(
        this.dragDistance,
        Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y),
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
        : this.frames.pick(this.raycaster.ray) >= 0
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
    this.pointer.set(
      ((e.clientX - this.canvasLeft) / this.canvasWidth) * 2 - 1,
      (-(e.clientY - this.canvasTop) / this.canvasHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hitIndex = this.frames.pick(this.raycaster.ray);
    if (hitIndex >= 0) {
      if (this.state.inspecting && this.state.index === hitIndex) {
        return;
      }
      this.go(hitIndex, true);
    } else if (this.state.inspecting) {
      this.exit();
    }
  };

  update(dt: number, transitionDt = dt) {
    if (!this.enabled) return;
    if (this.transitioning) {
      this.transitionElapsed += transitionDt;
      const progress = Math.min(
        1,
        this.transitionElapsed / (this.reduced ? 0.01 : TRANSITION_DURATION),
      );
      // Cubic in-out easing across the 20%-slower (1.70s) spline transition.
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      this.curve.getPoint(eased, this.basePosition);
      this.baseTarget.lerpVectors(
        this.transitionStartTarget,
        this.transitionTarget,
        eased,
      );
      if (progress === 1) this.transitioning = false;
    }
    if (this.state.roaming) {
      const forward = this.forward.set(
        -Math.sin(this.yaw),
        0,
        -Math.cos(this.yaw),
      );
      const right = this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const movement = this.movement.set(0, 0, 0);
      if (this.keys.has("w")) movement.add(forward);
      if (this.keys.has("s")) movement.sub(forward);
      if (this.keys.has("d")) movement.add(right);
      if (this.keys.has("a")) movement.sub(right);
      if (movement.lengthSq()) movement.normalize().multiplyScalar(2.24);
      this.velocity.lerp(movement, 1 - Math.exp(-dt * 5.6));
      this.basePosition.addScaledVector(this.velocity, dt);
      this.basePosition.y = EYE_LEVEL;
      this.basePosition.x = THREE.MathUtils.clamp(
        this.basePosition.x,
        -6.4,
        6.4,
      );
      this.basePosition.z = THREE.MathUtils.clamp(
        this.basePosition.z,
        8.6 - this.length,
        6.1,
      );

      // Resolve collisions with freestanding baffles and central marble bench
      const radius = 0.48;
      for (let i = 0; i < ARCHITECTURAL_OBSTACLES.length; i++) {
        const obs = ARCHITECTURAL_OBSTACLES[i];
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
      for (let i = 0; i < this.planterPositions.length; i++) {
        const planter = this.planterPositions[i];
        const dx = this.basePosition.x - planter[0];
        const dz = this.basePosition.z - planter[1];
        const distance = Math.hypot(dx, dz);
        if (distance > 0 && distance < 0.9) {
          this.basePosition.x = planter[0] + (dx * 0.9) / distance;
          this.basePosition.z = planter[1] + (dz * 0.9) / distance;
        }
      }
      this.baseTarget
        .copy(this.basePosition)
        .add(
          this.lookTarget.set(
            -Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            -Math.cos(this.yaw) * Math.cos(this.pitch),
          ),
        );
    }
    this.drift.lerp(
      this.reduced || this.state.inspecting ? this.zeroPointer : this.pointer,
      1 - Math.exp(-dt * (this.state.inspecting ? 8 : 3)),
    );
    this.camera.position.copy(this.basePosition);
    const forward = this.forward
      .copy(this.baseTarget)
      .sub(this.basePosition)
      .normalize();
    const right = this.right.crossVectors(forward, this.camera.up).normalize();
    this.camera.position.addScaledVector(right, this.drift.x * 0.035);
    this.camera.position.y += this.drift.y * 0.02;
    const target = this.lookTarget
      .copy(this.baseTarget)
      .addScaledVector(
        right,
        this.drift.x * (this.state.inspecting ? 0.04 : 0.14),
      );
    target.y += this.drift.y * 0.055;
    this.camera.lookAt(target);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvasLeft = rect.left;
    this.canvasTop = rect.top;
    this.canvasWidth = rect.width || 1;
    this.canvasHeight = rect.height || 1;
    if (this.state.inspecting) this.go(this.state.index, true);
  }

  dispose() {
    this.abort.abort();
    this.transitioning = false;
  }
}
