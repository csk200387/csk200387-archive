import type { Photo } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

export function formatExifLine(photo: Photo): string {
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
  return [photo.exif.date, photo.ratioLabel, `${photo.width}×${photo.height}`]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();
}

export function artworkCaption(photo: Photo): string {
  return photo.description?.trim() || photo.caption?.trim() || "";
}

export function displayTitle(photo: Photo, index?: number): string {
  const t = (photo.title || "").trim();
  // Instagram ingestion can already have expanded the generated archive title.
  if (index === undefined && /^Archive № \d+(?: — \d{4}-\d{2}-\d{2})?$/.test(t))
    return "Archive";
  // If title is missing or purely camera-generated timestamp digits/suffixes, format as clean archive entry
  if (!t || /^[\d\s._-]+(\.NIGHT[\d\s_-]*)?$/i.test(t)) {
    // Physical labels omit sequence numbers and typeset the date separately.
    if (index === undefined) return "Archive";
    return photo.exif.date
      ? `Archive № ${pad(index + 1)} — ${photo.exif.date}`
      : `Archive № ${pad(index + 1)}`;
  }
  return t;
}

