/**
 * gallery.js — Dynamic gallery loader for Pattern B pages
 * Sayanth Sudheesh Photography Portfolio
 *
 * Used by: nature.html, macro.html, cultural.html, product.html
 *
 * Each page must have:
 *   - <body data-category="nature|macro|cultural|product">
 *   - <div class="masonry-grid" id="masonry-grid">
 *   - <div id="gallery-loading"> inside the grid (removed after fetch)
 *   - window.galleryImages referenced by the inline updateLightbox() function
 *
 * Depends on: js/supabase.js  (loaded via <script type="module"> before this file,
 *             or imported below — both work because ES modules are cached per-origin)
 */

import { supabase } from './supabase.js';

// ── Public state — read by the inline lightbox JS via window.galleryImages ──
// Populated synchronously inside renderGrid() before any click is possible.
window.galleryImages = [];

// ── Constants ────────────────────────────────────────────────────────────────
const GRID_ID    = 'masonry-grid';
const LOADING_ID = 'gallery-loading';

// ── HTML builder ─────────────────────────────────────────────────────────────

/**
 * Escapes a string for safe injection into HTML text nodes and attributes.
 * Prevents stored XSS from malicious or malformed database values.
 *
 * @param {*} str — value from the database (may be null / undefined)
 * @returns {string} — HTML-safe string
 */
function esc(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds the full HTML string for one masonry grid item.
 * Mirrors the exact class structure from the original static HTML so that
 * gallery-system.css, hover transitions, and lightbox click handling
 * all work without any CSS changes.
 *
 * @param {Object} photo  — row from the `photos` Supabase table
 * @param {number} index  — zero-based position in the sorted array
 * @returns {string}      — HTML string for one <div class="masonry-item ...">
 */
function buildItemHTML(photo, index) {
  // subtitle is optional — omit the <span> entirely if NULL / empty string
  const subtitleHTML = photo.subtitle
    ? `<span class="text-xs text-white/60 uppercase tracking-widest mb-1 block">${esc(photo.subtitle)}</span>`
    : '';

  // alt_text falls back to title for accessibility (fixes cultural.html regression)
  const alt = (photo.alt_text || photo.title || '').replace(/"/g, '&quot;');

  return `
    <div
      class="masonry-item relative group overflow-hidden cursor-pointer gallery-item"
      data-index="${index}"
      data-id="${photo.id}"
    >
      <img
        src="${photo.storage_url}"
        alt="${alt}"
        class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        loading="lazy"
      />
      <div class="image-overlay absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-6">
        ${subtitleHTML}
        <h3 class="text-white font-light text-lg tracking-wide">${esc(photo.title)}</h3>
      </div>
    </div>`.trim();
}

// ── Grid renderer ─────────────────────────────────────────────────────────────

/**
 * Removes the loading skeleton, injects photo cards into #masonry-grid,
 * populates window.galleryImages for the lightbox, and re-attaches
 * .gallery-item click listeners.
 *
 * @param {Object[]} photos — array of rows from Supabase, already sorted by sort_order
 */
function renderGrid(photos) {
  const grid = document.getElementById(GRID_ID);
  if (!grid) {
    console.error('[gallery.js] #masonry-grid element not found.');
    return;
  }

  // Remove loading skeleton
  const skeleton = document.getElementById(LOADING_ID);
  if (skeleton) skeleton.remove();

  // Build and inject all cards
  grid.innerHTML = photos.map((photo, i) => buildItemHTML(photo, i)).join('\n');

  // Populate global lightbox array
  // Shape matches what the existing inline updateLightbox() expects:
  // { src, title, location, camera }
  window.galleryImages = photos.map(photo => ({
    src:      photo.storage_url,
    title:    photo.title    || '',
    location: photo.location || '',
    camera:   photo.camera   || '',
  }));

  // Re-attach click listeners — the inline openLightbox(index) function
  // was bound at parse time on static elements that no longer exist.
  // querySelectorAll runs on the freshly-injected nodes.
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index, 10);
      if (typeof window.openLightbox === 'function') {
        window.openLightbox(idx);
      }
    });
  });
}

// ── Error state ───────────────────────────────────────────────────────────────

/**
 * Replaces the loading skeleton with a visible error message.
 * Uses the same base classes as the grid so layout is not broken.
 *
 * @param {string} message — error detail (logged to console; a generic
 *                           user-facing message is shown in the UI)
 */
function showError(message) {
  console.error('[gallery.js] Gallery load failed:', message);

  const grid = document.getElementById(GRID_ID);
  if (!grid) return;

  const skeleton = document.getElementById(LOADING_ID);
  if (skeleton) skeleton.remove();

  grid.innerHTML = `
    <div class="col-span-full flex flex-col items-center justify-center py-24 text-white/40">
      <span class="material-symbols-outlined text-5xl mb-4">image_not_supported</span>
      <p class="text-sm tracking-widest uppercase">Unable to load gallery</p>
      <p class="text-xs mt-2 opacity-60">Please refresh the page to try again.</p>
    </div>`.trim();
}

// ── Main fetch ────────────────────────────────────────────────────────────────

/**
 * Reads the page category from <body data-category="...">,
 * fetches the matching photos from Supabase ordered by sort_order,
 * then hands off to renderGrid() or showError().
 */
async function loadGallery() {
  const category = document.body.dataset.category;
  console.log('[gallery.js] loadGallery() called, category:', category);

  if (!category) {
    showError('No data-category attribute found on <body>. Cannot determine which photos to load.');
    return;
  }

  const { data, error } = await supabase
    .from('photos')
    .select('id, storage_url, title, subtitle, alt_text, location, camera, sort_order')
    .eq('category', category)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  console.log('[gallery.js] Supabase result — rows:', data?.length, 'error:', error?.message);

  if (error) {
    showError(error.message);
    return;
  }

  if (!data || data.length === 0) {
    // Try without is_active filter to diagnose
    const { data: all } = await supabase.from('photos').select('id,title,is_active,category').eq('category', category).limit(5);
    console.warn('[gallery.js] No active photos. Sample rows (no filter):', JSON.stringify(all));
    showError(`No active photos found for category "${category}".`);
    return;
  }

  renderGrid(data);
}

// ── Entry point ───────────────────────────────────────────────────────────────
// ES modules are deferred by default, so the DOM is ready when this runs.

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadGallery);
} else {
  loadGallery();
}

// ── Debug: log gallery load status to console ──
// Remove this block after confirming gallery loads correctly
