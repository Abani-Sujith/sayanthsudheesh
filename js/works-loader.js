/**
 * works-loader.js
 * Sayanth Sudheesh Photography Portfolio
 *
 * Fetches category preview thumbnails from the `preview_images` table and
 * injects them into the 4 category cards on works.html.
 *
 * DB schema for preview_images:
 *   id, category TEXT, slot INT (1|2), storage_url TEXT, alt_text TEXT
 *
 * HTML contract:
 *   Each .cat-thumb <img> must carry data-category and data-slot attributes:
 *     <img data-category="nature" data-slot="1" src="./images/..." alt="...">
 *
 * Depends on:
 *   - window.supabase  (Supabase CDN <script>)
 *   - js/supabase.js   (exports `supabase` client)
 *
 * Usage: <script type="module" src="./js/works-loader.js"></script>
 */

import { supabase } from './supabase.js';

async function loadWorksPreviews() {
  const { data, error } = await supabase
    .from('preview_images')
    .select('category, slot, storage_url, alt_text')
    .order('category')
    .order('slot');

  if (error || !data || data.length === 0) {
    console.error('[works-loader] Failed to fetch preview images:', error?.message);
    return;
  }

  // Build a lookup map: { "nature_1": row, "nature_2": row, ... }
  const map = {};
  data.forEach(row => {
    map[`${row.category}_${row.slot}`] = row;
  });

  // Update every <img data-category data-slot> in the page
  document.querySelectorAll('img[data-category][data-slot]').forEach(img => {
    const key = `${img.dataset.category}_${img.dataset.slot}`;
    const row = map[key];
    if (!row) return; // No DB row for this slot — keep fallback
    img.src = row.storage_url;
    if (row.alt_text) img.alt = row.alt_text;
  });
}

document.addEventListener('DOMContentLoaded', loadWorksPreviews);
