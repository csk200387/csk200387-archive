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
  await page.mouse.click(1380, 700);
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
      .filter((m) => m.material.isMeshBasicMaterial)
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
