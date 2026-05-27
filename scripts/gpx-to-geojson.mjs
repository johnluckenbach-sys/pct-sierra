/**
 * Converts CalTopo GPX exports → 3D GeoJSON (with elevation baked in).
 *
 * Usage:
 *   npm run gpx
 *
 * Drop your .gpx files into:
 *   public/routes/gpx/
 *
 * Outputs to:
 *   public/routes/<same-name>.geojson
 *
 * The output GeoJSON includes:
 *   - LineString with [lon, lat, elevation_meters] coordinates (used by the elevation profile)
 *   - Point features for each waypoint, with normalized title/description properties
 */

import { gpx } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GPX_DIR  = join(__dirname, '..', 'public', 'routes', 'gpx');
const OUT_DIR  = join(__dirname, '..', 'public', 'routes');

// Keep up to MAX_PTS track points — enough for a smooth elevation profile
// while keeping file size and map render fast.
const MAX_PTS = 500;

function sampleCoords(coords, max) {
  if (coords.length <= max) return coords;
  const step = Math.ceil(coords.length / max);
  const out = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
  if (out[out.length - 1] !== coords[coords.length - 1]) out.push(coords[coords.length - 1]);
  return out;
}

// @tmcw/togeojson uses GPX field names (name, desc, sym).
// Normalize to the property names our Map component expects (title, description).
function normalizeWaypoint(feature) {
  const p = feature.properties ?? {};
  return {
    ...feature,
    properties: {
      ...p,
      title:       p.name  ?? p.title  ?? 'Waypoint',
      description: p.desc  ?? p.description ?? '',
    },
  };
}

async function convertFile(gpxPath) {
  const raw = await readFile(gpxPath, 'utf8');
  const dom = new DOMParser().parseFromString(raw, 'text/xml');
  const fc  = gpx(dom);

  const lines     = fc.features.filter(f =>
    f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'
  );
  const waypoints = fc.features.filter(f => f.geometry?.type === 'Point');

  if (!lines.length) {
    console.warn(`  ⚠ No track found in ${basename(gpxPath)} — skipping`);
    return;
  }

  // Sample each LineString to MAX_PTS points
  const sampledLines = lines.map(f => ({
    ...f,
    geometry: f.geometry.type === 'LineString'
      ? { ...f.geometry, coordinates: sampleCoords(f.geometry.coordinates, MAX_PTS) }
      : f.geometry,
  }));

  // Check if elevation (Z) is present
  const firstCoord = sampledLines[0]?.geometry?.coordinates?.[0];
  const hasElevation = firstCoord?.length >= 3 && firstCoord[2] != null;

  const output = {
    type: 'FeatureCollection',
    features: [...sampledLines, ...waypoints.map(normalizeWaypoint)],
  };

  const outName = basename(gpxPath, extname(gpxPath)) + '.geojson';
  const outPath = join(OUT_DIR, outName);
  await writeFile(outPath, JSON.stringify(output));

  const pts = sampledLines[0]?.geometry?.coordinates?.length ?? 0;
  console.log(`✓  ${basename(gpxPath)}  →  ${outName}`);
  console.log(`   Track points : ${pts}${pts === MAX_PTS ? ' (sampled)' : ''}`);
  console.log(`   Elevation Z  : ${hasElevation ? 'yes ✓' : 'no — re-export as GPX from CalTopo to get elevation'}`);
  console.log(`   Waypoints    : ${waypoints.length}`);
}

async function main() {
  await mkdir(GPX_DIR, { recursive: true });

  const files   = await readdir(GPX_DIR);
  const gpxFiles = files.filter(f => extname(f).toLowerCase() === '.gpx');

  if (!gpxFiles.length) {
    console.log(`No .gpx files found in public/routes/gpx/`);
    console.log(`Export your route from CalTopo as GPX and drop it there, then run npm run gpx`);
    return;
  }

  for (const file of gpxFiles) {
    await convertFile(join(GPX_DIR, file));
  }
}

main().catch(console.error);
