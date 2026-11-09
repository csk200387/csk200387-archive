# STILL / ROOM

An unhurried, sunlit photography exhibition built with Vite, vanilla TypeScript, Three.js, GSAP, and exifr. Architectural materials and plants are procedural; no model downloads or runtime photo services are required.

## Run locally

Requires Node.js 22.12+ (also verified on Node 26).

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite. `predev` creates the photo manifest before serving. Eight bundled sample photographs are generated automatically when `public/photos/` contains no supported images.

```sh
npm run build          # Regenerate the manifest, typecheck, and build dist/
npm run preview        # Serve the production build
npm run test:pipeline  # Test the scanner using isolated temporary collections
```

## Make the collection yours

1. Place `.jpg`, `.jpeg`, `.png`, or `.webp` files in `public/photos/`. Remove the sample JPEGs and their JSON sidecars when you want only your own work.
2. Prefix filenames with numbers to curate the order, for example `01-arrival.jpg`, `02-afternoon.webp`.
3. Restart `npm run dev`, or run `npm run manifest` and reload. Production builds always rescan the folder.

The scanner reads dimensions, EXIF orientation, camera, lens, focal length, aperture, shutter, ISO, date, and the dominant RGB color. Missing EXIF is displayed as “Not recorded.” Portrait and landscape frames retain their proportions, and the corridor grows with the collection. Corrupt images and invalid sidecars fail the build with an error instead of silently omitting work.

Optional sidecars share the photo's stem (`01-arrival.json`):

```json
{
  "title": "Arrival",
  "location": "Seoul, Korea",
  "description": "The last light on the way home.",
  "exif": { "camera": "My camera" }
}
```

Sidecars override extracted fields without modifying the original photographs. `public/photos.json` is generated; edit images or sidecars instead. Original photos and their metadata are served publicly when the site is deployed.

## Explore

| Control                                    | Behavior                                           |
| ------------------------------------------ | -------------------------------------------------- |
| Scroll, ← / →, [ / ]                       | Sequential exhibition tour                         |
| Bottom arrows and stop markers             | Navigate to a work or the entrance                 |
| Click a numbered floor marker              | Move to that artwork's aisle viewpoint             |
| Click a frame, “View photograph,” or Enter | Inspect a photograph and its metadata              |
| Escape or click the surrounding room       | Return to the aisle                                |
| WASD                                       | Start free walk and move with acceleration/damping |
| Drag in free walk                          | Look around                                        |
| F or WALK button                           | Switch free walk on/off                            |
| Move the pointer                           | Subtle damped camera parallax                      |
| HI-FI 3D / 2D INDEX                        | Switch between the room and editorial grid         |

Arrow/bracket keys navigate the curated tour; WASD always walks. The 2D lightbox supports arrow keys, Escape, outside click, and native dialog focus management. Reduced-motion preferences disable drifting particles/parallax and shorten transitions.

A fresh visit on small touch devices, devices reporting limited CPU/memory, or Save Data starts in 2D. Visitors can explicitly select 3D. The mode is remembered locally; `?view=index` and `?view=3d` override it. The 3D bundle is dynamically imported only on demand. Rendering is paused entirely in 2D and when the page is hidden. WebGL creation/context failures fall back to the full index.

## Visual systems

The six modules follow `plan.md`:

- `src/scene/RoomBuilder.ts`: high-resolution canvas Carrara marble, physical clearcoat, a blurred planar reflection, plaster/AO shader, ceiling openings, and room dimensions.
- `src/scene/Atmosphere.ts`: golden directional lighting, shadows, custom light-shaft/floor-pool shaders, and animated dust.
- `src/scene/PlantBuilder.ts`: ceramic pots, curved stems and layered, veined Ficus-style leaves with soft contact shadows.
- `src/scene/FrameManager.ts`: texture loading, proportionate bronze frames, museum labels, dominant-color wall/floor bounce, and clickable floor stops.
- `src/camera/CameraDirector.ts`: GSAP spline transitions, pointer damping, inspection, free movement, collision bounds, and raycasting.
- `src/ui/HudAndStaticView.ts`: header, navigation, metadata placards, responsive editorial index, and accessible lightbox.

Ambient occlusion, light shafts, and color bounce are deliberately inexpensive shader approximations. The floor reflection is rendered at 768² with a nine-tap blur; display pixel ratio is capped at 1.75. This is a real-time WebGL scene, not an offline path-traced render.

## Git-driven updates / hosting

The included GitHub Actions workflow tests and builds every main-branch push and pull request; adding photos to Git automatically regenerates both gallery views. Any static host can serve `dist/` after `npm ci && npm run build`.

For GitHub Pages, choose **Settings → Pages → Source → GitHub Actions**, then set the repository Actions variable `DEPLOY_GITHUB_PAGES` to `true`. The next main-branch push publishes the gallery. Relative Vite asset paths support repository subpaths. No repository or live deployment has been created by this local setup.

## Sample collection

Bundled photographic masters in `scripts/sample-sources/` come from Unsplash. The generator creates cropped, gently desaturated photographic canvases in 3:2, 4:3, and 2:3 ratios and embeds simulated FUJIFILM EXIF. These sample settings and titles are illustrative, not claims about the original capture. Source links are recorded in `scripts/sample-sources/CREDITS.md` and in each photo sidecar. The masters allow empty-folder regeneration offline. Replace them with your own licensed imagery for a personal exhibition.

Visual interaction reference: [Felix Rieseberg](https://felixrieseberg.com/). No code or assets were copied from that site.
