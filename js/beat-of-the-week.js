// ============================================================
// KLAVE — Beat of the Week Feature (Frontend-Only, Mock Data)
// ============================================================

let _botwSelectedTier = 'mp3';

// Generates a real 30-second dark-trap synth & 808 preview loop in memory (WAV Blob URL)
// so the Beat of the Week card, mini-player, and full-screen player play & scrub
// with zero external network or database dependencies.
function ensureBotwAudio() {
  if (BOTW_MOCK.audioUrl) return BOTW_MOCK.audioUrl;
  const sr = 22050;
  const dur = 30;
  const len = sr * dur;
  const buf = new ArrayBuffer(44 + len * 2);
  const view = new DataView(buf);
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + len * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, len * 2, true);

  const stepDur = 60 / BOTW_MOCK.bpm / 4; // 16th note duration in seconds
  const notes = [277.18, 329.63, 311.13, 246.94, 277.18, 415.30, 369.99, 311.13]; // C# minor pluck motif
  const bass = [69.30, 69.30, 61.74, 82.41]; // C#2, B1, E2 808 root notes

  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const step = Math.floor(t / stepDur);
    const stepT = t - step * stepDur;
    const barStep = step % 16;

    // 808 sub + kick punch on steps 0, 6, 10, 12
    let sub = 0;
    if (barStep === 0 || barStep === 6 || barStep === 10 || barStep === 12) {
      const bFreq = bass[Math.floor(step / 16) % bass.length] + Math.exp(-stepT * 28) * 95;
      sub = Math.sin(2 * Math.PI * bFreq * stepT) * Math.exp(-stepT * 3.8) * 0.55;
    }

    // Dark bell pluck on even 16th steps
    const pFreq = notes[Math.floor(step / 2) % notes.length];
    const pluckEnv = Math.exp(-((t % (stepDur * 2)) * 9));
    const pluck = (Math.sin(2 * Math.PI * pFreq * t) + 0.35 * Math.sin(2 * Math.PI * pFreq * 2 * t)) * pluckEnv * 0.22;

    // Crisp trap hi-hat pattern (every 2 steps + roll on 13-15)
    let hat = 0;
    if (barStep % 2 === 0 || barStep >= 13) {
      hat = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * Math.exp(-stepT * 42) * 0.12;
    }

    const sample = Math.max(-1, Math.min(1, sub + pluck + hat));
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  BOTW_MOCK.audioUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return BOTW_MOCK.audioUrl;
}

function getBotwTierInfo(tierKey) {
  if (tierKey === 'wav') {
    return { key: 'wav', label: 'WAV + STEMS', sub: 'Trackouts · Verified', price: BOTW_MOCK.wavPrice, checkoutTier: 'standard' };
  }
  if (tierKey === 'excl') {
    return { key: 'excl', label: 'EXCLUSIVE RIGHTS', sub: 'Full Ownership', price: BOTW_MOCK.exclPrice, checkoutTier: 'exclusive' };
  }
  return { key: 'mp3', label: 'MP3 LEASE', sub: 'Basic · Non-excl.', price: BOTW_MOCK.price, checkoutTier: 'standard' };
}

function renderBeatOfTheWeek() {
  const wrap = document.getElementById('botw-section');
  if (!wrap) return;
  const b = BOTW_MOCK;
  const isPlayingBotw = Boolean(cur && cur.id === b.id && playing);
  const tierInfo = getBotwTierInfo(_botwSelectedTier);
  const waveHtml = b.waveHeights.map((h, idx) => {
    const pct = Math.max(18, Math.min(100, h));
    return '<div class="botw-wb" data-idx="' + idx + '" style="height:' + pct + '%"></div>';
  }).join('');

  wrap.innerHTML = ''
    + '<div class="section-head" style="margin-bottom:10px;">'
      + '<div class="section-title">BEAT OF THE WEEK</div>'
      + '<div class="section-more" style="cursor:default;color:var(--muted2);">' + escapeHtml(b.weekLabel) + '</div>'
    + '</div>'
    + '<div class="botw-card' + (isPlayingBotw ? ' is-playing' : '') + '" id="botw-card">'
      + '<div class="botw-grid"></div>'
      + '<div class="botw-glow"></div>'
      + '<div class="botw-inner">'
        + '<div class="botw-top">'
          + '<div class="botw-eyebrow"><span class="botw-dot"></span><span>// BEAT OF THE WEEK</span></div>'
          + '<div class="botw-verified" title="All ' + b.stemsVerified + ' stems uploaded and verified human-made">'
            + '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>'
            + '<span>100% HUMAN · ' + b.stemsVerified + ' STEMS</span>'
          + '</div>'
        + '</div>'
        + '<div class="botw-hero">'
          + '<div class="botw-art" onclick="toggleBotwPlay(event)" title="Play ' + escapeHtml(b.title) + '">'
            + '<div class="botw-art-rank">#1 PICK</div>'
            + '<div class="botw-art-monogram">' + escapeHtml(b.monogram) + '</div>'
            + '<div class="botw-art-eq">'
              + '<span style="height:45%"></span><span style="height:80%"></span><span style="height:55%"></span>'
              + '<span style="height:95%"></span><span style="height:60%"></span><span style="height:75%"></span>'
              + '<span style="height:40%"></span><span style="height:85%"></span>'
            + '</div>'
          + '</div>'
          + '<div class="botw-head">'
            + '<div class="botw-title-row">'
              + '<div class="botw-title">' + escapeHtml(b.title) + '</div>'
              + '<div class="botw-rating">★ ' + escapeHtml(b.rating) + ' (' + b.ratingCount + ')</div>'
            + '</div>'
            + '<div class="botw-prod-row">'
              + '<span class="botw-prod-av">' + escapeHtml(b.prod[0].toUpperCase()) + '</span>'
              + '<span>prod. <span class="botw-prod-name" onclick="botwViewProducer(event)">' + escapeHtml(b.prod) + '</span></span>'
              + '<span>·</span>'
              + '<span id="botw-plays-label">' + b.plays.toLocaleString() + ' plays</span>'
            + '</div>'
            + '<div class="botw-chips">'
              + '<span class="botw-chip accent">' + b.bpm + ' BPM</span>'
              + '<span class="botw-chip">' + escapeHtml(b.key) + '</span>'
              + '<span class="botw-chip">' + escapeHtml(b.genre) + '</span>'
              + '<span class="botw-chip">' + escapeHtml(b.mood) + '</span>'
            + '</div>'
          + '</div>'
        + '</div>'
        + '<div class="botw-player">'
          + '<button class="botw-play-btn" id="botw-play-btn" onclick="toggleBotwPlay(event)" aria-label="Play Beat of the Week">' + (isPlayingBotw ? '⏸' : '▶') + '</button>'
          + '<div class="botw-wave-wrap">'
            + '<div class="botw-wave" id="botw-wave" onclick="seekBotwWave(event)">' + waveHtml + '</div>'
            + '<div class="botw-wave-meta">'
              + '<span id="botw-time-readout">0:00 / 0:30 PREVIEW</span>'
              + '<span>TAP WAVE TO SEEK</span>'
            + '</div>'
          + '</div>'
        + '</div>'
        + '<div class="botw-nero">'
          + '<div class="botw-nero-head"><span>NERO CURATOR NOTE</span><span>AI VERIFIED</span></div>'
          + '<div class="botw-nero-text">' + escapeHtml(b.neroNote) + '</div>'
        + '</div>'
        + '<div class="botw-tiers">'
          + '<div class="botw-tier' + (_botwSelectedTier === 'mp3' ? ' on' : '') + '" onclick="selectBotwTier(\'mp3\',event)">'
            + '<span class="botw-tier-name">MP3</span>'
            + '<span class="botw-tier-price">' + formatKlavePrice(b.price) + '</span>'
            + '<span class="botw-tier-sub">Basic · Non-excl.</span>'
          + '</div>'
          + '<div class="botw-tier' + (_botwSelectedTier === 'wav' ? ' on' : '') + '" onclick="selectBotwTier(\'wav\',event)">'
            + '<span class="botw-tier-name">WAV + STEMS</span>'
            + '<span class="botw-tier-price">' + formatKlavePrice(b.wavPrice) + '</span>'
            + '<span class="botw-tier-sub">Trackouts incl.</span>'
          + '</div>'
          + '<div class="botw-tier' + (_botwSelectedTier === 'excl' ? ' on' : '') + '" onclick="selectBotwTier(\'excl\',event)">'
            + '<span class="botw-tier-name">EXCLUSIVE</span>'
            + '<span class="botw-tier-price">' + formatKlavePrice(b.exclPrice) + '</span>'
            + '<span class="botw-tier-sub">Full rights</span>'
          + '</div>'
        + '</div>'
        + '<div class="botw-footer">'
          + '<div class="botw-price-wrap">'
            + '<div class="botw-price-label" id="botw-sel-label">SELECTED · ' + escapeHtml(tierInfo.label) + '</div>'
            + '<div class="botw-price-val" id="botw-sel-price">' + formatKlavePrice(tierInfo.price) + '</div>'
          + '</div>'
          + '<div class="botw-cta-group">'
            + '<button class="botw-share-btn" onclick="shareBotw(event)" title="Share Beat of the Week" aria-label="Share Beat of the Week">'
              + '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>'
            + '</button>'
            + '<button class="botw-buy-btn" onclick="buyBotw(event)">GET LICENSE</button>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>';

  syncBotwPlayerUI();
}

function selectBotwTier(tierKey, e) {
  if (e) e.stopPropagation();
  _botwSelectedTier = tierKey;
  renderBeatOfTheWeek();
}

function toggleBotwPlay(e) {
  if (e) e.stopPropagation();
  ensureBotwAudio();
  if (cur && cur.id === BOTW_MOCK.id) {
    togglePlay();
    syncBotwPlayerUI();
  } else {
    playBeat(BOTW_MOCK.id);
  }
}

function seekBotwWave(e) {
  if (e) e.stopPropagation();
  ensureBotwAudio();
  const r = e.currentTarget.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  if (!cur || cur.id !== BOTW_MOCK.id) {
    playBeat(BOTW_MOCK.id).then(() => {
      if (audioEl.duration) {
        audioEl.currentTime = ratio * Math.min(audioEl.duration, FREE_PREVIEW_SECONDS);
      }
      prog = ratio;
      updWave();
      syncBotwPlayerUI();
    });
    return;
  }
  if (audioEl.duration) {
    const maxDur = Math.min(audioEl.duration, FREE_PREVIEW_SECONDS);
    audioEl.currentTime = ratio * maxDur;
    prog = audioEl.currentTime / audioEl.duration;
  } else {
    prog = ratio;
  }
  updWave();
  syncBotwPlayerUI();
}

function syncBotwPlayerUI() {
  const card = document.getElementById('botw-card');
  const btn = document.getElementById('botw-play-btn');
  const timeEl = document.getElementById('botw-time-readout');
  const playsEl = document.getElementById('botw-plays-label');
  const bars = document.querySelectorAll('#botw-wave .botw-wb');
  const isCurrent = Boolean(cur && cur.id === BOTW_MOCK.id);
  const isPlayingNow = Boolean(isCurrent && playing && !audioEl.paused);

  if (card) card.classList.toggle('is-playing', isPlayingNow);
  if (btn) btn.textContent = isPlayingNow ? '⏸' : '▶';
  if (playsEl) playsEl.textContent = BOTW_MOCK.plays.toLocaleString() + ' plays';

  const ratio = isCurrent ? prog : 0;
  const litCount = Math.floor(ratio * bars.length);
  bars.forEach((bar, i) => {
    bar.classList.remove('lit', 'now');
    if (isCurrent) {
      if (i < litCount) bar.classList.add('lit');
      else if (i === litCount && (isPlayingNow || ratio > 0)) bar.classList.add('now');
    }
  });

  if (timeEl) {
    const curSec = isCurrent ? Math.min(FREE_PREVIEW_SECONDS, Math.floor(audioEl.currentTime || 0)) : 0;
    timeEl.textContent = fpFmt(curSec) + ' / 0:' + String(FREE_PREVIEW_SECONDS).padStart(2, '0') + ' PREVIEW';
  }
}

function botwViewProducer(e) {
  if (e) e.stopPropagation();
  const match = getBeats().find(x => (x.prod || '').toLowerCase() === BOTW_MOCK.prod.toLowerCase() && x.producerId);
  if (match && match.producerId) {
    viewProducer(match.producerId, BOTW_MOCK.prod, e);
  } else {
    toast('Featured producer: @' + BOTW_MOCK.prod + ' · Verified Human-Made');
  }
}

function buyBotw(e) {
  if (e) e.stopPropagation();
  const tierInfo = getBotwTierInfo(_botwSelectedTier);
  openCheckout(BOTW_MOCK.id, e, tierInfo.checkoutTier);
}

async function shareBotw(e) {
  if (e) e.stopPropagation();
  const text = 'Beat of the Week on KLAVE: ' + BOTW_MOCK.title + ' (prod. ' + BOTW_MOCK.prod + ') — 100% Human-Made';
  try {
    if (navigator.share) {
      await navigator.share({ title: BOTW_MOCK.title, text, url: location.origin });
      return;
    }
    await navigator.clipboard.writeText(text + ' ' + location.origin);
    toast('Beat of the Week link copied ✓');
  } catch (err) {
    toast('Beat of the Week: ' + BOTW_MOCK.title + ' — prod. ' + BOTW_MOCK.prod);
  }
}
