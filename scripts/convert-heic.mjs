// Run with: node scripts/convert-heic.mjs
// Converts all HEIC files under public/images/ to JPG and deletes the originals.
import sharp from 'sharp';
import { readdir, unlink } from 'fs/promises';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const imagesRoot = join(__dirname, '..', 'public', 'images');

async function findHeic(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findHeic(full));
    } else if (extname(entry.name).toLowerCase() === '.heic') {
      files.push(full);
    }
  }
  return files;
}

const files = await findHeic(imagesRoot);

if (files.length === 0) {
  console.log('No HEIC files found.');
  process.exit(0);
}

for (const file of files) {
  const out = file.replace(/\.heic$/i, '.jpg');
  try {
    await sharp(file).jpeg({ quality: 85 }).toFile(out);
    await unlink(file);
    console.log(`✓ ${basename(file)} → ${basename(out)}`);
  } catch (err) {
    console.error(`✗ ${basename(file)}: ${err.message}`);
  }
}

console.log(`\nDone. Converted ${files.length} file(s).`);
