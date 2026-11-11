import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import path from "node:path";
import sharp from "sharp";
import { generateManifest } from "./generate-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRAPH_FIELDS =
  "id,caption,media_type,media_url,permalink,timestamp,children{id,media_type,media_url}";
// Files this script owns inside public/photos; everything else is left alone.
const OWNED = /^\d+-ig-([\w-]+)\.(webp|json)$/;
const pad = (n) => String(n).padStart(2, "0");

const BRANDS =
  "Fujifilm|Fuji|Leica|Sony|Canon|Nikon|Ricoh|Olympus|OM System|Panasonic|Lumix|Hasselblad|Pentax|Sigma|Contax|Mamiya|Minolta|Kodak|Samsung|iPhone|Pixel";
// ponytail: regex heuristics for common caption notation; unusual formats fall back to date-only.
const SPECS = [
  ["focalLength", /(?<![\w.])(\d{1,4}(?:\.\d)?)\s?mm\b/gi, (m) => `${m[1]} mm`],
  ["aperture", /(?<!\w)[fƒ]\s?\/?\s?(\d{1,2}(?:\.\d{1,2})?)(?![\w.])/gi, (m) => `ƒ/${m[1]}`],
  ["shutterSpeed", /(?<![\w/.])1\/(\d{1,5})(?:\s?(?:s|sec)\b)?(?![\w/])/gi, (m) => `1/${m[1]} s`],
  ["iso", /\bISO\s?:?\s?(\d{2,6})\b/gi, (m) => Number(m[1])],
  [
    "camera",
    new RegExp(
      `(?<!\\w)(${BRANDS})(?:[ -](?!\\d+(?:\\.\\d+)?mm\\b)([\\w-]*\\d[\\w-]*))?(?!\\w)`,
      "gi",
    ),
    (m) => [m[1], m[2]].filter(Boolean).join(" "),
  ],
];
const hasText = (line) => /[\p{L}\p{N}]/u.test(line);

/** Instagram strips native EXIF, so title, prose and camera specs come from the caption. */
export function parseCaption(caption = "", date = null, index = 0) {
  const exif = date ? { date } : {};
  for (const [key, pattern, format] of SPECS) {
    const match = caption.match(new RegExp(pattern.source, "i"));
    if (match) exif[key] = format(match);
  }
  // Strip hashtags, then drop lines left with nothing but specs/emoji.
  const prose = caption
    .split(/\r?\n/)
    .map((line) => line.replace(/#[\p{L}\p{N}_]+/gu, "").trim())
    .filter((line) =>
      hasText(SPECS.reduce((rest, [, pattern]) => rest.replace(pattern, ""), line)),
    );
  const first = prose[0] ?? "";
  const long = first.length > 80;
  const title = !first
    ? `Archive № ${pad(index + 1)}${date ? ` — ${date}` : ""}`
    : long
      ? `${first.slice(0, 79).trimEnd()}…`
      : first;
  return {
    title,
    description: (long ? prose : prose.slice(1)).join("\n"),
    exif,
  };
}

/** Feed posts (Graph API shape) → one item per exhibited image; videos are skipped. */
export function flatten(posts) {
  return posts.flatMap((post) =>
    (post.media_type === "CAROUSEL_ALBUM" ? (post.children?.data ?? []) : [post])
      .filter((media) => media.media_type === "IMAGE" && media.media_url)
      .map((media) => ({
        id: String(media.id),
        url: media.media_url,
        caption: post.caption ?? "",
        permalink: post.permalink ?? null,
        timestamp: post.timestamp ?? null,
      })),
  );
}

const decodeEntities = (text) =>
  text.replace(/&(#x?[\da-f]+|amp|quot|lt|gt|apos);/gi, (_, entity) => {
    if (entity[0] !== "#")
      return { amp: "&", quot: '"', lt: "<", gt: ">", apos: "'" }[entity.toLowerCase()];
    const hex = entity[1].toLowerCase() === "x";
    return String.fromCodePoint(parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
  });

/** Public post page → Graph-shaped post, from its OpenGraph tags. */
export function postFromHtml(html, url) {
  const code = url.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reel)\/([\w-]+)/)?.[1];
  if (!code) throw new Error(`Not an Instagram post URL: ${url}`);
  const og = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = tag.match(/property="og:(\w+)"/)?.[1];
    const value = tag.match(/content="([^"]*)"/)?.[1];
    if (key && value !== undefined) og[key] ??= decodeEntities(value);
  }
  if (!og.image)
    throw new Error(`No og:image for ${url} (private post or login wall); use IG_ACCESS_TOKEN instead.`);
  // og:description reads `12 likes, 3 comments - user on May 1, 2024: "caption".`
  const meta = og.description?.match(/ on ([A-Z][a-z]+ \d{1,2}, \d{4}): "([\s\S]*)"\.?\s*$/);
  const time = meta ? Date.parse(`${meta[1]} UTC`) : NaN;
  return {
    id: code,
    media_type: "IMAGE",
    media_url: og.image,
    caption: meta?.[2] ?? "",
    permalink: `https://www.instagram.com/p/${code}/`,
    timestamp: Number.isNaN(time) ? null : new Date(time).toISOString(),
  };
}

async function get(url, as) {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok)
    // Never echo the access token into logs.
    throw new Error(`${response.status} ${url.replace(/access_token=[^&]+/, "access_token=***")}`);
  return response[as]();
}

// ponytail: first page only; follow paging.next if more than `limit` posts are needed.
async function graphFeed(token, limit) {
  const query = new URLSearchParams({ fields: GRAPH_FIELDS, limit: String(limit), access_token: token });
  return (await get(`https://graph.instagram.com/me/media?${query}`, "json")).data;
}

// ponytail: og:image is the post's cover only (first carousel slide); Graph mode gets every slide.
async function urlFeed(urls) {
  const posts = [];
  for (const url of urls) posts.push(postFromHtml(await get(url, "text"), url));
  return posts;
}

export async function mockFeed() {
  const file = path.join(root, "scripts/ig-mock-feed.json");
  const resolve = (media) =>
    media.media_url ? { ...media, media_url: path.resolve(path.dirname(file), media.media_url) } : media;
  return JSON.parse(await readFile(file, "utf8")).data.map((post) => ({
    ...resolve(post),
    children: post.children && { data: post.children.data.map(resolve) },
  }));
}

const fetchImage = async (url) =>
  /^https?:/.test(url) ? Buffer.from(await get(url, "arrayBuffer")) : readFile(url);

/** Download the curated selection into public/photos, write sidecars, regenerate photos.json. */
export async function syncInstagram({ posts, select = [], publicDir = path.join(root, "public") }) {
  const photoDir = path.join(publicDir, "photos");
  await mkdir(photoDir, { recursive: true });
  const items = flatten(posts);
  const byId = new Map(items.map((item) => [item.id, item]));
  const chosen = select.length
    ? [...new Set(select.map(String))].map((id) => {
        if (!byId.has(id)) throw new Error(`Selected media ${id} is not in the fetched feed`);
        return byId.get(id);
      })
    : items;
  const cached = new Map();
  for (const name of await readdir(photoDir)) {
    const match = name.match(OWNED);
    if (match?.[2] === "webp") cached.set(match[1], name);
  }
  const keep = new Set();
  for (const [index, item] of chosen.entries()) {
    if (!/^[\w-]+$/.test(item.id)) throw new Error(`Unsafe media id: ${item.id}`);
    const base = `${pad(index + 1)}-ig-${item.id}`;
    const image = path.join(photoDir, `${base}.webp`);
    // CDN URLs expire, so an already-downloaded image is reused and only renamed on reorder.
    if (cached.has(item.id)) await rename(path.join(photoDir, cached.get(item.id)), image);
    else {
      // Decoding through sharp rejects HTML error pages saved as "images".
      await sharp(await fetchImage(item.url)).rotate().webp({ quality: 90 }).toFile(`${image}.tmp`);
      await rename(`${image}.tmp`, image);
    }
    const date = item.timestamp?.slice(0, 10) ?? null;
    const { title, description, exif } = parseCaption(item.caption, date, index);
    const sidecar = { title, description, location: "", caption: item.caption, permalink: item.permalink, exif };
    await writeFile(path.join(photoDir, `${base}.json`), JSON.stringify(sidecar, null, 2) + "\n");
    keep.add(`${base}.webp`).add(`${base}.json`);
  }
  for (const name of await readdir(photoDir))
    if (OWNED.test(name) && !keep.has(name)) await rm(path.join(photoDir, name));
  return generateManifest({ publicDir });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values: args } = parseArgs({
    options: { mock: { type: "boolean" }, list: { type: "boolean" }, out: { type: "string" } },
  });
  try {
    process.loadEnvFile(path.join(root, ".env"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let config = {};
  try {
    config = JSON.parse(await readFile(path.join(root, "instagram.config.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const token = process.env.IG_ACCESS_TOKEN;
  let posts;
  if (args.mock) posts = await mockFeed();
  else if (token) posts = await graphFeed(token, config.limit ?? 25);
  else if (config.urls?.length) posts = await urlFeed(config.urls);
  else {
    console.error(
      "No Instagram source: set IG_ACCESS_TOKEN in .env, add post URLs to instagram.config.json, or run `npm run sync:ig -- --mock`.",
    );
    process.exit(1);
  }
  if (args.list) {
    for (const item of flatten(posts))
      console.log(
        `${item.id}\t${item.timestamp?.slice(0, 10) ?? "—"}\t${item.caption.split("\n")[0].slice(0, 60)}`,
      );
  } else {
    const photos = await syncInstagram({
      posts,
      select: args.mock ? [] : (config.select ?? []),
      publicDir: args.out && path.resolve(args.out),
    });
    const imported = photos.filter((photo) => photo.permalink).length;
    console.log(`Synced ${imported} Instagram photographs; manifest has ${photos.length} → photos.json`);
  }
}
