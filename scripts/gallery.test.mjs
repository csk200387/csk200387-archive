import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

let browser, server, base;
before(async () => {
  server = await createServer({
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  });
  await server.listen();
  base = `http://127.0.0.1:${server.httpServer.address().port}/csk200387-archive/`;
  const installedEdge =
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (existsSync(installedEdge) ? installedEdge : undefined);
  browser = await chromium.launch({ executablePath, headless: true });
});
after(async () => {
  await browser?.close();
  await server?.close();
});

async function pageFor(t, options = {}) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    ...options,
  });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /THREE|WebGL|shader/i.test(message.text())
    )
      errors.push(message.text());
  });
  t.after(async () => {
    await page.close();
    assert.deepEqual(errors, [], "No runtime or shader errors");
  });
  return page;
}
async function ready3d(page) {
  await page.waitForSelector("#viewport canvas");
  await page.waitForSelector(".loading-screen.finished", { state: "attached" });
  await page.waitForFunction(() => document.querySelector("canvas").width > 2);
}

test("desktop navigation, inspection, click-outside, drag, and index lightbox", async (t) => {
  const page = await pageFor(t);
  await page.goto(`${base}?view=3d`);
  await ready3d(page);
  await page.locator(".hud-next").click();
  await page.waitForTimeout(1800);
  await page.locator("#viewport").focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector(".placard:not([hidden])");
  assert.match(
    await page.locator(".placard-index").first().textContent(),
    /01 \/ \d+/,
  );
  await page.waitForTimeout(1800);
  // At the frame center the hit must keep inspection active.
  await page.mouse.click(720, 500);
  assert.equal(await page.locator(".placard").isVisible(), true);
  await page.locator('.placard [data-action="next"]').click();
  assert.match(
    await page.locator(".placard-index").first().textContent(),
    /02 \/ \d+/,
  );
  await page.locator('.placard [data-action="prev"]').click();
  await page.waitForTimeout(1800);
  // Blank wall stays outside both the print and its new clickable label.
  await page.mouse.click(60, 400);
  await page.waitForSelector(".placard[hidden]", { state: "attached" });
  assert.match(
    await page.locator(".hud-bottom-counter").textContent(),
    /01 \/ \d+/,
  );
  await page.locator(".hud-overview").click();
  await page.waitForTimeout(1800);
  await page.mouse.move(740, 470);
  await page.mouse.down();
  await page.mouse.move(810, 490, { steps: 10 });
  await page.mouse.up();
  assert.equal(await page.locator(".placard").isVisible(), false);
  await page.keyboard.press("w");
  await page.keyboard.press("Escape");
  await page.locator('[data-mode="index"]').click();
  assert.equal(await page.locator("#viewport").isVisible(), false);
  await page.locator('[data-photo="0"]').click();
  await page.waitForSelector("dialog[open]");
  await page.locator('.lightbox [data-action="next"]').click();
  assert.match(
    await page.locator(".lightbox .placard-index").textContent(),
    /02 \/ \d+/,
  );
  await page.keyboard.press("ArrowLeft");
  assert.match(
    await page.locator(".lightbox .placard-index").textContent(),
    /01 \/ \d+/,
  );
  await page.keyboard.press("Escape");
  await page.waitForSelector("dialog:not([open])", { state: "attached" });
  await page.locator('[data-mode="3d"]').click();
  await ready3d(page);
  await page.locator(".hud-next").click();
  await page.locator("#viewport").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(".placard").isVisible(), true);
  await page.locator(".hud-back-gallery").click();
  assert.equal(await page.locator(".hud-bottom-bar").isVisible(), true);
});

test("mobile defaults to index and retains safe-area inspection controls at DPR cap", async (t) => {
  const page = await pageFor(t, {
    viewport: { width: 390, height: 640 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(base);
  await page.waitForSelector("#index:not([hidden])");
  assert.equal(await page.locator("canvas").count(), 0);
  await page.locator('[data-mode="3d"]').click();
  await ready3d(page);
  assert.equal(
    await page.locator("canvas").evaluate((c) => c.width),
    Math.floor(390 * 1.75),
  );
  await page.locator(".hud-next").click();
  await page.locator("#viewport").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1800);
  const bounds = await page.locator(".placard").boundingBox();
  const header = await page.locator(".micro-hud").boundingBox();
  assert.ok(bounds.y >= header.y + header.height);
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  assert.ok(bounds.y + bounds.height <= 640);
  await page.locator('.placard [data-action="next"]').click();
  await page.locator('.placard [data-action="esc"]').click();
  assert.equal(await page.locator(".hud-bottom-bar").isVisible(), true);
});

test("picking matches mesh raycasting and repeated GPU release/resume does not leak or render in index", async (t) => {
  const page = await pageFor(t);
  await page.goto(`${base}?view=index`);
  await page.waitForSelector(".photo-card");
  await page.evaluate(async () => {
    const { Gallery } = await import("./src/Gallery.ts");
    const photos = await (await fetch("./photos.json")).json();
    const viewport = document.querySelector("#viewport");
    viewport.hidden = false;
    document.querySelector("#index").hidden = true;
    const g = (window.testGallery = new Gallery(
      viewport,
      photos,
      () => {},
      () => {},
    ));
    await g.ready;
    g.setActive(true);
  });
  await page.waitForTimeout(500);
  const picking = await page.evaluate(async () => {
    const { Raycaster, Vector2 } =
      await import("./node_modules/three/build/three.module.js");
    const g = window.testGallery;
    const caster = new Raycaster(),
      point = new Vector2();
    let mismatches = 0,
      rays = 0;
    for (let index = 0; index < g.frames.frames.length; index++) {
      for (const inspecting of [false, true]) {
        g.director.go(index, inspecting);
        g.director.update(0, 1.7);
        g.camera.updateMatrixWorld();
        for (let x = -1; x <= 1; x += 0.1)
          for (let y = -1; y <= 1; y += 0.1) {
            caster.setFromCamera(point.set(x, y), g.camera);
            const hit = caster.intersectObjects(g.frames.hitTargets, false)[0];
            const expected = hit ? hit.object.userData.index : -1;
            if (g.frames.pick(caster.ray) !== expected) mismatches++;
            rays++;
          }
      }
    }
    return { mismatches, rays };
  });
  assert.equal(picking.mismatches, 0, JSON.stringify(picking));
  assert.ok(picking.rays > 0);
  t.diagnostic(`${picking.rays} rays matched Three.js mesh picking`);
  const transition = await page.evaluate(async () => {
    const { ARCHITECTURAL_OBSTACLES } = await import("./src/scene/RoomBuilder.ts");
    const g = window.testGallery;
    g.renderer.setAnimationLoop(null);
    g.director.go(0);
    g.director.update(0, 0.85);
    const midpoint = g.camera.position.clone();
    g.director.setEnabled(false);
    g.director.update(0, 10);
    const paused = midpoint.equals(g.camera.position);
    g.director.setEnabled(true);
    g.director.update(0, 0.85);
    const arrived =
      g.camera.position.distanceTo(g.frames.frames[0].aislePosition) < 1e-6;
    const rightWallContinuous = g.frames.frames
      .slice(0, 6)
      .every((f, i, a) => f.normal.x === -1 && (i === 0 || f.center.z < a[i - 1].center.z));
    const backWallCenterpiece = g.frames.frames[6].normal.z === 1 && g.frames.frames[6].center.z < -30;
    const leftWallContinuous = g.frames.frames
      .slice(7, 12)
      .every((f, i, a) => f.normal.x === 1 && (i === 0 || f.center.z > a[i - 1].center.z));
    const centralBafflesSequential = g.frames.frames
      .slice(12, 15)
      .every((f, i, a) => f.normal.z === 1 && (i === 0 || f.center.z < a[i - 1].center.z));
    const aisleDistancesWithinRange = g.frames.frames.every((f) => {
      const dist = f.aislePosition.distanceTo(f.center);
      return dist >= 3.2 && dist <= 4.2;
    });
    let maxSameWallLateralDeviation = 0;
    let obstacleHits = 0;
    for (const dir of [1, -1]) {
      g.director.go(0, false);
      g.director.update(0, 1.7);
      for (let step = 0; step < g.frames.frames.length; step++) {
        const fromIdx = g.director.state.index;
        const fromPos = g.frames.frames[fromIdx].aislePosition;
        g.director.step(dir);
        const toIdx = g.director.state.index;
        const toPos = g.frames.frames[toIdx].aislePosition;
        const samePerimeterWall =
          (fromIdx <= 5 && toIdx <= 5) ||
          (fromIdx >= 7 && fromIdx <= 11 && toIdx >= 7 && toIdx <= 11);
        for (let s = 0; s < 34; s++) {
          g.director.update(0, 1.7 / 34);
          const p = g.camera.position;
          if (samePerimeterWall) {
            maxSameWallLateralDeviation = Math.max(
              maxSameWallLateralDeviation,
              Math.abs(p.x - fromPos.x),
              Math.abs(p.x - toPos.x),
            );
          }
          for (const obs of ARCHITECTURAL_OBSTACLES) {
            if (
              p.x > obs.minX - 0.35 &&
              p.x < obs.maxX + 0.35 &&
              p.z > obs.minZ - 0.35 &&
              p.z < obs.maxZ + 0.35
            ) {
              obstacleHits++;
            }
          }
        }
      }
    }
    g.visibility();
    return {
      paused,
      arrived,
      rightWallContinuous,
      backWallCenterpiece,
      leftWallContinuous,
      centralBafflesSequential,
      aisleDistancesWithinRange,
      straightCorridorGlide: maxSameWallLateralDeviation < 1e-5,
      obstacleHits,
    };
  });
  assert.deepEqual(transition, {
    paused: true,
    arrived: true,
    rightWallContinuous: true,
    backWallCenterpiece: true,
    leftWallContinuous: true,
    centralBafflesSequential: true,
    aisleDistancesWithinRange: true,
    straightCorridorGlide: true,
    obstacleHits: 0,
  });
  // Warm the same view before every resource comparison.
  await page.evaluate(() => window.testGallery.director.go(-1));
  await page.waitForTimeout(1850);
  await page.evaluate(() => {
    window.labelDisposals = 0;
    for (const label of window.testGallery.frames.hitTargets) {
      if (label.userData.kind === "wall-label")
        label.material.map.addEventListener("dispose", () => window.labelDisposals++);
    }
  });
  const activeCounts = [];
  for (let cycle = 0; cycle < 4; cycle++) {
    await page.evaluate(() => window.testGallery.setActive(false));
    const paused = await page.evaluate(() => {
      const g = window.testGallery;
      return {
        ...g.renderer.info.memory,
        frame: g.renderer.info.render.frame,
        elapsed: g.elapsed,
        transitioning: g.director.transitionElapsed,
      };
    });
    assert.equal(paused.geometries, 0);
    assert.equal(paused.textures, 0);
    assert.equal(await page.evaluate(() => window.labelDisposals), 15 * (cycle + 1));
    await page.waitForTimeout(150);
    assert.deepEqual(
      await page.evaluate(() => {
        const g = window.testGallery;
        return {
          ...g.renderer.info.memory,
          frame: g.renderer.info.render.frame,
          elapsed: g.elapsed,
          transitioning: g.director.transitionElapsed,
        };
      }),
      paused,
      "No animation or reflection work while inactive",
    );
    await page.evaluate(() => window.testGallery.setActive(true));
    await page.waitForTimeout(300);
    activeCounts.push(
      await page.evaluate(() => ({
        ...window.testGallery.renderer.info.memory,
      })),
    );
  }
  for (const counts of activeCounts) assert.deepEqual(counts, activeCounts[0]);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenFrame = await page.evaluate(
    () => window.testGallery.renderer.info.render.frame,
  );
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(() => window.testGallery.renderer.info.render.frame),
    hiddenFrame,
  );
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const culling = await page.evaluate(() => {
    let disabled = 0;
    window.testGallery.scene.traverse((o) => {
      if (o.isMesh && !o.frustumCulled) disabled++;
    });
    return disabled;
  });
  assert.equal(culling, 0);
  await page.evaluate(() => {
    window.testGallery.dispose();
    window.testGallery.dispose();
  });
  assert.equal(await page.locator("canvas").count(), 0);
});

test("landscape bronze frames clear the live placard and wall labels inspect their artwork", async (t) => {
  const page = await pageFor(t, { reducedMotion: "reduce" });
  await page.goto(`${base}?view=index`);
  await page.waitForSelector(".photo-card");
  await page.evaluate(async () => {
    const { Gallery } = await import("./src/Gallery.ts");
    const { HudAndStaticView } = await import("./src/ui/HudAndStaticView.ts");
    const photos = await (await fetch("./photos.json")).json();
    const ui = new HudAndStaticView(photos, {
      go: (index, inspect) => window.testGallery.director.go(index, inspect),
      step: (direction) => window.testGallery.director.step(direction),
      exit: () => window.testGallery.director.exit(),
      mode: () => {},
    });
    window.testUi = ui;
    window.testPhotos = photos;
    ui.setMode("3d");
    const g = window.testGallery = new Gallery(ui.viewport, photos, (state) => ui.update(state), () => {});
    await g.ready;
    g.setActive(true);
    ui.setLoading(false);
  });
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 1680, height: 1050 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => window.testGallery.camera.aspect === innerWidth / innerHeight);
    const result = await page.evaluate(async () => {
      const { Vector3 } = await import("./node_modules/three/build/three.module.js");
      const g = window.testGallery;
      g.resize();
      g.renderer.setAnimationLoop(null);
      const failures = [];
      let landscapes = 0;
      for (const frame of g.frames.frames) {
        if (frame.aspectRatio < 1.15) continue;
        landscapes++;
        g.director.go(frame.index, true);
        g.director.update(0, 1.7);
        g.camera.updateMatrixWorld();
        const corners = [];
        for (const x of [-1, 1]) for (const y of [-1, 1]) {
          const p = new Vector3(x * (frame.width / 2 + 0.006), y * (frame.height / 2 + 0.006), 0.039);
          p.applyMatrix4(frame.group.matrixWorld).project(g.camera);
          corners.push({ x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 });
        }
        const left = Math.min(...corners.map((p) => p.x));
        const right = Math.max(...corners.map((p) => p.x));
        const top = Math.min(...corners.map((p) => p.y));
        const bottom = Math.max(...corners.map((p) => p.y));
        const hud = document.querySelector(".placard").getBoundingClientRect();
        if (bottom > hud.top - 20 || top < 60 || left < 0 || right > innerWidth || (left + right) / 2 <= innerWidth / 2)
          failures.push({ index: frame.index, left, right, top, bottom, hudTop: hud.top });
      }
      return { failures, landscapes };
    });
    assert.ok(result.landscapes > 0);
    assert.deepEqual(result.failures, [], JSON.stringify({ viewport, ...result }));
  }
  // Repeat the narrowest desktop with caption, title and permalink wrapping.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => window.testGallery.camera.aspect === innerWidth / innerHeight);
  const captionClear = await page.evaluate(async () => {
    const { Vector3 } = await import("./node_modules/three/build/three.module.js");
    const g = window.testGallery;
    Object.assign(window.testPhotos[0], {
      title: "A long archive title that wraps across the museum placard",
      description: "A long caption about this landscape and the journey home. ".repeat(8),
      permalink: "https://www.instagram.com/p/TEST/",
    });
    window.testUi.placardIndex = -1;
    g.resize();
    g.director.go(0, true);
    g.director.update(0, 1.7);
    g.camera.updateMatrixWorld();
    const f = g.frames.frames[0];
    const bottom = new Vector3(0, -f.height / 2 - 0.006, 0.039).applyMatrix4(f.group.matrixWorld).project(g.camera);
    return (1 - bottom.y) * innerHeight / 2 < document.querySelector(".placard").getBoundingClientRect().top - 20;
  });
  assert.equal(captionClear, true);
  const labels = await page.evaluate(async () => {
    const { Vector3, Raycaster, Vector2 } = await import("./node_modules/three/build/three.module.js");
    const g = window.testGallery;
    const labels = g.frames.hitTargets.filter((m) => m.userData.kind === "wall-label");
    const caster = new Raycaster();
    const points = [];
    for (const label of labels) {
      g.director.go(label.userData.index, false);
      g.director.update(0, 1.7);
      g.camera.updateMatrixWorld();
      const p = label.getWorldPosition(new Vector3()).project(g.camera);
      caster.setFromCamera(new Vector2(p.x, p.y), g.camera);
      points.push({ index: label.userData.index, hit: g.frames.pick(caster.ray), visible: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 });
    }
    g.director.go(0, false);
    g.director.update(0, 1.7);
    g.camera.updateMatrixWorld();
    const p = labels[0].getWorldPosition(new Vector3()).project(g.camera);
    g.renderer.render(g.scene, g.camera);
    return {
      count: labels.length,
      geometries: new Set(labels.map((m) => m.geometry)).size,
      points,
      click: { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 },
    };
  });
  assert.equal(labels.count, 15);
  assert.equal(labels.geometries, 1);
  for (const point of labels.points) {
    assert.equal(point.hit, point.index);
    assert.equal(point.visible, true);
  }
  assert.equal(await page.locator(".placard").isVisible(), false);
  await page.mouse.click(labels.click.x, labels.click.y);
  assert.equal(await page.locator(".placard").isVisible(), true);
  assert.match(await page.locator(".placard-index").first().textContent(), /01 \/ 15/);
  await page.evaluate(() => window.testGallery.dispose());
});

test("physical plaques omit sequences and support absent, fallback and preferred captions", async (t) => {
  const page = await pageFor(t);
  await page.goto(`${base}?view=index`);
  await page.waitForSelector(".photo-card");
  const result = await page.evaluate(async () => {
    const { FrameManager } = await import("./src/scene/FrameManager.ts");
    const { releaseSceneGpu } = await import("./src/scene/SceneResources.ts");
    const { Scene } = await import("./node_modules/three/build/three.module.js");
    const photos = (await (await fetch("./photos.json")).json()).slice(0, 3);
    for (const photo of photos) {
      photo.title = "20220815_01";
      delete photo.description;
      delete photo.caption;
      photo.location = "";
    }
    photos[1].description = "  ";
    photos[1].title = "Archive № 02 — 2022-11-13";
    photos[1].caption = "Evening light";
    photos[2].description = "Quiet courtyard";
    photos[2].caption = "Unused fallback";
    const drawn = new WeakMap();
    const prototype = CanvasRenderingContext2D.prototype;
    const fillText = prototype.fillText;
    prototype.fillText = function (text, ...args) {
      const lines = drawn.get(this.canvas) || [];
      lines.push(text);
      drawn.set(this.canvas, lines);
      return fillText.call(this, text, ...args);
    };
    const scene = new Scene();
    let frames;
    try {
      frames = new FrameManager(scene, photos);
      await frames.ready;
      const labels = frames.hitTargets.filter((m) => m.userData.kind === "wall-label");
      const bodies = frames.frames.map((f, i) => f.group.getObjectByName(`wall-label-body-${i + 1}`));
      const shadows = frames.frames.map((f, i) => f.group.getObjectByName(`wall-label-shadow-${i + 1}`));
      bodies[0].geometry.computeBoundingBox();
      const bounds = bodies[0].geometry.boundingBox;
      return {
        lines: labels.map((m) => drawn.get(m.material.map.image)),
        matte: labels.every((m) => m.material.isMeshStandardMaterial && m.material.emissive.getHex() === 0 && m.material.roughness > 0.9),
        sharedBodies: new Set(bodies.map((m) => m.geometry)).size,
        thickness: bounds.max.z - bounds.min.z,
        shadowBehind: shadows.every((m, i) => m.position.z < bodies[i].position.z && bodies[i].position.z < labels[i].position.z),
      };
    } finally {
      prototype.fillText = fillText;
      releaseSceneGpu(scene);
      frames?.dispose();
      scene.clear();
    }
  });
  for (const lines of result.lines) {
    assert.equal(lines[0], "Archive");
    assert.ok(!lines.some((line) => /№|^\d+\s*\/\s*\d+$|undefined|null/.test(line)));
  }
  assert.ok(!result.lines[0].includes("Evening light"));
  assert.ok(result.lines[1].includes("Evening light"));
  assert.ok(result.lines[2].includes("Quiet courtyard"));
  assert.ok(!result.lines[2].includes("Unused fallback"));
  assert.equal(result.matte, true);
  assert.equal(result.sharedBodies, 1);
  assert.ok(Math.abs(result.thickness - 0.006) < 1e-8);
  assert.equal(result.shadowBehind, true);
});

test("late image loads cannot recreate resources after disposal", async (t) => {
  const page = await pageFor(t);
  await page.goto(`${base}?view=index`);
  await page.waitForSelector(".photo-card");
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/photos/*", async (route) => {
    await gate;
    await route.continue();
  });
  await page.evaluate(async () => {
    const { Gallery } = await import("./src/Gallery.ts");
    const photos = await (await fetch("./photos.json")).json();
    // Distinct URLs bypass images already cached by the 2D grid.
    for (const photo of photos) photo.src += "?late-load";
    const g = (window.testGallery = new Gallery(
      document.querySelector("#viewport"),
      photos,
      () => {},
      () => {},
    ));
    window.printMaterials = g.frames.hitTargets
      .filter((m) => m.userData.kind === "photo" && m.material.isMeshBasicMaterial)
      .map((m) => m.material);
    g.dispose();
  });
  release();
  const result = await page.evaluate(async () => {
    await window.testGallery.ready;
    return {
      maps: window.printMaterials.filter((m) => m.map).length,
      ...window.testGallery.renderer.info.memory,
    };
  });
  assert.deepEqual(result, { maps: 0, geometries: 0, textures: 0 });
});

test("rapid mode switches during loading and context loss recover to a usable gallery", async (t) => {
  const page = await pageFor(t);
  await page.goto(`${base}?view=index`);
  await page.waitForSelector(".photo-card");
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/src/Gallery.ts*", async (route) => {
    await gate;
    await route.continue();
  });
  await page.locator('[data-mode="3d"]').click();
  await page.locator('[data-mode="index"]').click();
  await page.locator('[data-mode="3d"]').click();
  await page.locator('[data-mode="index"]').click();
  release();
  await page.waitForSelector("#viewport canvas", { state: "attached" });
  await page.waitForTimeout(500);
  assert.equal(await page.locator("#index").isVisible(), true);
  assert.equal(await page.locator("canvas").count(), 1);
  assert.ok(await page.locator("canvas").evaluate((c) => c.width <= 2));
  await page.locator('[data-mode="3d"]').click();
  await ready3d(page);
  await page.locator("#viewport").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(".placard").isVisible(), true);
  await page.locator("canvas").evaluate((canvas) => {
    canvas
      .getContext("webgl2")
      .getExtension("WEBGL_lose_context")
      .loseContext();
  });
  await page.waitForSelector("#index:not([hidden])");
  await page.waitForSelector("#viewport canvas", { state: "detached" });
  await page.locator('[data-mode="3d"]').click();
  await ready3d(page);
  assert.equal(await page.locator(".placard").isVisible(), false);
  await page.locator(".hud-next").click();
  await page.locator("#viewport").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(".placard").isVisible(), true);
});

test("Instagram caption and https-only permalink render in the placard", async (t) => {
  const page = await pageFor(t);
  await page.route("**/photos.json", async (route) => {
    const response = await route.fetch();
    const photos = await response.json();
    Object.assign(photos[0], {
      description: "Night walk <b>home</b>",
      permalink: "https://www.instagram.com/p/TEST/",
    });
    photos[1].permalink = "javascript:alert(1)";
    await route.fulfill({ response, json: photos });
  });
  await page.goto(`${base}?view=index`);
  await page.locator('[data-photo="0"]').click();
  await page.waitForSelector("dialog[open]");
  const link = page.locator(".lightbox .placard-link");
  assert.equal(await link.getAttribute("href"), "https://www.instagram.com/p/TEST/");
  assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
  assert.equal(
    await page.locator(".lightbox .placard-caption").textContent(),
    "Night walk <b>home</b>",
  );
  await page.locator('.lightbox [data-action="next"]').click();
  assert.equal(await page.locator(".lightbox .placard-link").count(), 0);
  assert.equal(await page.locator(".lightbox .placard-caption").count(), 0);
});
