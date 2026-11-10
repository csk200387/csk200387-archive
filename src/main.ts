import "./style.css";
import { ASSET_BASE, type Photo } from "./types";
import { HudAndStaticView } from "./ui/HudAndStaticView";
import type { Gallery } from "./Gallery";

function isMobileDevice(): boolean {
  const narrow = matchMedia("(max-width: 768px)").matches;
  const coarseNoHover =
    matchMedia("(pointer: coarse)").matches &&
    matchMedia("(hover: none)").matches;
  const mobileUA =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
      navigator.userAgent,
    );
  return narrow || coarseNoHover || mobileUA;
}

async function boot() {
  const response = await fetch(`${ASSET_BASE}photos.json`);
  if (!response.ok)
    throw new Error(
      "The photo manifest could not be loaded. Run npm run manifest.",
    );
  const photos = (await response.json()) as Photo[];
  if (!Array.isArray(photos) || !photos.length)
    throw new Error(
      "The collection is empty. Add photographs to public/photos and run npm run manifest.",
    );
  let gallery: Gallery | undefined;
  let creating: Promise<void> | undefined;
  let desiredMode: "3d" | "index" = "3d";
  const ui = new HudAndStaticView(photos, {
    mode: (mode) => void setMode(mode, true),
    go: (index, inspect) => gallery?.director.go(index, inspect),
    step: (direction) => gallery?.director.step(direction),
    exit: () => gallery?.director.exit(),
    roam: (enabled) => gallery?.director.setRoaming(enabled),
  });
  async function setMode(mode: "3d" | "index", userInitiated = false) {
    desiredMode = mode;
    ui.setMode(mode);
    if (userInitiated) {
      try {
        localStorage.setItem("still-room-view", mode);
      } catch {
        /* Storage is optional. */
      }
    }
    if (mode === "index") {
      gallery?.setActive(false);
      return;
    }
    ui.setLoading(!gallery);
    if (!gallery) {
      creating ??= (async () => {
        const { Gallery } = await import("./Gallery");
        gallery = new Gallery(
          ui.viewport,
          photos,
          (state) => ui.update(state),
          () => {
            void setMode("index");
            ui.toast(
              "The 3D room is unavailable. The full collection is here in the index.",
            );
          },
        );
        await gallery.ready;
      })();
      try {
        await creating;
      } catch (error) {
        console.error(error);
        (gallery as Gallery | undefined)?.dispose();
        gallery = undefined;
        creating = undefined;
        await setMode("index");
        ui.toast(
          "Your browser could not open the 3D room. Enjoy the full photography index.",
        );
        return;
      }
    }
    ui.setLoading(false);
    gallery?.setActive(desiredMode === "3d");
  }
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const mobile = isMobileDevice();
  const lowPower =
    nav.connection?.saveData ||
    (nav.deviceMemory !== undefined && nav.deviceMemory < 4) ||
    (nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2);
  const query = new URLSearchParams(location.search).get("view");
  let stored: string | null = null;
  try {
    stored = localStorage.getItem("still-room-view");
  } catch {
    /* Optional. */
  }
  let initialMode: "3d" | "index";
  if (query === "index" || query === "3d") {
    initialMode = query;
  } else if (mobile) {
    // Always show 2D Index first by default on mobile devices
    initialMode = "index";
  } else if (stored === "index" || stored === "3d") {
    initialMode = stored;
  } else {
    initialMode = lowPower ? "index" : "3d";
  }
  await setMode(initialMode, false);
  window.addEventListener("pagehide", () => gallery?.setActive(false));
  window.addEventListener("pageshow", () =>
    gallery?.setActive(desiredMode === "3d"),
  );
}
boot().catch((error) => {
  console.error(error);
  const root = document.querySelector("#app")!;
  const section = document.createElement("section");
  section.className = "fatal-error";
  const title = document.createElement("h1");
  title.textContent = "The room is not quite ready.";
  const message = document.createElement("p");
  message.textContent =
    error instanceof Error ? error.message : "Please reload to try again.";
  section.append(title, message);
  root.replaceChildren(section);
});
