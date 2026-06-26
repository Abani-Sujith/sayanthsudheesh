/**
 * showcase-loader.js
 * Sayanth Sudheesh Photography Portfolio
 *
 * Replaces the hardcoded `collections` JS object in showcase.html, detail.html,
 * and angle-preview.html with live data from Supabase.
 *
 * Pages that use this module read `window.collectionsReady` (a Promise) before
 * accessing `window.collections`.  Each page's existing `initPage()` /
 * `window.addEventListener('DOMContentLoaded', ...)` is preserved — this module
 * simply resolves the data before those functions run.
 *
 * Data shape exposed on window.collections (matches the hardcoded format exactly):
 *
 *   window.collections = {
 *     nature: {
 *       name: 'NATURE',
 *       collectionLabel: 'COLLECTION_004',
 *       description: '...',
 *       tags: [...],
 *       images: [
 *         { src, title, location, camera }     // showcase.html / detail.html
 *         // OR with angle fields:
 *         { src, title, location, camera, angle, angleLabel }  // angle-preview.html
 *       ]
 *     },
 *     ...
 *   }
 *
 * For angle-preview.html, each image entry is drawn from `photo_angles` joined
 * to `photos`.  The page is detected via document.body.dataset.page === 'angle-preview'.
 *
 * Depends on:
 *   - window.supabase  (Supabase CDN <script>)
 *   - js/supabase.js   (exports `supabase` client)
 *
 * Usage: <script type="module" src="./js/showcase-loader.js"></script>
 *        Must appear BEFORE the inline <script> that calls initPage() or
 *        uses the collections object, with DOMContentLoaded as the sync point.
 */

import { supabase } from './supabase.js';

// ── Static collection metadata (unchanged from original hardcoded data) ──────
const COLLECTION_META = {
  nature: {
    name: 'NATURE',
    collectionLabel: 'COLLECTION_004',
    description: "A documentation of earth's quietest whispers. From the monolithic presence of ancient ridges to the fragile geometry of forest floors — each frame is a meditation on scale, silence, and the sublime authority of the natural world.",
    tags: ['Landscape', 'Fine Art', 'Wilderness', 'Long Exposure', 'Aerial'],
  },
  macro: {
    name: 'MACRO',
    collectionLabel: 'COLLECTION_002',
    description: 'At 1:1 magnification, the ordinary becomes extraordinary. This series ventures into the microscopic architecture of the natural world — crystalline lattices, oxidised surfaces, dew-laden geometries — revealing a universe invisible to the naked eye.',
    tags: ['Macro', 'Abstract', 'Scientific', 'Close-Up', 'Texture'],
  },
  product: {
    name: 'PRODUCT',
    collectionLabel: 'COLLECTION_001',
    description: 'Where form becomes narrative. Studio-crafted product imagery that transcends functional documentation — each shot a minimalist composition that reveals the soul of an object. Clean, precise, and deliberately theatrical.',
    tags: ['Product', 'Studio', 'Commercial', 'Still Life', 'Editorial'],
  },
  cultural: {
    name: 'CULTURAL',
    collectionLabel: 'COLLECTION_003',
    description: "Humanity's most intimate ceremonies and rituals, observed from a respectful distance. These images honour the dignity of tradition — the incense smoke of Kyoto, the silver regalia of Miao villages, the sacred dust of Varanasi ghats.",
    tags: ['Documentary', 'Portraiture', 'Travel', 'Ethnographic', 'Leica'],
  },
};

const CATEGORIES = ['nature', 'macro', 'product', 'cultural'];
const PAGE_MODE   = document.body.dataset.page; // 'angle-preview' sets this

// ── Fetch helpers ─────────────────────────────────────────────────────────────

/**
 * Fetches all gallery photos for standard showcase / detail pages.
 * Returns { nature: [{src,title,location,camera},...], macro: [...], ... }
 */
async function fetchPhotos() {
  const { data, error } = await supabase
    .from('photos')
    .select('category, storage_url, title, location, camera, sort_order')
    .in('category', CATEGORIES)
    .eq('is_active', true)
    .order('category')
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`[showcase-loader] photos fetch failed: ${error.message}`);

  const byCategory = { nature: [], macro: [], product: [], cultural: [] };
  (data || []).forEach(row => {
    if (!byCategory[row.category]) return;
    byCategory[row.category].push({
      src:      row.storage_url,
      title:    row.title,
      location: row.location,
      camera:   row.camera,
    });
  });
  return byCategory;
}

/**
 * Fetches photos joined with their angle variants for angle-preview.html.
 * Returns { nature: [{src,title,location,camera,angle,angleLabel},...], ... }
 *
 * Join strategy: fetch photo_angles with an inner join to photos.
 * Each angle variant becomes one entry in the images array.
 * Photos with no angle rows are excluded (angle-preview requires angle data).
 */
async function fetchPhotosWithAngles() {
  const { data, error } = await supabase
    .from('photo_angles')
    .select(`
      angle,
      angle_label,
      storage_url,
      sort_order,
      photos (
        category,
        title,
        location,
        camera,
        sort_order,
        is_active
      )
    `)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`[showcase-loader] photo_angles fetch failed: ${error.message}`);

  const byCategory = { nature: [], macro: [], product: [], cultural: [] };

  (data || []).forEach(row => {
    const photo = row.photos;
    if (!photo || !photo.is_active) return;
    const cat = photo.category;
    if (!byCategory[cat]) return;
    byCategory[cat].push({
      src:        row.storage_url,
      title:      photo.title,
      location:   photo.location,
      camera:     photo.camera,
      angle:      row.angle,
      angleLabel: row.angle_label,
    });
  });

  // For categories with no angle data, fall back to plain photos so the page
  // still renders rather than showing empty collections.
  const hasAngles = CATEGORIES.some(cat => byCategory[cat].length > 0);
  if (!hasAngles) {
    console.warn('[showcase-loader] No photo_angles data found — falling back to photos table.');
    return fetchPhotos(); // returns without angle fields; angle-preview degrades gracefully
  }

  return byCategory;
}

// ── Build window.collections ──────────────────────────────────────────────────

async function buildCollections() {
  const imagesByCategory = PAGE_MODE === 'angle-preview'
    ? await fetchPhotosWithAngles()
    : await fetchPhotos();

  const result = {};
  CATEGORIES.forEach(cat => {
    result[cat] = {
      ...COLLECTION_META[cat],
      images: imagesByCategory[cat] || [],
    };
  });
  return result;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// Expose a Promise so inline page scripts can await data readiness before init.
window.collectionsReady = buildCollections()
  .then(collections => {
    window.collections = collections;
    return collections;
  })
  .catch(err => {
    console.error('[showcase-loader]', err.message);
    // Expose an empty shell so page scripts don't crash on missing keys
    window.collections = {};
    CATEGORIES.forEach(cat => {
      window.collections[cat] = { ...COLLECTION_META[cat], images: [] };
    });
    return window.collections;
  });
