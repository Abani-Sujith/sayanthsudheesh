/**
 * supabase.js — Supabase client initialisation
 * Sayanth Sudheesh Photography Portfolio
 *
 * This file is the single source of truth for the Supabase connection.
 * All other JS modules import `supabase` from here.
 *
 * SETUP: Replace the two placeholder strings below with your real values.
 * Find them at: Supabase Dashboard → Settings → API
 *
 * These values are PUBLIC — the anon key is safe in client-side JS.
 * Supabase Row Level Security (RLS) enforces all access control.
 * NEVER put the service_role key in this file.
 */

// ── Supabase SDK loaded via CDN in HTML files: ──────────────────────────────
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
// The global `window.supabase` is created by that script, then we use
// `supabase.createClient()` to initialise our project-specific client.

const SUPABASE_URL     = 'https://jmclspgxnsfkjqxysizh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptY2xzcGd4bnNma2pxeHlzaXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMDM2NDEsImV4cCI6MjA5Nzc3OTY0MX0.OTXC0igiNCFKJj1zn1MTLTpMXHp32wrxdyzqklSHYHM';

// Validate at runtime so misconfigured deploys fail loudly.
if (SUPABASE_URL.includes('https://jmclspgxnsfkjqxysizh.supabase.co') || SUPABASE_ANON_KEY.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptY2xzcGd4bnNma2pxeHlzaXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMDM2NDEsImV4cCI6MjA5Nzc3OTY0MX0.OTXC0igiNCFKJj1zn1MTLTpMXHp32wrxdyzqklSHYHM')){
  console.error(
    '[supabase.js] ⚠️  Placeholder values detected.\n' +
    'Replace SUPABASE_URL and SUPABASE_ANON_KEY with your real project credentials.\n' +
    'See SUPABASE_SETUP.md for instructions.'
  );
}

/**
 * The initialised Supabase client (anon / public).
 * Use for all visitor-facing read operations.
 *
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Visitors are always anonymous — no auto-login, no session persistence.
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * Creates a temporary Supabase client authenticated with the service role key.
 * For use in /admin/index.html ONLY — key is passed in per session, never stored.
 *
 * @param {string} serviceRoleKey — entered manually by admin, lives only in memory
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createAdminClient(serviceRoleKey) {
  if (!serviceRoleKey || serviceRoleKey.trim() === '') {
    throw new Error('[supabase.js] Admin client requires a non-empty service role key.');
  }
  return window.supabase.createClient(SUPABASE_URL, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ── Utility: Build a public Storage URL from a bucket path ──────────────────
// Use this if you ever need to construct a URL manually.
// In practice, storage_url columns in the DB already contain the full URL.

/**
 * Returns the public CDN URL for a file in the portfolio-images bucket.
 * @param {string} path — e.g. "nature/nature_mountain.jpg"
 * @returns {string}
 */
export function storageUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/portfolio-images/${path}`;
}
