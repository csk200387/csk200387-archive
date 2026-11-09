import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { generateManifest } from "./generate-manifest.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "still-room-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "photos"));
  return directory;
}
test("empty folders generate eight offline samples with real files, mixed ratios, and illustrative EXIF", async (t) => {
  const publicDir = await fixture(t);
  const photos = await generateManifest({ publicDir });
  assert.equal(photos.length, 8);
  assert.deepEqual(
    new Set(photos.map((p) => p.ratioLabel)),
    new Set(["3:2", "4:3", "2:3"]),
  );
  for (const photo of photos) {
    assert.equal(photo.sample, true);
    assert.equal(photo.exif.iso, 200);
    assert.ok(photo.exif.camera);
    assert.ok(photo.exif.lens);
    assert.ok(photo.exif.date);
    assert.ok(photo.dominantColor.every((v) => v >= 0 && v <= 255));
    const metadata = await sharp(
      path.join(publicDir, decodeURIComponent(photo.src)),
    ).metadata();
    assert.equal(metadata.width, photo.width);
    assert.equal(metadata.height, photo.height);
    assert.ok(metadata.exif, "sample embeds EXIF in the JPEG itself");
  }
  assert.deepEqual(
    await generateManifest({ publicDir }),
    photos,
    "rerunning preserves the collection",
  );
  assert.deepEqual(
    JSON.parse(await readFile(path.join(publicDir, "photos.json"))),
    photos,
  );
});
test("scanner supports all four formats, natural ordering, URI encoding, and photos without EXIF", async (t) => {
  const publicDir = await fixture(t);
  const dir = path.join(publicDir, "photos");
  for (const [filename, format] of [
    ["10 last.webp", "webp"],
    ["2_blue.PNG", "png"],
    ["3-photo.jpeg", "jpeg"],
    ["1-first.jpg", "jpeg"],
  ]) {
    await sharp({
      create: { width: 120, height: 80, channels: 3, background: "#2864b4" },
    })
      .toFormat(format)
      .toFile(path.join(dir, filename));
  }
  await writeFile(path.join(dir, "ignore.txt"), "not a photo");
  const photos = await generateManifest({ publicDir });
  assert.deepEqual(
    photos.map((p) => p.id),
    ["1-first", "2_blue", "3-photo", "10 last"],
  );
  assert.equal(photos[3].src, "/photos/10%20last.webp");
  assert.equal(photos[0].exif.camera, null);
  assert.equal(photos[0].ratioLabel, "3:2");
  assert.ok(photos[0].dominantColor[2] > photos[0].dominantColor[0]);
});
test("EXIF orientation, true camera settings, and optional sidecar overrides survive scanning", async (t) => {
  const publicDir = await fixture(t);
  const dir = path.join(publicDir, "photos");
  await sharp({
    create: { width: 120, height: 80, channels: 3, background: "#bd6538" },
  })
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: "Canon", Model: "EOS R5" },
      IFD2: {
        FNumber: "28/10",
        ExposureTime: "1/125",
        FocalLength: "50/1",
        ISOSpeedRatings: "400",
        LensModel: "RF 50mm",
        DateTimeOriginal: "2024:05:01 12:00:00",
      },
    })
    .jpeg()
    .toFile(path.join(dir, "01-test.jpg"));
  await writeFile(
    path.join(dir, "01-test.json"),
    JSON.stringify({ title: "An intentional title", location: "Test studio" }),
  );
  const [photo] = await generateManifest({ publicDir });
  assert.equal(photo.width, 80);
  assert.equal(photo.height, 120);
  assert.equal(photo.ratioLabel, "2:3");
  assert.equal(photo.title, "An intentional title");
  assert.equal(photo.location, "Test studio");
  assert.equal(photo.exif.camera, "Canon EOS R5");
  assert.equal(photo.exif.aperture, "ƒ/2.8");
  assert.equal(photo.exif.shutterSpeed, "1/125 s");
  assert.equal(photo.exif.iso, 400);
  assert.equal(photo.exif.focalLength, "50 mm");
  assert.equal(photo.exif.lens, "RF 50mm");
  assert.equal(photo.exif.date, "2024-05-01");
  assert.equal(photo.sample, false);
});
test("invalid image or malformed sidecar fails instead of publishing a silently incomplete collection", async (t) => {
  const publicDir = await fixture(t);
  const dir = path.join(publicDir, "photos");
  await writeFile(path.join(dir, "broken.jpg"), "not an image");
  await assert.rejects(generateManifest({ publicDir }));
  await rm(path.join(dir, "broken.jpg"));
  await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#888888" },
  })
    .png()
    .toFile(path.join(dir, "valid.png"));
  await writeFile(path.join(dir, "valid.json"), "{");
  await assert.rejects(generateManifest({ publicDir }));
});
