# CSK200387 / ARCHIVE

**Live Exhibition:** [https://csk200387.github.io/csk200387-archive/](https://csk200387.github.io/csk200387-archive/)

[English](#english) · [한국어](#한국어)

---

## English

An architectural 3D photography exhibition and editorial 2D archive built with Vite, vanilla TypeScript, Three.js, and a build-time `exifr` + `sharp` manifest scanner. Architectural surfaces, daylighting, and botanical elements are generated procedurally at runtime with zero external 3D model downloads.

### Run Locally

Requires Node.js 22.12+ (also verified on Node 26).

```sh
npm install
npm run dev
```

Open the Local or Network URL printed by Vite (`--host 0.0.0.0` is enabled for LAN testing). `predev` automatically scans `public/photos/` and generates `public/photos.json` before serving.

```sh
npm run build          # Regenerate manifest, typecheck, and bundle dist/
npm run preview        # Serve the production build locally and on LAN
npm run test:pipeline  # Test the photo/EXIF manifest scanner in isolated temp folders
npm run test:gallery   # Browser navigation, lifecycle, picking, and zero-allocation checks
```

The browser test suite uses Playwright Chromium (`npx playwright install chromium`) or an installed Chromium/Edge binary (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`). It verifies desktop and mobile navigation, analytical picking parity, mode-switch races, WebGL context-loss recovery, deferred texture loads, and GPU resource disposal.

### Curating Photographs

1. Place `.jpg`, `.jpeg`, `.png`, or `.webp` files in `public/photos/`.
2. Prefix filenames or use timestamps to control exhibition ordering.
3. Run `npm run manifest` (or restart `npm run dev` / `npm run build`) to rescan the collection.

The build-time scanner extracts image dimensions, EXIF orientation, camera body, lens, focal length, aperture, shutter speed, ISO, capture date, and dominant RGB color. Portrait and landscape works retain their true aspect ratios in both the 3D gallery and the 2D editorial index.

Optional JSON sidecars sharing the photo's filename stem (e.g., `20250920_161310.json`) can override any metadata field without modifying the source image:

```json
{
  "title": "Late Afternoon Study",
  "location": "Seoul, Korea",
  "description": "Sunlight across the concrete wall.",
  "exif": { "camera": "Custom Camera Name" }
}
```

### Controls & Navigation

| Control                                   | Behavior                                               |
| ----------------------------------------- | ------------------------------------------------------ |
| Scroll, `←` / `→`, `[` / `]`              | Step sequentially through the exhibition               |
| Bottom control bar (`← PREV · NEXT →`)    | Step between works or return to `[ OVERVIEW ]`         |
| Click / tap a framed photograph           | Smoothly transition into orthogonal close-up inspection|
| `Escape`, click outside frame, or `BACK`  | Exit close-up inspection back to the gallery aisle     |
| `WASD` or drag in aisle view              | Free-roam walk and look around the architectural space |
| `HI-FI 3D` / `2D INDEX`                   | Switch between the 3D exhibition and 2D editorial grid |

- **Mobile-First 2D Index:** Visitors on mobile/touch viewports start in the fast, scrollable `2D INDEX` by default and can enter the 3D gallery anytime via `[ ENTER 3D GALLERY ↗ ]` or `[ HI-FI 3D ]`.
- **Pixel-Perfect 3D Photographs:** Source images are uploaded at full resolution in `SRGBColorSpace` with anisotropic trilinear mipmap filtering, tone-mapping bypass on photo planes, and orthogonal camera alignment during inspection.

### Architecture & Performance Systems

- `src/scene/RoomBuilder.ts`: Procedural Carrara marble floor, blurred planar reflection (`512²`), plaster/AO shaders, freestanding architectural baffles, skylights, and central bench.
- `src/scene/Atmosphere.ts`: Directional sunlight, static shadow map baking, volumetric light shafts, and subtle dust particles.
- `src/scene/PlantBuilder.ts`: Merged procedural ceramic planters and layered Ficus foliage.
- `src/scene/FrameManager.ts`: Merged frame bezels, analytical hit-testing, dominant-color wall/floor bounce, and progressive high-resolution texture upgrading during inspection.
- `src/camera/CameraDirector.ts`: Zero-allocation Catmull-Rom spline camera transitions, obstacle avoidance, safe-area-aware mobile framing, and free-roam physics.
- `src/ui/HudAndStaticView.ts`: Floating monospace micro-HUD, museum wall placard, responsive 2D index grid, and accessible `<dialog>` lightbox.

See [PERFORMANCE.md](PERFORMANCE.md) for detailed rendering pipeline benchmarks, draw-call merging (`641 → 335`), and GPU lifecycle verification.

---

## 한국어

**CSK200387 / ARCHIVE**는 Vite, Vanilla TypeScript, Three.js, 그리고 빌드 타임 `exifr` + `sharp` 매니페스트 스캐너로 구축된 **인터랙티브 3D 사진 전시관 및 2D 에디토리얼 아카이브**입니다. 외부 3D 모델 다운로드 없이 대리석 바닥, 채광창, 건축 파티션, 식물 오브제 등 모든 공간 요소와 셰이더를 절차적(Procedural)으로 생성합니다.

- **라이브 전시 링크:** [https://csk200387.github.io/csk200387-archive/](https://csk200387.github.io/csk200387-archive/)

### 주요 특징

- **3D 갤러리 & 모바일 퍼스트 2D 인덱스:**
  - 데스크톱에서는 자연광이 들어오는 3D 건축 공간(`HI-FI 3D`)으로 시작하며, 모바일 기기에서는 빠르고 쾌적한 탐색을 위해 `2D INDEX` 그리드 뷰로 기본 진입합니다.
  - 상단 모드 스위치(`[ HI-FI 3D ] / 2D INDEX`) 또는 `[ ENTER 3D GALLERY ↗ ]` 버튼을 통해 언제든 3D 전시관과 2D 인덱스를 자유롭게 오갈 수 있습니다.
- **원본 해상도 기반의 선명한 3D 사진 렌더링:**
  - `SRGBColorSpace` 원본 텍스처 업로드, 비등방성(Anisotropic) 필터링, 사진 메쉬 전용 톤매핑 우회(`toneMapped: false`), 그리고 작품 감상 시 카메라 수직 정렬(Orthogonal Alignment)을 통해 사진의 원래 비율과 색감, 디테일을 왜곡 없이 재현합니다.
- **자동 EXIF 메타데이터 추출:**
  - `public/photos/` 폴더에 사진을 넣으면 빌드 시점에 해상도, 화면 비율, 촬영 기기, 렌즈, 초점 거리, 조리개, 셔터 스피드, ISO, 촬영일 및 대표 색상(Dominant RGB)을 자동으로 추출하여 전시장 명패(Placard)와 2D 인덱스에 표시합니다.
- **렌더링 파이프라인 및 메모리 최적화:**
  - 정적 지오메트리 병합(드로우 콜 `641 → 335` 감소), 프레임당 메모리 할당 제거(Zero-Allocation Render Loop), 2D 모드 전환 시 WebGL GPU 리소스 완전 해제 및 복원 등 최적화가 적용되어 있습니다. 자세한 내용은 [PERFORMANCE.md](PERFORMANCE.md)를 참고하세요.

### 로컬 실행 및 테스트

Node.js 22.12 이상(Node 26 검증 완료)이 필요합니다.

```sh
npm install
npm run dev
```

실행 후 터미널에 표시되는 Local 또는 Network URL로 접속합니다(`--host 0.0.0.0` 옵션이 기본 설정되어 있어 동일 Wi-Fi/LAN 내 모바일 기기에서도 바로 테스트할 수 있습니다).

```sh
npm run build          # 사진 매니페스트 생성, TypeScript 타입 검사 및 프로덕션 빌드(dist/)
npm run preview        # 프로덕션 빌드 로컬/LAN 프리뷰 서버 실행
npm run test:pipeline  # 사진 스캐너 및 EXIF 추출 파이프라인 테스트
npm run test:gallery   # 브라우저 네비게이션, 모바일 레이아웃, 피킹 및 GPU 생명주기 테스트
```

### 사진 추가 및 커스터마이징

1. `public/photos/` 디렉터리에 `.jpg`, `.jpeg`, `.png`, `.webp` 형식의 사진을 넣습니다.
2. 파일명 순서(자연 정렬)에 따라 전시 순서가 결정됩니다.
3. `npm run manifest`를 실행하거나 `npm run dev` / `npm run build`를 실행하면 `public/photos.json`이 자동으로 갱신됩니다.
4. 특정 사진의 제목이나 설명, EXIF 정보를 직접 지정하고 싶다면 사진과 동일한 이름의 JSON 사이드카 파일(예: `20250920_161310.json`)을 추가할 수 있습니다:

```json
{
  "title": "작품 제목",
  "location": "Seoul, Korea",
  "description": "작품에 대한 설명",
  "exif": { "camera": "카메라 모델명" }
}
```

### 조작 방법

| 조작                                         | 동작 설명                                              |
| -------------------------------------------- | ------------------------------------------------------ |
| 마우스 스크롤, `←` / `→`, `[` / `]`          | 전시 작품 순차 이동                                    |
| 하단 컨트롤 바 (`[ ← PREV ] · [ NEXT → ]`)   | 이전/다음 작품으로 이동 또는 `[ OVERVIEW ]` 전체 조망  |
| 액자 클릭 / 탭                               | 작품 정면 클로즈업 감상 및 카메라/EXIF 명패 표시       |
| `ESC`, 액자 바깥 영역 클릭, `BACK` 버튼 클릭 | 클로즈업 감상 종료 및 전시장 통로 시점으로 복귀        |
| `WASD` 또는 드래그                           | 전시장 내부 자유 이동 및 시선 회전                     |
| `HI-FI 3D` / `2D INDEX`                      | 3D 전시 공간과 2D 에디토리얼 인덱스 간 즉시 전환       |

### 배포 (GitHub Pages)

`main` 브랜치에 변경 사항을 푸시하면 `.github/workflows/deploy.yml` 워크플로우가 자동으로 매니페스트 생성 및 Vite 프로덕션 빌드를 수행하여 GitHub Pages(`https://csk200387.github.io/csk200387-archive/`)에 배포합니다.
