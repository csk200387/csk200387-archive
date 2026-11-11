import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { mockFeed, parseCaption, postFromHtml, syncInstagram } from "./sync-instagram.mjs";

test("caption parser extracts specs, drops hashtag and spec lines, and titles empty captions", () => {
  assert.deepEqual(
    parseCaption(
      "Alpine silence.\nLast light.\n\nFujifilm X-T5 · 35mm · f/5.6 · 1/250s · ISO 200\n\n#dolomites #35mm",
      "2025-06-18",
    ),
    {
      title: "Alpine silence.",
      description: "Last light.",
      exif: {
        date: "2025-06-18",
        focalLength: "35 mm",
        aperture: "ƒ/5.6",
        shutterSpeed: "1/250 s",
        iso: 200,
        camera: "Fujifilm X-T5",
      },
    },
  );
  assert.deepEqual(parseCaption("🌊🌊\n#bluehour", "2024-11-30", 2), {
    title: "Archive № 03 — 2024-11-30",
    description: "",
    exif: { date: "2024-11-30" },
  });
  // Dates and prose numbers are not mistaken for exposure settings.
  assert.deepEqual(parseCaption("Back on 1/12/2024 with Leica 35mm f2").exif, {
    focalLength: "35 mm",
    aperture: "ƒ/2",
    camera: "Leica",
  });
  const long = parseCaption("a".repeat(120));
  assert.equal(long.title.length, 80);
  assert.equal(long.description, "a".repeat(120));
});

test("public post HTML yields image, decoded caption, date, and canonical permalink", () => {
  const html = `<meta content="https://cdn.example/x.jpg?a=1&amp;b=2" property="og:image" />
    <meta property="og:description" content="12 likes, 3 comments - someone on May 1, 2024: &quot;Night walk &#x1f319;&quot;. " />`;
  assert.deepEqual(postFromHtml(html, "https://www.instagram.com/someone/p/AbC-12_/?img_index=1"), {
    id: "AbC-12_",
    media_type: "IMAGE",
    media_url: "https://cdn.example/x.jpg?a=1&b=2",
    caption: "Night walk 🌙",
    permalink: "https://www.instagram.com/p/AbC-12_/",
    timestamp: "2024-05-01T00:00:00.000Z",
  });
  assert.throws(() => postFromHtml("<html></html>", "https://www.instagram.com/p/X/"), /og:image/);
});

test("mock sync flattens carousels, skips video, curates order, reuses cache, and prunes stale files", async (t) => {
  const publicDir = await mkdtemp(path.join(tmpdir(), "still-room-ig-"));
  t.after(() => rm(publicDir, { recursive: true, force: true }));
  const posts = await mockFeed();
  const photos = await syncInstagram({ posts, publicDir });
  assert.deepEqual(
    photos.map((p) => p.id),
    ["01-ig-17900000000000001", "02-ig-17900000000000021", "03-ig-17900000000000022", "04-ig-17900000000000003"],
  );
  const [alpine, slide1, slide2, wave] = photos;
  assert.equal(alpine.src, "/photos/01-ig-17900000000000001.webp");
  assert.equal(alpine.title, "Alpine silence.");
  assert.equal(alpine.permalink, "https://www.instagram.com/p/MOCK0001/");
  assert.match(alpine.caption, /#dolomites/);
  assert.equal(alpine.exif.iso, 200);
  assert.equal(alpine.exif.camera, "Fujifilm X-T5");
  assert.equal(alpine.exif.date, "2025-06-18");
  assert.equal(alpine.ratioLabel, "3:2");
  assert.ok(alpine.dominantColor.every((v) => v >= 0 && v <= 255));
  assert.equal(slide1.permalink, slide2.permalink, "carousel slides share the post link");
  assert.equal(slide1.exif.shutterSpeed, "1/125 s");
  assert.equal(wave.title, "Archive № 04 — 2024-11-30");

  const photoDir = path.join(publicDir, "photos");
  const before = await stat(path.join(photoDir, "04-ig-17900000000000003.webp"));
  const curated = await syncInstagram({
    posts,
    publicDir,
    select: ["17900000000000003", "17900000000000001"],
  });
  assert.deepEqual(
    curated.map((p) => p.id),
    ["01-ig-17900000000000003", "02-ig-17900000000000001"],
  );
  assert.equal(curated[0].title, "Archive № 01 — 2024-11-30");
  assert.equal((await stat(path.join(photoDir, "01-ig-17900000000000003.webp"))).ino, before.ino);
  assert.deepEqual((await readdir(photoDir)).sort(), [
    "01-ig-17900000000000003.json",
    "01-ig-17900000000000003.webp",
    "02-ig-17900000000000001.json",
    "02-ig-17900000000000001.webp",
  ]);
  await assert.rejects(syncInstagram({ posts, publicDir, select: ["missing"] }), /missing/);
});
