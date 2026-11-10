Performance and architecture audit — 2026-11-10

The audit covers every source module, the stylesheet, Vite/TypeScript configuration, dependencies, and the manifest pipeline. Existing image sources, framing, lighting colors/intensities, marble texture generation, material properties, CSS, and navigation destinations are preserved.

Measurements compare commit `3b5d030` with this working tree using the same 15 photographs, a 1440 × 1000 viewport, DPR 1, and headless Microsoft Edge on this machine. Draw-call counters include the main view, reflection, and any shadow passes, with one counter reset per outer render. These are scene/bundle measurements, not a universal FPS guarantee.

| Measurement | Before | After |
| --- | ---: | ---: |
| Mesh objects in scene | 341 | 182 |
| Uploaded geometry buffers, entrance view | 325 | 27 |
| Draw calls per steady entrance frame, all passes | 641 | 335 |
| Triangles per steady entrance frame, all passes | 30,910 | 27,454 |
| Compiled programs, entrance view | 34 | 34 |
| Total production JavaScript, minified | 618.15 kB | 556.47 kB |
| Total production JavaScript, gzip | 170.36 kB | 145.29 kB |
| Maximum display DPR | 3 desktop / 2.5 coarse pointer | 1.75 |
| Reflection buffer | 768², 4× MSAA | 512², no MSAA |

CameraDirector reuses vectors, curve control points, ray state, and cached canvas bounds. Plane/box picking avoids the temporary intersections and vectors created by general mesh raycasting. The camera spline keeps the original Catmull–Rom path, 1.35-second duration, cubic power2.inOut easing, and reduced-motion behavior; it now advances in the gallery's sole animation loop. Movement retains its capped timestep while transition timing uses elapsed frame time. Removing GSAP also removes its independent ticker and production chunk. Source-level regression checks reject new objects, arrays, closures, cloning, DOMRect reads, and allocating raycaster calls in application hot paths. This does not claim that Three.js or the browser performs no internal allocation.

Plants share one pot/rim/soil/material set and two merged geometries for all stems/leaves. Frame planes, backing boxes, drop-shadow materials, and bezels of identical dimensions are shared; each bezel is one draw. Benches share a merged template and marble materials. Room boxes and seams share base geometry, and ceiling crossbeams are merged. Transparent light shafts/pools retain independent meshes for sorting while sharing geometry/materials. Walls, baffles, and photographs retain frustum culling; dust bounds include its shader displacement. Static scene transforms are frozen after construction, and the static shadow map renders only on activation.

Entering 2D stops the render loop and camera updates, disposes shared GPU resources once, releases reflection/depth targets and directional shadow maps, and shrinks the hidden canvas framebuffer. CPU image/geometry sources and camera state are intentionally retained for re-upload on return. Four suspension/resume cycles returned Three.js tracked scene geometries and textures to zero while inactive, with unchanged render counters and stable allocations after reopening. The renderer/context itself remains available until final teardown. Final disposal removes listeners/observers, clears scene references, disposes the renderer, and releases the context. Deferred image callbacks cannot attach textures after disposal. Context loss and rapid view changes during loading are covered by browser tests.

Overlay fragment shaders explicitly use mediump; vertex transforms, animated dust timing, procedural plaster grain, and projected reflection UVs retain high precision. The reflection keeps its original nine-tap blur and 0.17 opacity, with branchless overlay blending. The 2048² sun shadow and marble texture resolutions are retained. The smaller reflection target was checked against original screenshots, including a close plant view.

The HUD uses delegated placard actions, caches unchanged placard markup, reuses HTML escaping data, and preserves lightbox button focus after navigation. Unused roaming UI wiring and the redundant overview wrapper were removed; keyboard/drag roaming remains intact. All six CSS custom properties are used, so none were deleted and `style.css` is unchanged. Three.js uses statically analyzable ESM references and the existing lazy 3D import; exifr is now correctly a build-time dependency. Strict TypeScript additionally checks unused locals/parameters, missing returns, and switch fallthrough; application TypeScript contains no explicit `any`.

Verification completed:

- `npm run test:pipeline`: four scanner tests pass.
- `npm run test:gallery`: nine tests pass, including 13,230 rays matching Three.js mesh picking, desktop/390 × 640 mobile navigation, inspection/back/prev/next, click-outside, drag, 2D lightbox keys, transition pause/resume, hidden-tab suspension, culling, delayed loads, repeated GPU release, rapid mode switching, context loss, and hot-path allocation guards.
- `npm run build`: strict typecheck and production bundle pass.
- Production preview smoke: direct frame click, inspection/next/back, wheel debounce, lightbox arrows, and 2D/3D return pass without runtime or shader errors.
- Six before/after screenshot pairs: entrance, four inspection views, and a plant close-up. Dust attributes/time were fixed for comparison. Three inspection views are pixel-identical; the fourth has mean channel error 0.0026/255. Entrance and plant mean channel errors are 0.1692/255 and 0.2047/255 respectively. Local images and the capture harness are in ignored `artifacts/`.

Visual comparisons use DPR 1 to isolate scene changes. The requested DPR cap necessarily changes raster resolution on higher-DPR displays. Mobile checks use browser emulation; physical-device and other-browser performance have not been measured. Re-entering 3D must re-upload resources released by 2D, trading a short activation cost for lower idle GPU memory.
