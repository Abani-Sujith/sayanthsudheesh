/**
 * admin.js — Admin panel logic
 * Sayanth Sudheesh Photography Portfolio
 *
 * Handles: authentication, image upload, replace, delete, metadata edit.
 * Depends on window.supabase (CDN global) and the same SUPABASE_URL /
 * SUPABASE_ANON_KEY used by the public site.
 *
 * Auth strategy: Supabase Email Auth (supabase.auth.signInWithPassword).
 * The authenticated session satisfies the RLS `auth.role() = 'authenticated'`
 * check for all write operations. No service role key is stored anywhere.
 *
 * Storage bucket: portfolio-images (public read, auth-only write).
 * DB tables written: photos (gallery categories).
 */

// ── Supabase credentials (same as js/supabase.js) ───────────────────────────
const SUPABASE_URL      = 'https://jmclspgxnsfkjqxysizh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptY2xzcGd4bnNma2pxeHlzaXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMDM2NDEsImV4cCI6MjA5Nzc3OTY0MX0.OTXC0igiNCFKJj1zn1MTLTpMXHp32wrxdyzqklSHYHM';
const BUCKET            = 'portfolio-images';

// ── Bucket folders that map to DB tables vs. Storage-only ───────────────────
// Categories that have rows in the `photos` table (full metadata):
const DB_CATEGORIES = new Set(['nature', 'macro', 'cultural', 'product']);
// Categories stored in Storage only (or other tables) — no `photos` row:
const STORAGE_ONLY_CATEGORIES = new Set(['hero', 'previews', 'journal']);

// ── Initialise Supabase client ───────────────────────────────────────────────
if (
  SUPABASE_URL.includes('https://jmclspgxnsfkjqxysizh.supabase.co') ||
  SUPABASE_ANON_KEY.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptY2xzcGd4bnNma2pxeHlzaXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMDM2NDEsImV4cCI6MjA5Nzc3OTY0MX0.OTXC0igiNCFKJj1zn1MTLTpMXHp32wrxdyzqklSHYHM')
) {
  console.error(
    '[admin.js] ⚠️  Placeholder credentials detected.\n' +
    'Replace SUPABASE_URL and SUPABASE_ANON_KEY with your real values.'
  );
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// ── State ────────────────────────────────────────────────────────────────────
let selectedPhoto   = null;   // currently selected photo card object
let allPhotos       = [];     // photos fetched for current filter
let pendingDeleteId = null;   // id awaiting confirm-modal confirmation
let uploadFile      = null;   // file staged in the Upload tab

// ── DOM refs ─────────────────────────────────────────────────────────────────
const authScreen      = document.getElementById('auth-screen');
const adminPanel      = document.getElementById('admin-panel');
const authEmail       = document.getElementById('auth-email');
const authPassword    = document.getElementById('auth-password');
const authBtn         = document.getElementById('auth-btn');
const authBtnLabel    = document.getElementById('auth-btn-label');
const authSpin        = document.getElementById('auth-spin');
const authError       = document.getElementById('auth-error');
const signOutBtn      = document.getElementById('sign-out-btn');
const adminEmailDisp  = document.getElementById('admin-email-display');

const fileInput         = document.getElementById('file-input');
const dropZone          = document.getElementById('drop-zone');
const previewImg        = document.getElementById('preview-img');
const selectedFileName  = document.getElementById('selected-file-name');
const uploadProgress    = document.getElementById('upload-progress');
const uploadProgressBar = document.getElementById('upload-progress-bar');
const uploadCategory    = document.getElementById('upload-category');
const uploadTitle       = document.getElementById('upload-title');
const uploadLocation    = document.getElementById('upload-location');
const uploadCamera      = document.getElementById('upload-camera');
const uploadAlt         = document.getElementById('upload-alt');
const uploadSort        = document.getElementById('upload-sort');
const uploadBtn         = document.getElementById('upload-btn');
const uploadBtnLabel    = document.getElementById('upload-btn-label');
const uploadSpin        = document.getElementById('upload-spin');

const filterCategory    = document.getElementById('filter-category');
const refreshBtn        = document.getElementById('refresh-btn');
const photoGrid         = document.getElementById('photo-grid');
const gridPlaceholder   = document.getElementById('grid-placeholder');
const selectedActions   = document.getElementById('selected-actions');
const selectedInfoTitle = document.getElementById('selected-info-title');
const selectedInfoCat   = document.getElementById('selected-info-cat');
const replaceFileInput  = document.getElementById('replace-file-input');
const toggleActiveBtn   = document.getElementById('toggle-active-btn');
const deleteBtn         = document.getElementById('delete-btn');
const editTitle         = document.getElementById('edit-title');
const editLocation      = document.getElementById('edit-location');
const editCamera        = document.getElementById('edit-camera');
const editSort          = document.getElementById('edit-sort');
const saveEditsBtn      = document.getElementById('save-edits-btn');

const confirmModal      = document.getElementById('confirm-modal');
const confirmTitle      = document.getElementById('confirm-title');
const confirmBody       = document.getElementById('confirm-body');
const confirmCancelBtn  = document.getElementById('confirm-cancel-btn');
const confirmOkBtn      = document.getElementById('confirm-ok-btn');

const statusBar         = document.getElementById('status-bar');

// ── Utilities ────────────────────────────────────────────────────────────────

let statusTimer = null;
function showStatus(msg, type = 'info', duration = 3500) {
  statusBar.textContent = msg;
  statusBar.className   = `show ${type}`;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { statusBar.className = ''; }, duration);
}

function setLoading(btn, labelEl, spinEl, loading) {
  btn.disabled        = loading;
  labelEl.style.opacity = loading ? '0' : '1';
  spinEl.classList.toggle('show', loading);
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function buildStoragePath(category, file) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const base = slugify(file.name.replace(/\.[^.]+$/, ''));
  const ts   = Date.now();
  return `${category}/${base}_${ts}.${ext}`;
}

function storageUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    showAdminPanel(session.user.email);
  }
}

function showAdminPanel(email) {
  authScreen.style.display    = 'none';
  adminPanel.style.display    = 'block';
  adminEmailDisp.textContent  = email;
  loadPhotos();
}

authBtn.addEventListener('click', async () => {
  const email    = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    authError.textContent = 'Please enter email and password.';
    authError.classList.remove('hidden');
    return;
  }

  setLoading(authBtn, authBtnLabel, authSpin, true);
  authError.classList.add('hidden');

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  setLoading(authBtn, authBtnLabel, authSpin, false);

  if (error) {
    authError.textContent = error.message || 'Sign-in failed.';
    authError.classList.remove('hidden');
    return;
  }

  showAdminPanel(data.user.email);
});

// Allow Enter key in auth form
[authEmail, authPassword].forEach(el => {
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') authBtn.click();
  });
});

signOutBtn.addEventListener('click', async () => {
  await sb.auth.signOut();
  adminPanel.style.display  = 'none';
  authScreen.style.display  = 'flex';
  authEmail.value           = '';
  authPassword.value        = '';
  deselectPhoto();
});

// ── Tabs ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'manage') loadPhotos();
  });
});

// ── Upload tab ───────────────────────────────────────────────────────────────

// File selection via click
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) stageFile(fileInput.files[0]);
});

// Drag and drop
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) stageFile(file);
});

function stageFile(file) {
  if (!file.type.startsWith('image/')) {
    showStatus('Only image files are accepted.', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showStatus('File exceeds 10 MB limit.', 'error');
    return;
  }
  uploadFile = file;
  selectedFileName.textContent = file.name;

  const reader = new FileReader();
  reader.onload = e => {
    previewImg.src     = e.target.result;
    previewImg.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

uploadBtn.addEventListener('click', handleUpload);

async function handleUpload() {
  const category = uploadCategory.value;
  const title    = uploadTitle.value.trim();

  if (!uploadFile)  { showStatus('Select an image first.', 'error'); return; }
  if (!category)    { showStatus('Choose a category.', 'error'); return; }
  if (!title)       { showStatus('Title is required.', 'error'); return; }

  setLoading(uploadBtn, uploadBtnLabel, uploadSpin, true);
  uploadProgress.classList.add('show');
  uploadProgressBar.style.width = '10%';

  try {
    const path = buildStoragePath(category, uploadFile);
    uploadProgressBar.style.width = '35%';

    // 1. Upload file to Storage
    const { error: storageErr } = await sb.storage
      .from(BUCKET)
      .upload(path, uploadFile, { contentType: uploadFile.type, upsert: false });

    if (storageErr) throw storageErr;
    uploadProgressBar.style.width = '65%';

    const url = storageUrl(path);

    // 2. Insert DB row (only for gallery categories)
    if (DB_CATEGORIES.has(category)) {
      const row = {
        category,
        title,
        filename: uploadFile.name, 
        location:    uploadLocation.value.trim()  || null,
        camera:      uploadCamera.value.trim()     || null,
        alt_text:    uploadAlt.value.trim()        || title,
        storage_url: url,
        sort_order:  parseInt(uploadSort.value, 10) || 0,
        is_active:   true,
      };

      const { error: dbErr } = await sb.from('photos').insert([row]);
      if (dbErr) {
        // Rollback storage upload on DB failure
        await sb.storage.from(BUCKET).remove([path]);
        throw dbErr;
      }
    }

    uploadProgressBar.style.width = '100%';
    showStatus(`"${title}" uploaded successfully.`, 'success');

    // Reset form
    uploadFile              = null;
    fileInput.value         = '';
    previewImg.style.display = 'none';
    previewImg.src          = '';
    selectedFileName.textContent = '';
    uploadTitle.value       = '';
    uploadLocation.value    = '';
    uploadCamera.value      = '';
    uploadAlt.value         = '';
    uploadSort.value        = '0';
    uploadCategory.value    = '';

  } catch (err) {
    console.error('[admin.js] Upload error:', err);
    showStatus(err.message || 'Upload failed.', 'error', 6000);
  } finally {
    setLoading(uploadBtn, uploadBtnLabel, uploadSpin, false);
    setTimeout(() => {
      uploadProgress.classList.remove('show');
      uploadProgressBar.style.width = '0%';
    }, 800);
  }
}

// ── Manage tab — load photos ─────────────────────────────────────────────────

filterCategory.addEventListener('change', loadPhotos);
refreshBtn.addEventListener('click', loadPhotos);

async function loadPhotos() {
  deselectPhoto();
  photoGrid.innerHTML = '';
  gridPlaceholder.textContent = 'Loading photos…';
  photoGrid.appendChild(gridPlaceholder);

  try {
    let query = sb
      .from('photos')
      .select('id, category, title, location, camera, alt_text, storage_url, sort_order, is_active')
      .order('category')
      .order('sort_order');

    const cat = filterCategory.value;
    if (cat) query = query.eq('category', cat);

    const { data, error } = await query;
    if (error) throw error;

    allPhotos = data || [];
    renderGrid(allPhotos);
  } catch (err) {
    console.error('[admin.js] Load error:', err);
    gridPlaceholder.textContent = 'Failed to load photos.';
    showStatus(err.message || 'Failed to load photos.', 'error', 6000);
  }
}

function renderGrid(photos) {
  photoGrid.innerHTML = '';

  if (!photos.length) {
    const empty = document.createElement('div');
    empty.className = 'col-span-full text-center py-16 text-white/20 text-sm';
    empty.textContent = 'No photos found.';
    photoGrid.appendChild(empty);
    return;
  }

  photos.forEach(photo => {
    const card = document.createElement('div');
    card.className = `photo-card ${photo.is_active ? '' : 'opacity-40'}`;
    card.dataset.id = photo.id;

    card.innerHTML = `
      <img src="${photo.storage_url}" alt="${photo.alt_text || photo.title}" loading="lazy" />
      <div class="card-overlay">
        <p class="text-xs font-medium leading-tight truncate">${photo.title}</p>
        <p class="text-xs text-white/50 mt-0.5 uppercase tracking-wider">${photo.category}</p>
        ${!photo.is_active ? '<p class="text-xs text-yellow-400/60 mt-0.5">Inactive</p>' : ''}
      </div>
    `;

    card.addEventListener('click', () => selectPhoto(photo, card));
    photoGrid.appendChild(card);
  });
}

// ── Photo selection ──────────────────────────────────────────────────────────

function selectPhoto(photo, cardEl) {
  // Deselect previous
  document.querySelectorAll('.photo-card.selected').forEach(c => c.classList.remove('selected'));
  cardEl.classList.add('selected');
  selectedPhoto = photo;

  // Populate action bar
  selectedInfoTitle.textContent = photo.title;
  selectedInfoCat.textContent   = `${photo.category} · sort ${photo.sort_order} · ${photo.is_active ? 'active' : 'inactive'}`;
  editTitle.value    = photo.title    || '';
  editLocation.value = photo.location || '';
  editCamera.value   = photo.camera   || '';
  editSort.value     = photo.sort_order ?? 0;
  toggleActiveBtn.textContent = photo.is_active ? 'Deactivate' : 'Activate';
  selectedActions.classList.remove('hidden');
}

function deselectPhoto() {
  selectedPhoto = null;
  document.querySelectorAll('.photo-card.selected').forEach(c => c.classList.remove('selected'));
  selectedActions.classList.add('hidden');
}

// ── Save metadata edits ──────────────────────────────────────────────────────

saveEditsBtn.addEventListener('click', async () => {
  if (!selectedPhoto) return;

  const updates = {
    title:      editTitle.value.trim()    || selectedPhoto.title,
    location:   editLocation.value.trim() || null,
    camera:     editCamera.value.trim()   || null,
    sort_order: parseInt(editSort.value, 10) ?? selectedPhoto.sort_order,
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await sb.from('photos').update(updates).eq('id', selectedPhoto.id);
    if (error) throw error;
    showStatus('Changes saved.', 'success');
    Object.assign(selectedPhoto, updates);
    selectedInfoTitle.textContent = selectedPhoto.title;
    selectedInfoCat.textContent   = `${selectedPhoto.category} · sort ${selectedPhoto.sort_order} · ${selectedPhoto.is_active ? 'active' : 'inactive'}`;
    // Refresh grid label
    const card = photoGrid.querySelector(`[data-id="${selectedPhoto.id}"]`);
    if (card) {
      const p = card.querySelector('.card-overlay p');
      if (p) p.textContent = selectedPhoto.title;
    }
  } catch (err) {
    console.error('[admin.js] Save error:', err);
    showStatus(err.message || 'Save failed.', 'error', 6000);
  }
});

// ── Toggle active ────────────────────────────────────────────────────────────

toggleActiveBtn.addEventListener('click', async () => {
  if (!selectedPhoto) return;
  const newActive = !selectedPhoto.is_active;

  try {
    const { error } = await sb
      .from('photos')
      .update({ is_active: newActive, updated_at: new Date().toISOString() })
      .eq('id', selectedPhoto.id);
    if (error) throw error;

    selectedPhoto.is_active = newActive;
    toggleActiveBtn.textContent = newActive ? 'Deactivate' : 'Activate';
    selectedInfoCat.textContent = `${selectedPhoto.category} · sort ${selectedPhoto.sort_order} · ${newActive ? 'active' : 'inactive'}`;

    const card = photoGrid.querySelector(`[data-id="${selectedPhoto.id}"]`);
    if (card) card.classList.toggle('opacity-40', !newActive);
    showStatus(newActive ? 'Photo activated.' : 'Photo deactivated.', 'info');
  } catch (err) {
    console.error('[admin.js] Toggle error:', err);
    showStatus(err.message || 'Toggle failed.', 'error', 6000);
  }
});

// ── Replace image ────────────────────────────────────────────────────────────

replaceFileInput.addEventListener('change', async () => {
  const file = replaceFileInput.files[0];
  if (!file || !selectedPhoto) return;

  if (file.size > 10 * 1024 * 1024) {
    showStatus('File exceeds 10 MB limit.', 'error');
    return;
  }

  showStatus('Uploading replacement…', 'info', 30000);

  try {
    // Derive path: keep same folder structure, same filename as original
    const oldUrl  = selectedPhoto.storage_url;
    // Extract bucket-relative path from the full URL
    const marker  = `/object/public/${BUCKET}/`;
    const oldPath = oldUrl.includes(marker) ? oldUrl.split(marker)[1] : null;

    let newPath;
    if (oldPath) {
      // Overwrite in-place → Storage CDN URL stays valid (no DB update needed)
      newPath = oldPath;
    } else {
      newPath = buildStoragePath(selectedPhoto.category, file);
    }

    const { error: storageErr } = await sb.storage
      .from(BUCKET)
      .upload(newPath, file, { contentType: file.type, upsert: true });

    if (storageErr) throw storageErr;

    // If path changed (fallback), update DB row with new URL
    if (newPath !== oldPath) {
      const newUrl = storageUrl(newPath);
      const { error: dbErr } = await sb
        .from('photos')
        .update({ storage_url: newUrl, updated_at: new Date().toISOString() })
        .eq('id', selectedPhoto.id);
      if (dbErr) throw dbErr;
      selectedPhoto.storage_url = newUrl;

      // Update card thumbnail
      const card = photoGrid.querySelector(`[data-id="${selectedPhoto.id}"] img`);
      if (card) card.src = newUrl;
    } else {
      // Bust the browser cache by appending a timestamp query string to the img src
      const card = photoGrid.querySelector(`[data-id="${selectedPhoto.id}"] img`);
      if (card) card.src = `${oldUrl}?t=${Date.now()}`;
    }

    showStatus('Image replaced successfully.', 'success');
  } catch (err) {
    console.error('[admin.js] Replace error:', err);
    showStatus(err.message || 'Replace failed.', 'error', 6000);
  } finally {
    replaceFileInput.value = '';
  }
});

// ── Delete ───────────────────────────────────────────────────────────────────

deleteBtn.addEventListener('click', () => {
  if (!selectedPhoto) return;
  pendingDeleteId     = selectedPhoto.id;
  confirmTitle.textContent = 'Delete Photo';
  confirmBody.textContent  = `Permanently delete "${selectedPhoto.title}"? This removes the file from Storage and the database row. This cannot be undone.`;
  confirmModal.classList.add('show');
});

confirmCancelBtn.addEventListener('click', () => {
  confirmModal.classList.remove('show');
  pendingDeleteId = null;
});

confirmOkBtn.addEventListener('click', async () => {
  confirmModal.classList.remove('show');
  if (!pendingDeleteId) return;

  const photo = allPhotos.find(p => p.id === pendingDeleteId);
  pendingDeleteId = null;
  if (!photo) return;

  showStatus('Deleting…', 'info', 30000);

  try {
    // 1. Remove from Storage
    const marker  = `/object/public/${BUCKET}/`;
    const path    = photo.storage_url.includes(marker)
      ? photo.storage_url.split(marker)[1]
      : null;

    if (path) {
      const { error: storageErr } = await sb.storage.from(BUCKET).remove([path]);
      if (storageErr) console.warn('[admin.js] Storage delete warning:', storageErr.message);
    }

    // 2. Delete DB row
    const { error: dbErr } = await sb.from('photos').delete().eq('id', photo.id);
    if (dbErr) throw dbErr;

    // 3. Remove from grid
    const card = photoGrid.querySelector(`[data-id="${photo.id}"]`);
    if (card) card.remove();

    allPhotos = allPhotos.filter(p => p.id !== photo.id);
    deselectPhoto();
    showStatus(`"${photo.title}" deleted.`, 'success');
  } catch (err) {
    console.error('[admin.js] Delete error:', err);
    showStatus(err.message || 'Delete failed.', 'error', 6000);
  }
});

// Close confirm modal on backdrop click
confirmModal.addEventListener('click', e => {
  if (e.target === confirmModal) {
    confirmModal.classList.remove('show');
    pendingDeleteId = null;
  }
});

// ── Init ─────────────────────────────────────────────────────────────────────

// Check for an existing session on page load (handles page refresh)
checkSession();

// Listen for auth state changes (handles sign-in/sign-out events from other tabs)
sb.auth.onAuthStateChange((_event, session) => {
  if (session) {
    showAdminPanel(session.user.email);
  } else {
    adminPanel.style.display = 'none';
    authScreen.style.display = 'flex';
  }
});
