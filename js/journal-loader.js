/**
 * journal-loader.js
 * Sayanth Sudheesh Photography Portfolio
 *
 * Fetches the 4 editorial entry images from the `journal_images` table and
 * replaces the static <img> elements on journal.html.
 *
 * DB schema for journal_images:
 *   id, entry_slug TEXT UNIQUE, storage_url TEXT, alt_text TEXT,
 *   css_classes TEXT, updated_at TIMESTAMPTZ
 *
 * HTML contract:
 *   Each entry <img> must carry data-entry-slug matching the DB row:
 *     <img data-entry-slug="obsidian-range" src="./images/..." alt="..." class="entry-img ...">
 *
 * The `css_classes` column value is appended to the existing img class list
 * so classes like "grayscale brightness-75" survive the migration.
 *
 * Depends on:
 *   - window.supabase  (Supabase CDN <script>)
 *   - js/supabase.js   (exports `supabase` client)
 *
 * Usage: <script type="module" src="./js/journal-loader.js"></script>
 */

import { supabase } from './supabase.js';

async function loadJournalImages() {
  const { data, error } = await supabase
    .from('journal_images')
    .select('entry_slug, storage_url, alt_text, css_classes');

  if (error || !data || data.length === 0) {
    console.error('[journal-loader] Failed to fetch journal images:', error?.message);
    return;
  }

  // Build slug → row map
  const map = {};
  data.forEach(row => { map[row.entry_slug] = row; });

  document.querySelectorAll('img[data-entry-slug]').forEach(img => {
    const row = map[img.dataset.entrySlug];
    if (!row) return;

    img.src = row.storage_url;
    if (row.alt_text) img.alt = row.alt_text;

    // Apply stored CSS classes (e.g. "grayscale brightness-75") if any
    if (row.css_classes) {
      row.css_classes.split(' ').forEach(cls => {
        if (cls) img.classList.add(cls);
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', loadJournalImages);
