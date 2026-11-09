import { readdir, mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import sharp from "sharp";
import exifr from "exifr";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "scripts/sample-sources");
const supported = /\.(jpe?g|png|webp)$/i;
const samples = [
  [
    "01-alpine-silence",
    "Alpine silence",
    "Dolomites, Italy",
    1500,
    1000,
    "1470770841072-f978cf4d019e",
  ],
  [
    "02-the-space-between",
    "The space between",
    "Studies in architecture",
    1000,
    1500,
    "1511818966892-d7d671e672a2",
  ],
  [
    "03-blue-hours",
    "Blue hours",
    "Along the coast",
    1500,
    1000,
    "1518837695005-2083093ee35b",
  ],
  [
    "04-at-the-table",
    "At the table",
    "Everyday rituals",
    1400,
    1050,
    "1490645935967-10de6ba17061",
  ],
  [
    "05-lines-of-light",
    "Lines of light",
    "Studies in architecture",
    1000,
    1500,
    "1487958449943-2429e8be8625",
  ],
  [
    "06-under-the-canopy",
    "Under the canopy",
    "The quiet outdoors",
    1400,
    1050,
    "1441974231531-c6227db76b6e",
  ],
  [
    "07-living-shapes",
    "Living shapes",
    "Botanical notes",
    1000,
    1500,
    "1497250681960-ef046c08a56e",
  ],
  [
    "08-the-long-way-home",
    "The long way home",
    "Last light",
    1500,
    1000,
    "1500530855697-b586d89ba3ee",
  ],
];

/** Offline photographic canvases from bundled reference masters; EXIF is illustrative. */
export async function generateSamples(directory) {
  await mkdir(directory, { recursive: true });
  for (const [
    index,
    [id, title, location, width, height, source],
  ] of samples.entries()) {
    const filename = `${id}.jpg`;
    await sharp(
      path.join(sourceDir, `${String(index + 1).padStart(2, "0")}.jpg`),
    )
      .rotate()
      .resize(width, height, { fit: "cover", position: "attention" })
      .modulate({ saturation: 0.79, brightness: 1.035 })
      .withExif({
        IFD0: { Make: "FUJIFILM", Model: "X-T5", ImageDescription: title },
        IFD2: {
          LensModel: "XF 35mm F1.4 R",
          FocalLength: "35/1",
          FNumber: "56/10",
          ExposureTime: "1/250",
          ISOSpeedRatings: "200",
          DateTimeOriginal: "2025:06:18 17:42:00",
        },
      })
      .jpeg({ quality: 91, mozjpeg: true })
      .toFile(path.join(directory, filename));
    await writeFile(
      path.join(directory, `${id}.json`),
      JSON.stringify(
        {
          title,
          location,
          sample: true,
          description:
            "A study in quiet. Sample photograph with illustrative camera settings.",
          credit: {
            label: "Sample imagery · Unsplash",
            url: `https://images.unsplash.com/photo-${source}`,
            source: `https://images.unsplash.com/photo-${source}`,
          },
          exif: {
            camera: "FUJIFILM X-T5",
            lens: "XF 35mm F1.4 R",
            focalLength: "35 mm",
            aperture: "ƒ/5.6",
            shutterSpeed: "1/250 s",
            iso: 200,
            date: "2025-06-18",
          },
        },
        null,
        2,
      ) + "\n",
    );
  }
}

function fraction(value) {
  return value < 1 ? `1/${Math.round(1 / value)} s` : `${value} s`;
}
function dateString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10).replace(/:/g, "-");
}
function ratioLabel(width, height) {
  for (const [a, b] of [
    [3, 2],
    [4, 3],
    [2, 3],
    [3, 4],
    [1, 1],
    [16, 9],
  ]) {
    if (Math.abs(width / height - a / b) < 0.015) return `${a}:${b}`;
  }
  return `${(width / height).toFixed(2)}:1`;
}
async function dominantColor(fullPath) {
  const { data, info } = await sharp(fullPath)
    .rotate()
    .resize(96, 96, { fit: "inside" })
    .flatten({ background: "#efede3" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bins = new Map();
  // Ignore near-black shadows and white borders when a usable midtone palette exists.
  // This keeps photo bounce light chromatic rather than turning dark pictures into black light.
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const lightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lightness < 30 || lightness > 235) continue;
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const bin = bins.get(key) ?? [0, 0, 0, 0];
    bin[0]++;
    bin[1] += r;
    bin[2] += g;
    bin[3] += b;
    bins.set(key, bin);
  }
  const dominant = [...bins.values()].sort((a, b) => b[0] - a[0])[0];
  if (dominant)
    return dominant.slice(1).map((value) => Math.round(value / dominant[0]));
  const stats = await sharp(data, { raw: info }).stats();
  return [stats.dominant.r, stats.dominant.g, stats.dominant.b];
}
async function listPhotos(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((x) => x.isFile() && supported.test(x.name))
    .map((x) => x.name)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}
export async function generateManifest({
  publicDir = path.join(root, "public"),
  samplesIfEmpty = true,
} = {}) {
  const photoDir = path.join(publicDir, "photos");
  await mkdir(photoDir, { recursive: true });
  let files = await listPhotos(photoDir);
  if (!files.length && samplesIfEmpty) {
    await generateSamples(photoDir);
    files = await listPhotos(photoDir);
  }
  const photos = [];
  for (const file of files) {
    const fullPath = path.join(photoDir, file);
    const raw = await sharp(fullPath).metadata();
    const rotated = [5, 6, 7, 8].includes(raw.orientation ?? 1);
    const width = rotated ? raw.height : raw.width;
    const height = rotated ? raw.width : raw.height;
    if (!width || !height) throw new Error(`Cannot read dimensions: ${file}`);
    let tags = {};
    // Passing bytes avoids exifr's lazy file reader leaving handles open on Node 26.
    try {
      tags = (await exifr.parse(await readFile(fullPath))) ?? {};
    } catch {
      /* Photos without EXIF remain valid. */
    }
    let info = {};
    try {
      info = JSON.parse(
        await readFile(
          path.join(photoDir, `${path.parse(file).name}.json`),
          "utf8",
        ),
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const dominant = await dominantColor(fullPath);
    const exif = {
      camera:
        tags.Model && tags.Make && String(tags.Model).startsWith(tags.Make)
          ? tags.Model
          : [tags.Make, tags.Model].filter(Boolean).join(" ") || null,
      lens: tags.LensModel || null,
      focalLength: tags.FocalLength ? `${tags.FocalLength} mm` : null,
      aperture: tags.FNumber ? `ƒ/${tags.FNumber}` : null,
      shutterSpeed: tags.ExposureTime ? fraction(tags.ExposureTime) : null,
      iso: tags.ISO || null,
      date: dateString(tags.DateTimeOriginal),
      ...(info.exif ?? {}),
    };
    photos.push({
      id: path.parse(file).name,
      src: `/photos/${encodeURIComponent(file)}`,
      title:
        info.title ||
        tags.ImageDescription ||
        path
          .parse(file)
          .name.replace(/^\d+[-_ ]*/, "")
          .replace(/[-_]/g, " "),
      location: info.location || "",
      description: info.description || "",
      width,
      height,
      aspectRatio: width / height,
      ratioLabel: ratioLabel(width, height),
      dominantColor: dominant,
      exif,
      sample: Boolean(info.sample),
      credit: info.credit || null,
    });
  }
  // Atomic replacement prevents the dev server from reading a half-written manifest.
  const output = path.join(publicDir, "photos.json");
  const temporary = `${output}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(temporary, JSON.stringify(photos, null, 2) + "\n");
  await rename(temporary, output);
  return photos;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const photos = await generateManifest();
  console.log(
    `Manifest ready: ${photos.length} photographs → public/photos.json`,
  );
}
