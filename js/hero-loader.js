/**
 * hero-loader.js
 * Sayanth Sudheesh Photography Portfolio
 *
 * Fetches the single hero portrait from the `hero_image` table and
 * replaces the static <img> on index.html.
 *
 * Depends on:
 *   - window.supabase  (set by the Supabase CDN <script> tag)
 *   - js/supabase.js   (exports `supabase` client + `storageUrl`)
 *
 * Usage: <script type="module" src="./js/hero-loader.js"></script>
 * Must appear AFTER the Supabase CDN <script> tag.
 */

import { supabase } from './supabase.js';

const HERO_IMG_ID   = 'hero-portrait';   // id on the <img> element in index.html
const HERO_FALLBACK = './images/dfgd.jpg';

async function loadHero() {
  const img = document.getElementById(HERO_IMG_ID);
  if (!img) {
    console.warn('[hero-loader] No element with id="hero-portrait" found.');
    return;
  }

  const { data, error } = await supabase
    .from('hero_image')
    .select('storage_url, alt_text')
    .limit(1)
    .single();

  if (error || !data) {
    console.error('[hero-loader] Failed to fetch hero image:', error?.message);
    // Keep the existing fallback src already in the HTML
    return;
  }

  // Swap src and alt — preserve all other attributes (class, style, etc.)
  img.src = data.storage_url;
  if (data.alt_text) img.alt = data.alt_text;
}

document.addEventListener('DOMContentLoaded', loadHero);
