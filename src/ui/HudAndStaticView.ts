import { photoUrl, type Photo } from "../types";
import type { CameraState } from "../camera/CameraDirector";

export interface UiActions {
  mode: (mode: "3d" | "index") => void;
  go: (index: number, inspect?: boolean) => void;
  step: (direction: number) => void;
  exit: () => void;
  roam?: (enabled: boolean) => void;
}

const esc = (text: unknown) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

const pad = (n: number) => String(n).padStart(2, "0");

function formatExifLine(photo: Photo): string {
  const focal = photo.exif.focalLength
    ? photo.exif.focalLength.replace(/\s+/g, "").toUpperCase()
    : null;
  const aperture = photo.exif.aperture
    ? photo.exif.aperture.replace(/ƒ/g, "F").replace(/\s+/g, "").toUpperCase()
    : null;
  const shutter = photo.exif.shutterSpeed
    ? photo.exif.shutterSpeed.replace(/\s+/g, "").toUpperCase()
    : null;
  const iso = photo.exif.iso ? `ISO ${photo.exif.iso}` : null;
  const specs = [focal, aperture, shutter, iso].filter(Boolean);
  if (specs.length) return specs.join(" · ");
  return `${photo.ratioLabel} · ${photo.width}×${photo.height}`.toUpperCase();
}

function filenameOf(photo: Photo): string {
  const raw = decodeURIComponent(photo.src.split("/").pop() || photo.id);
  return raw.toUpperCase();
}

function displayTitle(photo: Photo, index: number): string {
  const t = (photo.title || "").trim();
  // If title is missing or purely camera-generated timestamp digits/suffixes, format as clean archive entry
  if (!t || /^[\d\s._-]+(\.NIGHT[\d\s_-]*)?$/i.test(t)) {
    return photo.exif.date
      ? `Archive № ${pad(index + 1)} — ${photo.exif.date}`
      : `Archive № ${pad(index + 1)}`;
  }
  return t;
}

export class HudAndStaticView {
  readonly viewport: HTMLDivElement;
  private mode: "3d" | "index" = "3d";
  private state: CameraState = { index: -1, inspecting: false, roaming: false };
  private root: HTMLElement;
  private lightboxIndex = 0;
  private lightbox: HTMLDialogElement;

  constructor(
    private photos: Photo[],
    private actions: UiActions,
  ) {
    this.root = document.querySelector("#app")!;
    this.root.innerHTML = `
      <a class="skip-link" href="#index">Skip to photo index</a>
      <header class="micro-hud" aria-label="Gallery navigation">
        <button type="button" class="hud-brand" aria-label="CSK200387 / ARCHIVE overview">CSK200387 / ARCHIVE &nbsp; <span class="hud-counter">01 / ${pad(photos.length)}</span></button>
        <button type="button" class="hud-back-gallery" aria-label="Back to gallery" hidden>[ ← BACK TO GALLERY ]</button>
        <nav class="hud-modes" aria-label="View mode">
          <button type="button" data-mode="3d" aria-pressed="true">[ HI-FI 3D ]</button>
          <span class="hud-sep" aria-hidden="true">/</span>
          <button type="button" data-mode="index" aria-pressed="false">2D INDEX</button>
        </nav>
      </header>
      <main>
        <div id="viewport" role="region" aria-label="Interactive 3D photography gallery. Click a photograph to inspect, scroll or use arrow keys to navigate, drag to look around." tabindex="0"></div>
        <aside class="placard" aria-label="Photograph placard" hidden></aside>
        <nav class="hud-bottom-bar" aria-label="Gallery controls">
          <button type="button" class="hud-prev">[ ← PREV ]</button>
          <span class="hud-dot" aria-hidden="true">·</span>
          <span class="hud-bottom-counter">01 / ${pad(photos.length)}</span>
          <span class="hud-dot" aria-hidden="true">·</span>
          <button type="button" class="hud-next">[ NEXT → ]</button>
          <span class="hud-dot" aria-hidden="true">·</span>
          <button type="button" class="hud-overview">[ OVERVIEW ]</button>
        </nav>
        <section id="index" class="static-view" aria-label="Photography index" hidden>
          <div class="index-bar">
            <span>CSK200387 / ARCHIVE</span>
            <span>${pad(photos.length)} PHOTOGRAPHS</span>
          </div>
          <div class="photo-grid">${photos
            .map(
              (photo, index) => `
            <article class="photo-card">
              <button type="button" class="photo-open" data-photo="${index}" aria-label="Inspect ${esc(displayTitle(photo, index))}">
                <div class="image-wrap" style="aspect-ratio:${photo.aspectRatio};background:rgb(${photo.dominantColor.join(",")})">
                  <img src="${esc(photoUrl(photo))}" alt="${esc(displayTitle(photo, index))}" loading="lazy" decoding="async" width="${photo.width}" height="${photo.height}"/>
                </div>
                <div class="card-meta">
                  <span class="card-index">${pad(index + 1)} / ${pad(photos.length)}</span>
                  <span class="card-title">${esc(displayTitle(photo, index))}</span>
                </div>
                <div class="card-exif">${esc(formatExifLine(photo))}</div>
              </button>
            </article>`,
            )
            .join("")}</div>
        </section>
      </main>
      <div class="loading-screen" role="status" aria-label="Loading 3D space"><span class="loading-mark">CSK200387 / ARCHIVE</span></div>
      <div class="toast" role="status" hidden></div>
      <dialog class="lightbox" aria-label="Photograph detail">
        <div class="lightbox-stage"></div>
        <div class="lightbox-placard"></div>
      </dialog>
    `;

    this.viewport = this.root.querySelector("#viewport")!;
    this.lightbox = this.root.querySelector(".lightbox")!;

    this.root.querySelector(".hud-brand")!.addEventListener("click", () => {
      if (this.mode === "index") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        this.actions.go(-1, false);
      }
    });

    this.root
      .querySelector(".hud-back-gallery")!
      .addEventListener("click", () => this.actions.exit());

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-mode]")
      .forEach((btn) => {
        btn.onclick = () =>
          this.actions.mode(btn.dataset.mode as "3d" | "index");
      });

    this.root
      .querySelector(".skip-link")!
      .addEventListener("click", () => this.actions.mode("index"));

    this.root
      .querySelector(".hud-prev")!
      .addEventListener("click", () => this.actions.step(-1));
    this.root
      .querySelector(".hud-next")!
      .addEventListener("click", () => this.actions.step(1));
    this.root
      .querySelector(".hud-overview")!
      .addEventListener("click", () => this.actions.go(-1, false));

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-photo]")
      .forEach((btn) => {
        btn.onclick = () => this.openLightbox(Number(btn.dataset.photo));
      });

    this.lightbox.addEventListener("click", (e) => {
      if (e.target === this.lightbox) this.lightbox.close();
    });
    this.lightbox.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        this.openLightbox(this.lightboxIndex + 1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.openLightbox(this.lightboxIndex - 1);
      }
    });

    this.update(this.state);
  }

  setMode(mode: "3d" | "index") {
    this.mode = mode;
    document.body.classList.toggle("index-mode", mode === "index");
    this.root.querySelector<HTMLElement>("#index")!.hidden = mode !== "index";
    this.viewport.hidden = mode === "index";
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-mode]")
      .forEach((btn) => {
        const active = btn.dataset.mode === mode;
        btn.setAttribute("aria-pressed", String(active));
        const label = btn.dataset.mode === "3d" ? "HI-FI 3D" : "2D INDEX";
        btn.textContent = active ? `[ ${label} ]` : label;
      });
    if (mode === "index") {
      this.setLoading(false);
      this.root.querySelector<HTMLElement>(".placard")!.hidden = true;
      this.root.querySelector<HTMLElement>(".hud-back-gallery")!.hidden = true;
      this.root.querySelector<HTMLElement>(".hud-bottom-bar")!.hidden = true;
      document.body.classList.remove("inspecting");
      window.scrollTo(0, 0);
    } else {
      this.update(this.state);
    }
  }

  setLoading(loading: boolean) {
    this.root
      .querySelector(".loading-screen")!
      .classList.toggle("finished", !loading);
  }

  toast(message: string) {
    const el = this.root.querySelector<HTMLElement>(".toast")!;
    el.textContent = message;
    el.hidden = false;
    setTimeout(() => {
      el.hidden = true;
    }, 6500);
  }

  update(state: CameraState) {
    this.state = state;
    const displayIndex = state.index >= 0 ? state.index + 1 : 1;
    const counterText = `${pad(displayIndex)} / ${pad(this.photos.length)}`;
    this.root.querySelector(".hud-counter")!.textContent = counterText;
    this.root.querySelector(".hud-bottom-counter")!.textContent = counterText;

    const isInspecting =
      this.mode === "3d" && state.inspecting && state.index >= 0;

    const backBtn = this.root.querySelector<HTMLElement>(".hud-back-gallery")!;
    backBtn.hidden = !isInspecting;

    const bottomBar = this.root.querySelector<HTMLElement>(".hud-bottom-bar")!;
    bottomBar.hidden = this.mode !== "3d" || isInspecting;

    const overviewBtn =
      this.root.querySelector<HTMLButtonElement>(".hud-overview")!;
    overviewBtn.setAttribute(
      "aria-pressed",
      String(state.index < 0 && !state.inspecting && !state.roaming),
    );

    const placard = this.root.querySelector<HTMLElement>(".placard")!;
    placard.hidden = !isInspecting;

    if (isInspecting) {
      const photo = this.photos[state.index];
      placard.innerHTML = this.renderPlacardMarkup(photo, state.index);
      placard
        .querySelector<HTMLButtonElement>('[data-action="prev"]')!
        .addEventListener("click", () => this.actions.step(-1));
      placard
        .querySelector<HTMLButtonElement>('[data-action="next"]')!
        .addEventListener("click", () => this.actions.step(1));
      placard
        .querySelector<HTMLButtonElement>('[data-action="esc"]')!
        .addEventListener("click", () => this.actions.exit());
    }

    document.body.classList.toggle("inspecting", isInspecting);
  }

  private renderPlacardMarkup(photo: Photo, index: number) {
    return `
      <div class="placard-header">
        <span class="placard-index">${pad(index + 1)} / ${pad(this.photos.length)}</span>
        <span class="placard-file">${esc(filenameOf(photo))}</span>
      </div>
      <h2 class="placard-title">${esc(displayTitle(photo, index))}</h2>
      <p class="placard-exif">${esc(formatExifLine(photo))}</p>
      <nav class="placard-nav" aria-label="Photograph controls">
        <button type="button" data-action="prev">[ ← PREV ]</button>
        <button type="button" data-action="next">[ NEXT → ]</button>
        <button type="button" data-action="esc">[ × BACK TO ROOM ]</button>
      </nav>
    `;
  }

  private openLightbox(index: number) {
    this.lightboxIndex = (index + this.photos.length) % this.photos.length;
    const photo = this.photos[this.lightboxIndex];
    this.root.querySelector(".hud-counter")!.textContent =
      `${pad(this.lightboxIndex + 1)} / ${pad(this.photos.length)}`;
    this.lightbox.querySelector(".lightbox-stage")!.innerHTML =
      `<img src="${esc(photoUrl(photo))}" alt="${esc(photo.title)}" width="${photo.width}" height="${photo.height}">`;
    const placardContainer =
      this.lightbox.querySelector<HTMLElement>(".lightbox-placard")!;
    placardContainer.innerHTML = this.renderPlacardMarkup(
      photo,
      this.lightboxIndex,
    );
    placardContainer
      .querySelector<HTMLButtonElement>('[data-action="prev"]')!
      .addEventListener("click", () =>
        this.openLightbox(this.lightboxIndex - 1),
      );
    placardContainer
      .querySelector<HTMLButtonElement>('[data-action="next"]')!
      .addEventListener("click", () =>
        this.openLightbox(this.lightboxIndex + 1),
      );
    placardContainer
      .querySelector<HTMLButtonElement>('[data-action="esc"]')!
      .addEventListener("click", () => this.lightbox.close());
    if (!this.lightbox.open) this.lightbox.showModal();
  }
}
