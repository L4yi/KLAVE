// ============================================================
// KLAVE — Audio Player Engine (Mini Player & Full-Screen Player)
// ============================================================

const _fullUrlCache = {};
let _lastCountedPlayId = null;
let _playToken = 0;

let fpShuffle = false;
let fpRepeat = false;
let fpSeeking = false;
let fpOpen = false;

function previewCapped(beat) {
  if (!beat) return false;
  if (typeof isAdmin === 'function' && isAdmin()) return false;
  if (window._currentUser && beat.producerId && beat.producerId === window._currentUser.uid) return false;
  return true;
}

function previewSrc(b) {
  if (b.isMock) return ensureBotwAudio();
  if (b.previewUrl) return b.previewUrl;
  let u = b.audioUrl;
  if (!previewCapped(b) || !u || u.indexOf('/upload/') < 0) return u;
  let t = 'so_0,du_' + FREE_PREVIEW_SECONDS + ',br_128k';
  if (PREVIEW_TAG_ID) t += '/l_audio:' + PREVIEW_TAG_ID + '/fl_layer_apply';
  u = u.replace('/upload/', '/upload/' + t + '/');
  return u.replace(/\.(wav|mp3|m4a|flac|ogg)(\?.*)?$/i, '.mp3');
}

async function getFullAudioUrl(b) {
  if (_fullUrlCache[b.id]) return _fullUrlCache[b.id];
  const t = await window._auth.currentUser.getIdToken();
  const r = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
    body: JSON.stringify({ action: 'full', beatId: b.id })
  });
  const d = await r.json();
  if (!r.ok || !d.url) throw new Error(d.error || 'Could not load full audio');
  _fullUrlCache[b.id] = d.url;
  return d.url;
}

function buildWave() {
  const w = document.getElementById('mp-wave');
  if (!w) return;
  w.innerHTML = '';
  for (let i = 0; i < 60; i++) {
    const b = document.createElement('div');
    b.className = 'mpwb';
    b.style.height = (20 + Math.random() * 80) + '%';
    w.appendChild(b);
  }
}

function updWave() {
  const bars = document.querySelectorAll('.mpwb');
  const n = Math.floor(prog * bars.length);
  bars.forEach((b, i) => {
    b.classList.remove('lit', 'now');
    if (i < n) b.classList.add('lit');
    else if (i === n) b.classList.add('now');
  });
  if (typeof syncBotwPlayerUI === 'function') syncBotwPlayerUI();
}

function seekWave(e) {
  const r = e.currentTarget.getBoundingClientRect();
  prog = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  if (audioEl.duration) {
    let t = prog * audioEl.duration;
    if (previewCapped(cur) && t > FREE_PREVIEW_SECONDS) {
      t = FREE_PREVIEW_SECONDS;
      prog = t / audioEl.duration;
      toast('Preview ends at ' + FREE_PREVIEW_SECONDS + 's');
    }
    audioEl.currentTime = t;
  }
  updWave();
}

async function playBeat(id) {
  const b = findBeatById(id);
  if (!b) {
    toast('This beat is no longer available');
    return;
  }
  if (b.isMock) ensureBotwAudio();
  if (!b.audioUrl) {
    toast('No audio file for this beat');
    return;
  }

  const _tok = ++_playToken;
  cur = b;
  prog = 0;

  document.getElementById('mp-title').textContent = b.title;
  document.getElementById('mp-prod').textContent = 'prod. ' + b.prod + (previewCapped(b) ? ' · ' + FREE_PREVIEW_SECONDS + 's preview' : '');
  const th = document.getElementById('mp-thumb');
  if (b.coverUrl) {
    th.innerHTML = '<img src="' + escapeHtml(b.coverUrl) + '" style="width:100%;height:100%;object-fit:cover;" alt=""/>';
  } else {
    th.textContent = b.title[0];
  }
  document.getElementById('mini-player').classList.add('on');
  fpSync();

  let _src = previewSrc(b);
  if (!b.isMock && !previewCapped(b) && b.previewUrl && b.id && window._auth && window._auth.currentUser) {
    try {
      _src = await getFullAudioUrl(b);
    } catch (e) {
      console.warn(e);
    }
  }
  if (_tok !== _playToken) return;

  audioEl.src = _src;
  audioEl.currentTime = 0;
  try {
    await audioEl.play();
    playing = true;
    document.getElementById('mp-playbtn').textContent = '⏸';
    if (b.isMock) {
      if (_lastCountedPlayId !== b.id) {
        _lastCountedPlayId = b.id;
        b.plays = (b.plays || 0) + 1;
      }
    } else if (window._currentUser && b.id && _lastCountedPlayId !== b.id) {
      _lastCountedPlayId = b.id;
      window._updateDoc(window._doc(window._db, 'beats', b.id), { plays: window._increment(1) }).catch(() => {});
    }
    if (typeof syncBotwPlayerUI === 'function') syncBotwPlayerUI();
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    console.error('Playback failed:', e);
    toast('Playback failed: ' + e.message);
    playing = false;
    document.getElementById('mp-playbtn').textContent = '▶';
    if (typeof syncBotwPlayerUI === 'function') syncBotwPlayerUI();
  }
}

function togglePlay() {
  if (!cur) {
    toast('No beat selected');
    return;
  }
  if (playing) {
    audioEl.pause();
    playing = false;
    document.getElementById('mp-playbtn').textContent = '▶';
    if (typeof syncBotwPlayerUI === 'function') syncBotwPlayerUI();
  } else {
    audioEl.play().then(() => {
      playing = true;
      document.getElementById('mp-playbtn').textContent = '⏸';
      if (typeof syncBotwPlayerUI === 'function') syncBotwPlayerUI();
    }).catch(e => {
      if (e && e.name === 'AbortError') return;
      console.error('Playback failed:', e);
      toast('Playback failed: ' + e.message);
    });
  }
}

// ── FULL-SCREEN PLAYER ──
function fpFmt(s) {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function fpDuration() {
  if (!cur) return 0;
  const d = audioEl.duration;
  if (!isFinite(d) || !d) return previewCapped(cur) ? FREE_PREVIEW_SECONDS : 0;
  return previewCapped(cur) ? Math.min(d, FREE_PREVIEW_SECONDS) : d;
}

function fpPaintSeek() {
  const s = document.getElementById('fp-seek');
  if (!s) return;
  s.style.setProperty('--p', (s.value / 10) + '%');
}

function fpUpdateProgress() {
  if (!cur) return;
  const dur = fpDuration();
  const t = audioEl.currentTime || 0;
  if (!fpSeeking) {
    document.getElementById('fp-seek').value = dur ? Math.min(1000, Math.round((t / dur) * 1000)) : 0;
    document.getElementById('fp-cur').textContent = fpFmt(t);
  }
  document.getElementById('fp-dur').textContent = fpFmt(dur);
  fpPaintSeek();
  if (typeof syncBotwPlayerUI === 'function') syncBotwPlayerUI();
}

function fpUpdatePlayIcon() {
  const b = document.getElementById('fp-play');
  if (!b) return;
  b.classList.toggle('is-playing', !audioEl.paused && !audioEl.ended);
  if (typeof syncBotwPlayerUI === 'function') syncBotwPlayerUI();
}

function fpUpdateModes() {
  document.getElementById('fp-shuffle').classList.toggle('on', fpShuffle);
  document.getElementById('fp-repeat').classList.toggle('on', fpRepeat);
}

function fpTint(url) {
  const root = document.getElementById('full-player');
  root.style.setProperty('--fp-tint', '18,70,245');
  if (!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      if (!cur || cur.coverUrl !== url) return;
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, 8, 8);
      const d = x.getImageData(0, 0, 8, 8).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
        n++;
      }
      root.style.setProperty('--fp-tint', [r, g, b].map(v => Math.round((v / n) * 0.8)).join(','));
    } catch (e) {}
  };
  img.src = url;
}

function fpSync() {
  if (!cur || !document.getElementById('full-player')) return;
  const capped = previewCapped(cur);
  document.getElementById('fp-title').textContent = cur.title || '';
  document.getElementById('fp-prod').textContent = 'prod. ' + (cur.prod || '');
  document.getElementById('fp-ctx').textContent = ((cur.genre || '') + (cur.mood ? ' · ' + cur.mood : '')).toUpperCase() || 'KLAVE';
  document.getElementById('fp-art').innerHTML = cur.coverUrl
    ? '<img src="' + escapeHtml(cur.coverUrl) + '" alt=""/>'
    : '<div class="fp-art-ph"><span>' + escapeHtml((cur.title || '?')[0]) + '</span><div class="fp-art-wave">' + makeWaveBars(16) + '</div></div>';
  fpTint(cur.coverUrl);

  const chips = [];
  if (cur.bpm) chips.push(cur.bpm + ' BPM');
  if (cur.key) chips.push(cur.key);
  if (cur.genre) chips.push(cur.genre);
  if (cur.mood) chips.push(cur.mood);
  if (cur.plays) chips.push(cur.plays + ' plays');
  document.getElementById('fp-chips').innerHTML = chips.map(c => '<span class="fp-chip">' + escapeHtml(String(c)) + '</span>').join('');

  const price = document.getElementById('fp-price');
  const sub = document.getElementById('fp-price-sub');
  const buy = document.getElementById('fp-buy');
  if (!capped) {
    price.textContent = 'YOUR BEAT';
    sub.textContent = 'Full track unlocked';
    buy.style.display = 'none';
  } else if (cur.soldExclusive) {
    price.textContent = 'SOLD';
    sub.textContent = 'Exclusive rights have been sold';
    buy.style.display = 'none';
  } else {
    price.textContent = formatKlavePrice(cur.price);
    sub.textContent = cur.exclPrice ? ('Exclusive rights from ' + formatKlavePrice(cur.exclPrice)) : 'Standard license';
    buy.style.display = '';
  }
  document.getElementById('fp-note').textContent = capped ? (FREE_PREVIEW_SECONDS + 's preview') : '';
  fpUpdateModes();
  fpUpdateProgress();
  fpUpdatePlayIcon();
}

function openFullPlayer() {
  if (!cur) {
    toast('Play a beat first');
    return;
  }
  fpSync();
  document.getElementById('full-player').classList.add('on');
  fpOpen = true;
}

function closeFullPlayer() {
  document.getElementById('full-player').classList.remove('on');
  fpOpen = false;
}

function fpSeekInput() {
  fpSeeking = true;
  const dur = fpDuration();
  const v = document.getElementById('fp-seek').value;
  document.getElementById('fp-cur').textContent = fpFmt((v / 1000) * dur);
  fpPaintSeek();
}

function fpSeekCommit() {
  const dur = fpDuration();
  const v = document.getElementById('fp-seek').value;
  if (dur && audioEl.duration) {
    audioEl.currentTime = Math.min((v / 1000) * dur, audioEl.duration);
  }
  fpSeeking = false;
  fpUpdateProgress();
}

function fpStep(dir) {
  const list = getBeats().filter(b => b.audioUrl);
  if (!list.length) return;
  const i = list.findIndex(b => b === cur || (cur && b.id && b.id === cur.id));
  let n;
  if (fpShuffle && list.length > 1) {
    do {
      n = Math.floor(Math.random() * list.length);
    } while (n === i);
  } else {
    n = ((i < 0 ? 0 : i) + dir + list.length) % list.length;
  }
  const b = list[n];
  playBeat(b.id || getBeats().indexOf(b));
}

function fpPrev() {
  if (audioEl.currentTime > 3) {
    audioEl.currentTime = 0;
    return;
  }
  fpStep(-1);
}

function fpNext() {
  fpStep(1);
}

function fpToggleShuffle() {
  fpShuffle = !fpShuffle;
  fpUpdateModes();
  toast(fpShuffle ? 'Shuffle on' : 'Shuffle off');
}

function fpToggleRepeat() {
  fpRepeat = !fpRepeat;
  fpUpdateModes();
  toast(fpRepeat ? 'Repeat on' : 'Repeat off');
}

function fpBuy() {
  if (!cur) return;
  openCheckout(cur.id || getBeats().indexOf(cur));
}

function fpOpenProducer(e) {
  if (!cur || !cur.producerId) return;
  closeFullPlayer();
  viewProducer(cur.producerId, cur.prod, e);
}

async function fpShare() {
  if (!cur) return;
  const text = cur.title + ' — prod. ' + cur.prod + ' on KLAVE';
  try {
    if (navigator.share) {
      await navigator.share({ title: cur.title, text, url: location.origin });
      return;
    }
    await navigator.clipboard.writeText(text + ' ' + location.origin);
    toast('Link copied');
  } catch (e) {}
}

// Audio Element Event Listeners
audioEl.addEventListener('timeupdate', () => {
  if (audioEl.duration) {
    prog = audioEl.currentTime / audioEl.duration;
    updWave();
  }
  if (previewCapped(cur) && audioEl.currentTime >= FREE_PREVIEW_SECONDS) {
    audioEl.pause();
    playing = false;
    const btn = document.getElementById('mp-playbtn');
    if (btn) btn.textContent = '▶';
    if (typeof syncBotwPlayerUI === 'function') syncBotwPlayerUI();
    toast('Preview ends at ' + FREE_PREVIEW_SECONDS + 's — get the license for the full track');
  }
});

audioEl.addEventListener('ended', () => {
  if (fpRepeat) {
    audioEl.currentTime = 0;
    audioEl.play().then(() => {
      playing = true;
      const b = document.getElementById('mp-playbtn');
      if (b) b.textContent = '⏸';
    }).catch(() => {});
    return;
  }
  playing = false;
  prog = 0;
  updWave();
  const btn = document.getElementById('mp-playbtn');
  if (btn) btn.textContent = '▶';
  if (fpOpen) fpStep(1);
});

audioEl.addEventListener('error', () => {
  toast('Playback error — audio failed to load');
  playing = false;
  const btn = document.getElementById('mp-playbtn');
  if (btn) btn.textContent = '▶';
  if (typeof syncBotwPlayerUI === 'function') syncBotwPlayerUI();
});

['play', 'pause', 'playing', 'ended', 'emptied'].forEach(ev => audioEl.addEventListener(ev, fpUpdatePlayIcon));
['timeupdate', 'loadedmetadata', 'durationchange', 'emptied'].forEach(ev => audioEl.addEventListener(ev, fpUpdateProgress));

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && fpOpen) closeFullPlayer();
});
