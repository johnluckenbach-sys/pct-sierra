/**
 * Syncs Cloudinary photo IDs into MDX frontmatter.
 *
 * - Fetches all images under the trips/ asset folder from Cloudinary
 *   (via the Search API, matched against asset_folder — this account
 *   uses Dynamic Folders, so folder path is not part of the public_id)
 * - Groups them by trip slug (asset_folder subfolder name)
 * - Updates each matching MDX file's photos: array
 * - Preserves existing alt/caption values you've already written
 * - Adds new photos (no alt/caption — fill those in manually)
 *
 * Usage:
 *   CLOUDINARY_API_KEY=xxx CLOUDINARY_API_SECRET=yyy node scripts/sync-photos.mjs
 *
 * Or add to .env.local:
 *   CLOUDINARY_API_KEY=xxx
 *   CLOUDINARY_API_SECRET=xxx
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir      = dirname(fileURLToPath(import.meta.url));
const TRIPS_DIR  = join(__dir, '../src/content/trips');
const CLOUD_NAME = 'dmpvggpzz';

// ── Load credentials ──────────────────────────────────────────────────────────
const API_KEY    = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!API_KEY || !API_SECRET) {
  console.error('Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET env vars.');
  process.exit(1);
}

// ── Fetch all images under the trips/ asset folder ────────────────────────────
// Uses the Search API (not the older prefix-based resources list) because this
// account uses Dynamic Folders — folder path lives in `asset_folder`, not baked
// into `public_id` (public_id is just e.g. "IMG_6722_g94qhw").
async function fetchCloudinaryPhotos() {
  const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');
  const resources = [];
  let next_cursor;

  do {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/search`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expression: 'asset_folder:trips/*',
        max_results: 500,
        sort_by: [{ public_id: 'asc' }],
        ...(next_cursor ? { next_cursor } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Cloudinary API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    resources.push(...data.resources);
    next_cursor = data.next_cursor;
  } while (next_cursor);

  // e.g. { id: "IMG_6722_g94qhw", folder: "Trips/desolation-loop" }
  return resources.map(r => ({ id: r.public_id, folder: r.asset_folder }));
}

// ── Group photo IDs by trip slug ──────────────────────────────────────────────
function groupBySlug(photos) {
  const map = {};
  for (const { id, folder } of photos) {
    if (!folder) continue;
    const parts = folder.split('/'); // ["Trips", "desolation-loop"]
    if (parts.length < 2) continue;
    const slug = parts[1].toLowerCase();
    if (!map[slug]) map[slug] = [];
    map[slug].push(id);
  }
  return map;
}

// ── Parse existing photos: block from frontmatter ─────────────────────────────
// Returns array of { id, alt, caption } objects
function parseExistingPhotos(frontmatter) {
  const match = frontmatter.match(/^photos:\s*\n((?:[ \t]+-[^\n]*\n(?:[ \t]+[^\n]+\n)*)*)/m);
  if (!match) return [];

  const photos = [];
  const block  = match[1];
  const items  = block.split(/(?=[ \t]+-\s)/);

  for (const item of items) {
    const idMatch      = item.match(/id:\s*(.+)/);
    const altMatch     = item.match(/alt:\s*(.+)/);
    const captionMatch = item.match(/caption:\s*(.+)/);
    if (idMatch) {
      photos.push({
        id:      idMatch[1].trim(),
        alt:     altMatch     ? altMatch[1].trim()     : undefined,
        caption: captionMatch ? captionMatch[1].trim() : undefined,
      });
    }
  }
  return photos;
}

// ── Build a photos: YAML block ────────────────────────────────────────────────
function buildPhotosYaml(photos) {
  if (!photos.length) return '';
  const lines = ['photos:'];
  for (const p of photos) {
    lines.push(`  - id: ${p.id}`);
    if (p.alt)     lines.push(`    alt: ${p.alt}`);
    if (p.caption) lines.push(`    caption: ${p.caption}`);
  }
  return lines.join('\n') + '\n';
}

// ── Merge: keep existing alt/caption, append new IDs ─────────────────────────
function mergePhotos(existing, incoming) {
  const byId = Object.fromEntries(existing.map(p => [p.id, p]));
  const result = [];

  // Keep existing order first, preserving alt/caption
  for (const id of incoming) {
    result.push(byId[id] ?? { id });
  }

  // Keep any manually added entries not in Cloudinary
  for (const p of existing) {
    if (!incoming.includes(p.id)) result.push(p);
  }

  return result;
}

// ── Update a single MDX file ──────────────────────────────────────────────────
function updateMdx(filePath, incomingIds) {
  const content = readFileSync(filePath, 'utf-8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return;

  const frontmatter  = fmMatch[1];
  const existing     = parseExistingPhotos(frontmatter);
  const merged       = mergePhotos(existing, incomingIds);
  const photosBlock  = buildPhotosYaml(merged);

  // Replace existing photos: block or append before closing ---
  let newFrontmatter;
  if (/^photos:/m.test(frontmatter)) {
    newFrontmatter = frontmatter.replace(
      /^photos:\s*\n((?:[ \t]+-[^\n]*\n(?:[ \t]+[^\n]+\n)*)*)/m,
      photosBlock
    );
  } else {
    newFrontmatter = frontmatter.trimEnd() + '\n' + photosBlock;
  }

  const updated = content.replace(fmMatch[1], newFrontmatter);
  writeFileSync(filePath, updated, 'utf-8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('Fetching photos from Cloudinary...');
const allIds    = await fetchCloudinaryPhotos();
console.log(`Found ${allIds.length} photos`);

const bySlug    = groupBySlug(allIds);
const mdxFiles  = readdirSync(TRIPS_DIR).filter(f => f.endsWith('.mdx'));
let updated     = 0;

for (const file of mdxFiles) {
  const slug = file.replace('.mdx', '');
  const ids  = bySlug[slug];
  if (!ids?.length) continue;

  updateMdx(join(TRIPS_DIR, file), ids);
  console.log(`  ✓ ${slug} — ${ids.length} photo(s)`);
  updated++;
}

console.log(`\nDone. Updated ${updated} trip file(s).`);
console.log('Review changes, fill in alt/caption where needed, then commit.');
