/**
 * Fetches trip metadata from a published Google Sheet CSV.
 *
 * Setup:
 *   1. In Google Sheets: File → Share → Publish to web
 *      → select your sheet → CSV → Publish
 *   2. Copy the URL and add to .env:
 *      SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/.../pub?output=csv
 *
 * Sheet columns (header row required, order doesn't matter):
 *   slug | title | year | startDate | endDate | days | miles |
 *   elevationGain | startPoint | endPoint | pctMileStart | pctMileEnd |
 *   description | tags
 *
 * The slug must match the MDX filename exactly (e.g. 2023-kms-to-olancha).
 * Tags should be comma-separated within the cell (e.g. "solo, sierra, permit").
 * Empty cells are ignored — MDX values are used as fallback.
 */

export interface SheetTrip {
  slug:           string;
  title?:         string;
  year?:          number;
  startDate?:     string;
  endDate?:       string;
  days?:          number;
  miles?:         number;
  elevationGain?: number;
  startPoint?:    string;
  endPoint?:      string;
  pctMileStart?:  number;
  pctMileEnd?:    number;
  description?:   string;
  tags?:          string[];
}

// ── CSV parser ────────────────────────────────────────────────────────────────
// Handles quoted fields (commas and newlines inside quotes).
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Escaped quote inside quoted field
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = parseCSVLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
      return row;
    });
}

// ── Fetch + build lookup map ──────────────────────────────────────────────────
export async function fetchTripSheet(url: string): Promise<Record<string, SheetTrip>> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = parseCSV(await res.text());
    const map: Record<string, SheetTrip> = {};

    for (const row of rows) {
      const slug = row['slug'];
      if (!slug) continue;

      const trip: SheetTrip = { slug };

      const str  = (key: string) => row[key] || undefined;
      const int  = (key: string) => row[key] ? parseInt(row[key],  10) || undefined : undefined;
      const flt  = (key: string) => row[key] ? parseFloat(row[key])   || undefined : undefined;
      const tags = (key: string) => row[key]
        ? row[key].split(',').map(t => t.trim()).filter(Boolean)
        : undefined;

      trip.title         = str('title');
      trip.year          = int('year');
      trip.startDate     = str('startdate')  ?? str('startDate');
      trip.endDate       = str('enddate')    ?? str('endDate');
      trip.days          = int('days');
      trip.miles         = flt('miles');
      trip.elevationGain = int('elevationgain') ?? int('elevationGain');
      trip.startPoint    = str('startpoint') ?? str('startPoint');
      trip.endPoint      = str('endpoint')   ?? str('endPoint');
      trip.pctMileStart  = int('pctmilestart') ?? int('pctMileStart');
      trip.pctMileEnd    = int('pctmileend')   ?? int('pctMileEnd');
      trip.description   = str('description');
      trip.tags          = tags('tags');

      // Strip undefined keys so spread merge works cleanly
      (Object.keys(trip) as (keyof SheetTrip)[]).forEach(k => {
        if (trip[k] === undefined) delete trip[k];
      });

      map[slug] = trip;
    }

    console.log(`[TripSheet] Loaded ${Object.keys(map).length} rows`);
    return map;
  } catch (err) {
    console.warn('[TripSheet] Could not fetch sheet — using MDX values only:', err);
    return {};
  }
}

// ── Merge helper ──────────────────────────────────────────────────────────────
// Sheet values override MDX values; undefined/empty sheet fields are ignored.
export function mergeSheetData<T extends object>(mdx: T, sheet: Partial<T> | undefined): T {
  if (!sheet) return mdx;
  return { ...mdx, ...sheet };
}
