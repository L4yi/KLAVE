// ============================================================
// KLAVE — Producer Tools (Upload, Analytics, Mood Matcher,
// Producer Card & Public Producer Profile)
// ============================================================

async function refreshUploadTierUI() {
  const statusEl = document.getElementById('upload-tier-status');
  const exclWrap = document.getElementById('up-excl-wrap');
  const exclChip = document.getElementById('lc-excl');
  const pubBtn = document.getElementById('pub-btn');
  if (!statusEl || !pubBtn) return;
  if (!window._currentUser) {
    statusEl.style.display = 'none';
    return;
  }
  let tier = 'free';
  let beatsCount = 0;
  try {
    const snap = await window._getDoc(window._doc(window._db, 'users', window._currentUser.uid));
    if (snap.exists()) {
      const d = snap.data();
      tier = d.tier || 'free';
      beatsCount = d.beatsCount || 0;
    }
  } catch (e) {
    console.error('refreshUploadTierUI:', e);
  }
  if (tier !== 'free') {
    statusEl.style.display = 'none';
    if (exclWrap) exclWrap.style.display = 'block';
    if (exclChip) exclChip.style.display = 'block';
    pubBtn.disabled = false;
    return;
  }
  if (exclWrap) {
    exclWrap.style.display = 'none';
    document.getElementById('up-excl').value = '';
  }
  if (exclChip) exclChip.style.display = 'none';
  const remaining = Math.max(0, FREE_BEAT_LIMIT - beatsCount);
  statusEl.style.display = 'block';
  if (remaining > 0) {
    statusEl.textContent = 'Free plan — ' + beatsCount + ' of ' + FREE_BEAT_LIMIT + ' uploads used. Exclusive pricing unlocks on a paid plan.';
    pubBtn.disabled = false;
  } else {
    statusEl.textContent = 'Free plan limit reached (' + FREE_BEAT_LIMIT + ' beats). Upgrade to upload more.';
    pubBtn.disabled = true;
  }
}

function onFileSelect(input) {
  if (!input.files[0]) return;
  const f = input.files[0];
  if (f.size > 50 * 1024 * 1024) {
    toast('File too large. Max size is 50MB.');
    input.value = '';
    return;
  }
  const size = (f.size / 1024 / 1024).toFixed(1);
  document.getElementById('uh-fname').textContent = f.name + ' (' + size + 'MB)';
  document.getElementById('upload-hero').classList.add('has-file');

  const warn = document.getElementById('file-warn');
  const warnText = document.getElementById('file-warn-text');
  if (f.size > 15 * 1024 * 1024) {
    const isWav = f.name.toLowerCase().endsWith('.wav');
    warnText.textContent = isWav
      ? 'WAV file detected (' + size + 'MB). This may take a while on slow connections. Consider converting to MP3 first for faster uploads.'
      : 'Large file detected (' + size + 'MB). Upload may be slow on mobile. Recommended: keep files under 15MB.';
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
  if (window._currentUser) analyzeWithNero(f.name);
}

function cancelUpload() {
  if (window._activeXHR) {
    window._activeXHR.abort();
    window._activeXHR = null;
  }
  document.getElementById('upload-progress').style.display = 'none';
  document.getElementById('up-fill').style.width = '0%';
  document.getElementById('pub-btn').textContent = 'PUBLISH BEAT';
  document.getElementById('pub-btn').disabled = false;
  toast('Upload cancelled');
}

async function analyzeWithNero(filename) {
  const box = document.getElementById('nero-analyze');
  const content = document.getElementById('na-content');
  box.style.display = 'block';
  content.innerHTML = '<div class="na-loading"><div class="na-dot"></div><div class="na-dot"></div><div class="na-dot"></div></div>';
  try {
    const r = await fetch('/api/nero', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: 'A producer just uploaded a beat file named "' + filename + '". Based on the filename, suggest: 1) A cool beat title in caps, 2) likely genre, 3) suggested BPM range, 4) suggested price in USD ($15-$100). Keep it very short, one line each.'
        }]
      })
    });
    const data = await r.json();
    if (data.content?.[0]?.text) content.innerHTML = escapeHtml(data.content[0].text);
    else box.style.display = 'none';
  } catch (e) {
    box.style.display = 'none';
  }
}

function onCoverSelect(input) {
  const f = input.files[0];
  const prev = document.getElementById('cover-prev');
  if (!f) {
    prev.textContent = '🖼';
    return;
  }
  if (!f.type.startsWith('image/')) {
    toast('Choose an image file');
    input.value = '';
    return;
  }
  if (f.size > 5 * 1024 * 1024) {
    toast('Cover art must be under 5MB');
    input.value = '';
    return;
  }
  prev.innerHTML = '<img src="' + URL.createObjectURL(f) + '" alt=""/>';
}

async function uploadCover(file) {
  const _idToken = await window._auth.currentUser.getIdToken();
  const signRes = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + _idToken },
    body: JSON.stringify({ fileName: file.name, kind: 'cover' })
  });
  const sign = await signRes.json();
  if (sign.error) throw new Error(sign.error);
  const fd = new FormData();
  fd.append('file', file);
  fd.append('api_key', sign.apiKey);
  fd.append('timestamp', sign.timestamp);
  fd.append('signature', sign.signature);
  fd.append('public_id', sign.publicId);
  fd.append('upload_preset', sign.uploadPreset);
  const res = await fetch('https://api.cloudinary.com/v1_1/' + sign.cloudName + '/auto/upload', { method: 'POST', body: fd });
  const cd = await res.json();
  if (cd.error || !cd.secure_url) throw new Error((cd.error && cd.error.message) || 'Cover upload failed');
  return cd.secure_url;
}

function pickL(c) {
  document.querySelectorAll('.lc').forEach(x => x.classList.remove('on'));
  c.classList.add('on');
}

async function publishBeat() {
  if (!window._currentUser) {
    gated('upload');
    return;
  }
  const title = document.getElementById('up-title').value.trim();
  const bpm = document.getElementById('up-bpm').value.trim();
  const key = document.getElementById('up-key').value.trim();
  const genre = document.getElementById('up-genre').value;
  const mood = document.getElementById('up-mood').value;
  const price = document.getElementById('up-price').value.trim();
  const excl = document.getElementById('up-excl').value.trim();
  const audioFile = document.getElementById('af').files[0];

  if (!title || !price) {
    toast('Fill in title and price');
    return;
  }
  if (!audioFile) {
    toast('Select an audio file');
    return;
  }
  const priceNum = Number(price);
  const exclNum = excl ? Number(excl) : 0;
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    toast('Enter a valid price');
    return;
  }
  if (excl && (!Number.isFinite(exclNum) || exclNum < 0)) {
    toast('Enter a valid exclusive price');
    return;
  }

  const MIN_BASIC_PRICE = 5;
  const MIN_EXCL_PRICE = 25;
  if (priceNum < MIN_BASIC_PRICE) {
    toast('Minimum price is $' + MIN_BASIC_PRICE);
    return;
  }
  if (excl && exclNum < MIN_EXCL_PRICE) {
    toast('Minimum exclusive price is $' + MIN_EXCL_PRICE);
    return;
  }

  let _tier = 'free';
  let _beatsCount = 0;
  try {
    const uSnap = await window._getDoc(window._doc(window._db, 'users', window._currentUser.uid));
    if (uSnap.exists()) {
      const ud = uSnap.data();
      _tier = ud.tier || 'free';
      _beatsCount = ud.beatsCount || 0;
    }
  } catch (e) {}

  if (_tier === 'free' && _beatsCount >= FREE_BEAT_LIMIT) {
    toast('Free plan is capped at ' + FREE_BEAT_LIMIT + ' beats — upgrade to upload more');
    return;
  }
  if (_tier === 'free' && exclNum > 0) {
    toast('Exclusive pricing is a paid-tier feature — upgrade to unlock it');
    return;
  }

  const btn = document.getElementById('pub-btn');
  btn.textContent = 'UPLOADING...';
  btn.disabled = true;
  const progressWrap = document.getElementById('upload-progress');
  const upFill = document.getElementById('up-fill');
  const upPct = document.getElementById('up-pct');
  const upStatus = document.getElementById('up-status');
  progressWrap.style.display = 'block';
  upStatus.textContent = 'PREPARING UPLOAD...';
  upFill.style.width = '5%';
  upPct.textContent = '5%';

  try {
    const _idToken = await window._auth.currentUser.getIdToken();
    const signRes = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + _idToken },
      body: JSON.stringify({ fileName: audioFile.name })
    });
    const sign = await signRes.json();
    if (sign.error) throw new Error(sign.error);
    upStatus.textContent = 'UPLOADING AUDIO...';
    upFill.style.width = '15%';
    upPct.textContent = '15%';

    const fd = new FormData();
    fd.append('file', audioFile);
    fd.append('api_key', sign.apiKey);
    fd.append('timestamp', sign.timestamp);
    fd.append('signature', sign.signature);
    fd.append('public_id', sign.publicId);
    fd.append('upload_preset', sign.uploadPreset);
    if (sign.type) fd.append('type', sign.type);

    const cd = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      window._activeXHR = xhr;
      xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + sign.cloudName + '/auto/upload');
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const pct = 15 + Math.round((e.loaded / e.total) * 75);
          upFill.style.width = pct + '%';
          upPct.textContent = pct + '%';
        }
      };
      xhr.onload = () => {
        window._activeXHR = null;
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject(new Error('Bad response from Cloudinary'));
        }
      };
      xhr.onerror = () => {
        window._activeXHR = null;
        reject(new Error('Network error during upload'));
      };
      xhr.onabort = () => {
        window._activeXHR = null;
        reject(new Error('CANCELLED'));
      };
      xhr.send(fd);
    });

    if (cd.error) throw new Error(cd.error.message || 'Audio upload failed');
    if (!cd.secure_url) throw new Error('Audio upload failed');

    let coverUrl = '';
    const coverFile = document.getElementById('cover-input').files[0];
    if (coverFile) {
      upStatus.textContent = 'UPLOADING COVER...';
      upFill.style.width = '93%';
      upPct.textContent = '93%';
      try {
        coverUrl = await uploadCover(coverFile);
      } catch (ce) {
        console.error(ce);
        toast('Cover upload failed — publishing without it');
      }
    }

    upStatus.textContent = 'SAVING BEAT...';
    upFill.style.width = '95%';
    upPct.textContent = '95%';

    const newBeatRef = window._doc(window._collection(window._db, 'beats'));
    const batch = window._writeBatch(window._db);
    batch.set(newBeatRef, {
      title: title.toUpperCase(),
      bpm: Number(bpm) || 0,
      key,
      genre: genre.toLowerCase(),
      mood: mood.toLowerCase(),
      price: priceNum,
      exclPrice: exclNum,
      prod: window._currentDisplayName || window._currentUser.email.split('@')[0],
      producerId: window._currentUser.uid,
      producerTier: _tier,
      audioUrl: String(cd.secure_url).replace(/\/s--[^/]+--\//, '/'),
      ...(sign.previewUrl ? { previewUrl: sign.previewUrl } : {}),
      ...(coverUrl ? { coverUrl } : {}),
      duration: cd.duration || 0,
      createdAt: window._ts(),
      plays: 0
    });
    batch.update(window._doc(window._db, 'users', window._currentUser.uid), { beatsCount: window._increment(1) });
    await batch.commit();

    upFill.style.width = '100%';
    upPct.textContent = '100%';
    if (typeof window._loadBeats === 'function') await window._loadBeats();
    refreshUploadTierUI();
    toast('Beat published ✓');

    document.getElementById('af').value = '';
    document.getElementById('uh-fname').textContent = '';
    document.getElementById('cover-input').value = '';
    document.getElementById('cover-prev').textContent = '🖼';
    document.getElementById('upload-hero').classList.remove('has-file');
    document.getElementById('nero-analyze').style.display = 'none';
    document.getElementById('upload-progress').style.display = 'none';
    document.getElementById('up-fill').style.width = '0%';
    document.getElementById('up-title').value = '';
    document.getElementById('up-bpm').value = '';
    document.getElementById('up-price').value = '';
    setTimeout(() => navTo('home'), 1200);
  } catch (e) {
    if (e.message === 'CANCELLED') {
      toast('Upload cancelled');
    } else {
      toast('Failed to publish: ' + (e && e.message ? e.message : 'unknown error'));
      console.error(e);
    }
  }

  document.getElementById('upload-progress').style.display = 'none';
  document.getElementById('up-fill').style.width = '0%';
  btn.textContent = 'PUBLISH BEAT';
  btn.disabled = false;
}

async function deleteBeat(id, e) {
  if (e) e.stopPropagation();
  if (!id) {
    toast('Cannot delete this beat');
    return;
  }
  if (!window._currentUser) {
    toast('Sign in required');
    return;
  }
  if (!confirm('Delete this beat? This cannot be undone.')) return;
  try {
    await window._deleteDoc(window._doc(window._db, 'beats', id));
    if (window._firestoreBeats) {
      window._firestoreBeats = window._firestoreBeats.filter(b => b.id !== id);
    }
    toast('Beat deleted');
    if (typeof renderHome === 'function') renderHome();
    if (typeof renderSearch === 'function') renderSearch(getBeats());
  } catch (err) {
    console.error('Delete failed:', err);
    toast('Delete failed: ' + err.message);
  }
}

// ── ANALYTICS ──
function switchAnalytics(view, btn) {
  document.querySelectorAll('.at-btn').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  document.querySelectorAll('.an-view').forEach(v => v.classList.remove('active'));
  document.getElementById('an-' + view).classList.add('active');
  if (view === 'admin') loadAnalyticsAdmin();
}

function loadAnalyticsProducer() {
  const user = window._currentUser;
  if (!user) return;
  const uname = user.email.split('@')[0];
  const av = document.getElementById('an-prod-av');
  const nm = document.getElementById('an-prod-name');
  if (av) av.textContent = uname[0].toUpperCase();
  if (nm) nm.textContent = uname;

  if (window._db) {
    window._getDoc(window._doc(window._db, 'users', user.uid)).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        const name = data.displayName || uname;
        if (nm) nm.textContent = name;
        if (av && !user.photoURL) av.textContent = name[0].toUpperCase();
      }
    }).catch(() => {});

    window._getDocs(window._collection(window._db, 'beats')).then(snap => {
      const mine = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.producerId === user.uid);
      const cnt = document.getElementById('an-beat-count');
      if (cnt) cnt.textContent = mine.length;
      const listEl = document.getElementById('an-my-beats');
      if (listEl) {
        if (mine.length === 0) {
          listEl.innerHTML = '<div class="an-empty">You haven\'t uploaded any beats yet.</div>';
        } else {
          mine.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          listEl.innerHTML = mine.map((b, i) =>
            '<div class="an-beat-row"><div class="an-rank">' + String(i + 1).padStart(2, '0') + '</div><div class="an-thumb">' + escapeHtml((b.title || '?')[0]) + '</div><div class="an-info"><div class="an-beat-title">' + escapeHtml(b.title || '') + '</div><div class="an-beat-sub">' + escapeHtml(b.genre || '') + ' · ' + formatKlavePrice(b.price || 0) + '</div></div><div class="an-plays">' + (b.plays || 0) + ' plays</div></div>'
          ).join('');
        }
      }
      const salesEl = document.getElementById('an-my-sales');
      const earnEl = document.getElementById('an-my-earnings');
      if (salesEl) salesEl.textContent = '0';
      if (earnEl) earnEl.textContent = '$0';
    }).catch(() => {});
  }
}

function loadAnalyticsAdmin() {
  if (!window._db) return;
  window._getDocs(window._collection(window._db, 'beats')).then(snap => {
    const beatsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const totalEl = document.getElementById('an-total-beats');
    if (totalEl) totalEl.textContent = beatsList.length;

    const genreEl = document.getElementById('an-genre-breakdown');
    if (genreEl) {
      if (beatsList.length === 0) {
        genreEl.innerHTML = '<div class="an-empty">No beats yet.</div>';
      } else {
        const counts = {};
        beatsList.forEach(b => {
          const g = b.genre || 'other';
          counts[g] = (counts[g] || 0) + 1;
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        genreEl.innerHTML = sorted.map(([g, c]) => {
          const pct = Math.round((c / beatsList.length) * 100);
          return '<div class="an-genre-row"><div class="an-genre-label"><span>' + escapeHtml(g) + '</span><span>' + pct + '%</span></div><div class="an-bar-bg"><div class="an-bar-fill" style="width:' + pct + '%"></div></div></div>';
        }).join('');
      }
    }

    const recentEl = document.getElementById('an-recent-beats');
    if (recentEl) {
      if (beatsList.length === 0) {
        recentEl.innerHTML = '<div class="an-empty">No beats yet.</div>';
      } else {
        const recent = [...beatsList].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 5);
        recentEl.innerHTML = recent.map((b, i) =>
          '<div class="an-beat-row"><div class="an-rank">' + String(i + 1).padStart(2, '0') + '</div><div class="an-thumb">' + escapeHtml((b.title || '?')[0]) + '</div><div class="an-info"><div class="an-beat-title">' + escapeHtml(b.title || '') + '</div><div class="an-beat-sub">' + escapeHtml(b.prod || '') + '</div></div><div class="an-plays">' + (b.plays || 0) + ' plays</div></div>'
        ).join('');
      }
    }
  }).catch(() => {});

  window._getDocs(window._collection(window._db, 'users')).then(snap => {
    const el = document.getElementById('an-producer-count');
    if (el) el.textContent = snap.size;
  }).catch(() => {});

  const revEl = document.getElementById('an-total-revenue');
  if (revEl) revEl.textContent = '$0';
}

// ── MOOD MATCHER ──
function selectMood(btn) {
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  _selectedMood = btn.dataset.mood;
  document.getElementById('mood-ask-btn').disabled = false;
  document.getElementById('nero-response-box').classList.remove('on');
  document.getElementById('mood-beats').classList.remove('on');
  document.getElementById('mood-beats-label').style.display = 'none';
  document.getElementById('mood-beats').innerHTML = '';
  document.getElementById('nero-resp-text').textContent = '';
}

async function askMoodNero() {
  if (!_selectedMood) return;
  const btn = document.getElementById('mood-ask-btn');
  const respBox = document.getElementById('nero-response-box');
  const respText = document.getElementById('nero-resp-text');
  const beatsDiv = document.getElementById('mood-beats');
  const beatsLabel = document.getElementById('mood-beats-label');

  btn.disabled = true;
  btn.textContent = 'NERO IS THINKING...';
  respBox.classList.remove('on');
  beatsDiv.classList.remove('on');

  try {
    const r = await fetch('/api/nero', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: 'You are NERO inside KLAVE beat marketplace. Mood: ' + _selectedMood + '. Write 2 short sentences (max 40 words total) about what kind of beats match this mood and why. Be specific about sound. No filler phrases.'
        }]
      })
    });
    const data = await r.json();
    const text = data.content?.[0]?.text || NERO_FALLBACK[_selectedMood];
    respText.textContent = '';
    respBox.classList.add('on');
    let i = 0;
    const interval = setInterval(() => {
      respText.textContent += text[i];
      i++;
      if (i >= text.length) clearInterval(interval);
    }, 18);
  } catch (e) {
    respText.textContent = NERO_FALLBACK[_selectedMood];
    respBox.classList.add('on');
  }

  setTimeout(() => {
    const realBeats = getBeats();
    let pool = [];
    if (realBeats && realBeats.length > 0) {
      pool = realBeats.filter(b => (b.mood || '').toLowerCase() === _selectedMood.toLowerCase()).slice(0, 3);
      if (pool.length === 0) pool = realBeats.slice(0, 3);
    }
    if (pool.length === 0) pool = MOOD_POOL[_selectedMood] || [];
    beatsDiv.innerHTML = '';
    if (pool.length === 0) {
      beatsDiv.innerHTML = '<div style="font-family:var(--M);font-size:10px;color:var(--muted);letter-spacing:1px;padding:16px 0;">// No beats uploaded yet. Upload some beats first.</div>';
    } else {
      pool.forEach(b => {
        const row = document.createElement('div');
        row.className = 'mb-row';
        const icon = b.icon || b.title[0];
        const tag = b.tag || (b.genre || 'beat').toUpperCase();
        const price = b.price ? formatKlavePrice(b.price) : (b.price === '0' ? 'Free' : '—');
        const sub = 'prod. ' + (b.prod || '—') + ' · ' + (b.bpm || '—') + ' BPM';
        row.innerHTML = '<div class="mb-art">' + escapeHtml(icon) + '</div><div class="mb-info"><div class="mb-title">' + escapeHtml(b.title) + '</div><div class="mb-sub">' + escapeHtml(sub) + '</div></div><div class="mb-tag">' + escapeHtml(tag) + '</div><div class="mb-price">' + escapeHtml(price) + '</div>';
        row.onclick = () => toast('Opening beat...');
        beatsDiv.appendChild(row);
      });
    }
    beatsLabel.style.display = 'block';
    beatsDiv.classList.add('on');
  }, 600);

  btn.disabled = false;
  btn.textContent = 'ASK NERO AGAIN';
}

// ── PRODUCER CARD GENERATOR ──
async function generateCard() {
  const user = window._currentUser;
  if (!user) {
    toast('Sign in first');
    return;
  }
  const btn = document.querySelector('#s-profile button[onclick="generateCard()"]');
  if (btn) {
    btn.textContent = 'GENERATING...';
    btn.disabled = true;
  }
  try {
    const uname = user.email.split('@')[0];
    const name = window._currentDisplayName || uname;
    const handle = '@' + uname;

    let mine = [];
    if (window._db) {
      const snap = await window._getDocs(window._collection(window._db, 'beats'));
      mine = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.producerId === user.uid);
    }
    mine.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const latest = mine[0];

    document.getElementById('pcy-name').textContent = name;
    document.getElementById('pcy-av').textContent = name[0].toUpperCase();
    document.getElementById('pcy-handle').textContent = handle;
    document.getElementById('pcy-beats').textContent = mine.length;
    document.getElementById('pcy-sales').textContent = '0';
    document.getElementById('pcy-earnings').textContent = '$0';
    document.getElementById('pcy-topbeat').textContent = latest ? latest.title : 'No beats yet';
    document.getElementById('pcy-genre').textContent = latest ? (latest.genre || '').toUpperCase() : '—';
    document.getElementById('pcy-year').textContent = new Date().getFullYear();

    const card = document.getElementById('producer-card');
    card.style.display = 'block';
    document.getElementById('card-dl-btn').style.display = 'block';
    document.getElementById('card-share-hint').style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) {
    console.error('generateCard error:', e);
    toast('Failed to generate card');
  }
  if (btn) {
    btn.textContent = 'GENERATE CARD';
    btn.disabled = false;
  }
}

async function downloadCard() {
  const card = document.getElementById('producer-card');
  const btn = document.getElementById('card-dl-btn');
  btn.textContent = 'SAVING...';
  try {
    const canvas = await html2canvas(card, { scale: 3, useCORS: true, backgroundColor: null, logging: false });
    const link = document.createElement('a');
    link.download = 'klave-producer-card.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('Card saved ✓');
  } catch (e) {
    toast('Screenshot it instead.');
  }
  btn.textContent = 'DOWNLOAD CARD';
}

// ── PUBLIC PRODUCER PROFILE VIEW ──
let _viewedProducerUid = null;

function followDocId(targetUid) {
  return window._currentUser.uid + '_' + targetUid;
}

async function viewProducer(uid, fallbackName, e) {
  if (e) {
    e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
  }
  if (!uid) {
    toast('Producer info unavailable');
    return;
  }
  _viewedProducerUid = uid;
  navTo('producer-view');
  const av = document.getElementById('pv-av');
  const nameEl = document.getElementById('pv-name');
  const bioEl = document.getElementById('pv-bio');
  av.textContent = fallbackName ? fallbackName[0].toUpperCase() : '?';
  nameEl.textContent = fallbackName || '—';
  bioEl.textContent = 'Loading…';
  document.getElementById('pv-followers').textContent = '—';
  document.getElementById('pv-following').textContent = '—';
  document.getElementById('pv-follow-btn').style.display = 'none';

  const ownBeats = getBeats().filter(b => b.producerId === uid);
  document.getElementById('pv-beats-count').textContent = ownBeats.length;
  renderProducerBeats(ownBeats);

  try {
    const uSnap = await window._getDoc(window._doc(window._db, 'users', uid));
    const ud = uSnap.exists() ? uSnap.data() : {};
    const displayName = ud.displayName || fallbackName || 'Producer';
    nameEl.textContent = displayName;
    bioEl.textContent = ud.bio || 'No bio yet.';
    av.innerHTML = ud.photoURL
      ? '<img src="' + escapeHtml(ud.photoURL) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>'
      : escapeHtml((displayName[0] || '?').toUpperCase());

    const followsRef = window._collection(window._db, 'follows');
    window._getDocs(window._query(followsRef, window._where('followingId', '==', uid))).then(snap => {
      document.getElementById('pv-followers').textContent = snap.size;
    }).catch(() => {});
    window._getDocs(window._query(followsRef, window._where('followerId', '==', uid))).then(snap => {
      document.getElementById('pv-following').textContent = snap.size;
    }).catch(() => {});

    if (window._currentUser && window._currentUser.uid !== uid) {
      const btn = document.getElementById('pv-follow-btn');
      btn.style.display = 'block';
      const fSnap = await window._getDoc(window._doc(window._db, 'follows', followDocId(uid)));
      if (fSnap.exists()) {
        btn.textContent = 'FOLLOWING';
        btn.classList.add('following-on');
        btn.dataset.following = '1';
      } else {
        btn.textContent = 'FOLLOW';
        btn.classList.remove('following-on');
        btn.dataset.following = '0';
      }
    }
  } catch (err) {
    console.error('viewProducer failed:', err);
    bioEl.textContent = bioEl.textContent === 'Loading…' ? 'No bio yet.' : bioEl.textContent;
  }
}

function renderProducerBeats(list) {
  const wrap = document.getElementById('pv-beats-list');
  wrap.innerHTML = '';
  if (!list || list.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon">♪</div><div class="empty-state-title">No beats yet</div></div>';
    return;
  }
  list.forEach((b, i) => {
    const r = document.createElement('div');
    r.className = 'bl-row';
    r.style.animationDelay = (i * 0.04) + 's';
    const exclTag = b.exclPrice ? '<span class="bl-excl-tag">Excl</span>' : '';
    r.innerHTML = '<div class="bl-num">' + String(i + 1).padStart(2, '0') + '</div>'
      + '<div class="bl-art">' + coverImg(b) + (b.coverUrl ? '' : '<div class="bc-wave">' + makeWaveBars(12) + '</div>') + '</div>'
      + '<div class="bl-info"><div class="bl-title">' + escapeHtml(b.title) + exclTag + '</div><div class="bl-prod">' + escapeHtml(b.genre) + '</div></div>'
      + '<div class="bl-price">' + formatKlavePrice(b.price) + '</div>'
      + '<button class="bl-buy" onclick="doBuy(\'' + (b.id || i) + '\',event)">BUY</button>';
    r.addEventListener('click', e => {
      if (e.target.classList.contains('bl-buy')) return;
      playBeat(b.id || i);
    });
    wrap.appendChild(r);
  });
}

async function toggleFollowProducer() {
  if (!window._currentUser) {
    gated();
    return;
  }
  const uid = _viewedProducerUid;
  if (!uid || uid === window._currentUser.uid) return;
  const btn = document.getElementById('pv-follow-btn');
  const isFollowing = btn.dataset.following === '1';
  btn.disabled = true;
  try {
    const ref = window._doc(window._db, 'follows', followDocId(uid));
    if (isFollowing) {
      await window._deleteDoc(ref);
      btn.textContent = 'FOLLOW';
      btn.classList.remove('following-on');
      btn.dataset.following = '0';
    } else {
      await window._setDoc(ref, { followerId: window._currentUser.uid, followingId: uid, createdAt: window._ts() });
      btn.textContent = 'FOLLOWING';
      btn.classList.add('following-on');
      btn.dataset.following = '1';
    }
    window._getDocs(window._query(window._collection(window._db, 'follows'), window._where('followingId', '==', uid))).then(snap => {
      document.getElementById('pv-followers').textContent = snap.size;
    }).catch(() => {});
  } catch (e) {
    console.error('Follow toggle failed:', e);
    toast('Failed: ' + (e.message || 'try again'));
  }
  btn.disabled = false;
}
