// ============================================================
// KLAVE — Marketplace (Home, Search, Checkout & Plans)
// ============================================================

function renderHomeChips() {
  const hc = document.getElementById('home-chips');
  if (!hc) return;
  hc.innerHTML = '';
  const all = [{ name: 'All' }].concat(genres);
  all.forEach((g, i) => {
    const d = document.createElement('div');
    d.className = 'home-chip' + (i === 0 ? ' on' : '');
    d.textContent = g.name.toUpperCase();
    d.onclick = () => {
      hc.querySelectorAll('.home-chip').forEach(c => c.classList.remove('on'));
      d.classList.add('on');
      const list = g.name === 'All'
        ? getBeats()
        : getBeats().filter(b => (b.genre || '').toLowerCase() === g.name.toLowerCase());
      renderBeatCards(list);
    };
    hc.appendChild(d);
  });
}

function renderProducersStrip(list) {
  const ps = document.getElementById('producers-strip');
  if (!ps) return;
  ps.innerHTML = '';

  const groups = {};
  const order = [];
  list.forEach(b => {
    if (!b.prod) return;
    const key = b.producerId || ('name:' + b.prod);
    if (!groups[key]) {
      groups[key] = { beat: b, count: 0 };
      order.push(key);
    }
    const g = groups[key];
    g.count++;
    if ((b.createdAt?.seconds || 0) > (g.beat.createdAt?.seconds || 0)) g.beat = b;
  });

  if (order.length === 0) {
    ps.innerHTML = '<div class="empty-state" style="width:100%;"><div class="empty-state-icon">+</div><div class="empty-state-title">No producers yet</div><div class="empty-state-sub">Upload to be the first</div></div>';
    return;
  }

  order.slice(0, 8).forEach(key => {
    const b = groups[key].beat;
    const count = groups[key].count;
    const d = document.createElement('div');
    d.className = 'producer-chip';
    d.innerHTML = '<div class="producer-chip-av">' + (b.prod ? escapeHtml(b.prod[0]).toUpperCase() : '?') + '</div>'
      + '<div class="producer-chip-name">' + escapeHtml(b.prod) + '</div>'
      + '<div class="producer-chip-count">' + count + ' beat' + (count !== 1 ? 's' : '') + '</div>';
    d.style.cursor = 'pointer';
    d.onclick = e => viewProducer(b.producerId, b.prod, e);
    ps.appendChild(d);
  });
}

function renderBeatCards(list) {
  const cs = document.getElementById('cards-scroll');
  if (!cs) return;
  cs.innerHTML = '';
  if (!list || list.length === 0) {
    cs.innerHTML = '<div class="empty-state" style="width:100%;"><div class="empty-state-icon">♪</div><div class="empty-state-title">No beats yet</div><div class="empty-state-sub">Be the first to upload</div></div>';
    return;
  }
  list.slice(0, 6).forEach((b, i) => {
    const d = document.createElement('div');
    d.className = 'beat-card';
    d.style.animationDelay = (i * 0.06) + 's';
    const badge = b.exclPrice
      ? '<div class="bc-badge">Premium</div>'
      : (i === 0 ? '<div class="bc-badge">New</div>' : '');
    d.innerHTML = '<div class="bc-art">' + coverImg(b) + badge + (b.coverUrl ? '' : '<div class="bc-wave">' + makeWaveBars(24) + '</div>') + '<div class="bc-play-over">▶</div></div>'
      + '<div class="bc-title">' + escapeHtml(b.title) + '</div>'
      + '<div class="bc-prod">prod. <span class="prod-link" data-uid="' + escapeHtml(b.producerId || '') + '" data-name="' + escapeHtml(b.prod) + '" onclick="viewProducer(this.dataset.uid,this.dataset.name,event)">' + escapeHtml(b.prod) + '</span> · ' + (b.plays || 0) + ' plays</div>'
      + '<div class="bc-tiers"><div>MP3<b>' + formatKlavePrice(b.price) + '</b></div>' + (b.exclPrice ? '<div class="excl">EXCL<b>' + formatKlavePrice(b.exclPrice) + '</b></div>' : '') + '</div>';
    d.onclick = () => playBeat(b.id || i);
    cs.appendChild(d);
  });
}

function renderHome() {
  const list = getBeats();
  const bl = document.getElementById('beat-list');
  if (!bl) return;
  bl.innerHTML = '';

  // Always render Beat of the Week (uses frontend mock data)
  if (typeof renderBeatOfTheWeek === 'function') renderBeatOfTheWeek();

  renderHomeChips();
  renderProducersStrip(list);

  if (!list || list.length === 0) {
    document.getElementById('featured-tag').textContent = '// KLAVE';
    document.getElementById('featured-title').innerHTML = 'UPLOAD<br>YOUR BEAT';
    document.getElementById('featured-sub').textContent = 'Drop your first beat to get started';
    if (document.getElementById('featured-play')) document.getElementById('featured-play').style.display = 'none';
    renderBeatCards([]);
    bl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">+</div><div class="empty-state-title">Marketplace is empty</div><div class="empty-state-sub">Upload a beat to start</div></div>';
    return;
  }

  const top = list[0];
  document.getElementById('featured-tag').textContent = '// TRENDING NOW';
  document.getElementById('featured-title').innerHTML = escapeHtml(top.title).replace(' ', '<br>');
  document.getElementById('featured-sub').textContent = 'prod. ' + top.prod + ' • ' + (top.genre || '').toUpperCase() + ' • ' + (top.bpm || '') + ' BPM';
  if (document.getElementById('featured-play')) document.getElementById('featured-play').style.display = 'flex';

  renderBeatCards(list);

  list.forEach((b, i) => {
    const r = document.createElement('div');
    r.className = 'bl-row';
    r.style.animationDelay = (i * 0.04) + 's';
    const exclTag = b.exclPrice ? '<span class="bl-excl-tag">Excl</span>' : '';
    const isMine = window._currentUser && b.producerId === window._currentUser.uid;
    const actionBtn = isMine
      ? '<button class="report-btn" title="Delete" onclick="deleteBeat(\'' + (b.id || '') + '\',event)"><svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>'
      : '<button class="report-btn" data-title="' + escapeHtml(b.title) + '" onclick="openReport(this.dataset.title,event)" title="Report"><svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></button>';
    r.innerHTML = '<div class="bl-num">' + String(i + 1).padStart(2, '0') + '</div>'
      + '<div class="bl-art">' + coverImg(b) + (b.coverUrl ? '' : '<div class="bc-wave">' + makeWaveBars(12) + '</div>') + '</div>'
      + '<div class="bl-info"><div class="bl-title">' + escapeHtml(b.title) + exclTag + '</div><div class="bl-prod">prod. <span class="prod-link" data-uid="' + escapeHtml(b.producerId || '') + '" data-name="' + escapeHtml(b.prod) + '" onclick="viewProducer(this.dataset.uid,this.dataset.name,event)">' + escapeHtml(b.prod) + '</span> • ' + escapeHtml(b.genre) + '</div></div>'
      + '<div class="bl-price">' + formatKlavePrice(b.price) + '</div>'
      + '<button class="bl-buy" onclick="doBuy(\'' + (b.id || i) + '\',event)">BUY</button>' + actionBtn;
    r.addEventListener('click', e => {
      if (e.target.classList.contains('bl-buy')) return;
      playBeat(b.id || i);
    });
    bl.appendChild(r);
  });
}

function renderSearch(list) {
  const sr = document.getElementById('search-results');
  if (!sr) return;
  sr.innerHTML = '';
  const beatsList = list || getBeats();
  if (!beatsList || beatsList.length === 0) {
    sr.innerHTML = '<div class="empty-state"><div class="empty-state-icon">?</div><div class="empty-state-title">No beats found</div><div class="empty-state-sub">Try a different search</div></div>';
  }
  beatsList.forEach((b, i) => {
    const r = document.createElement('div');
    r.className = 'bl-row';
    r.style.animationDelay = (i * 0.04) + 's';
    const exclTag = b.exclPrice ? '<span class="bl-excl-tag">Excl</span>' : '';
    const isMine = window._currentUser && b.producerId === window._currentUser.uid;
    const actionBtn = isMine
      ? '<button class="report-btn" title="Delete" onclick="deleteBeat(\'' + (b.id || '') + '\',event)"><svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>'
      : '';
    r.innerHTML = '<div class="bl-num">' + String(i + 1).padStart(2, '0') + '</div>'
      + '<div class="bl-art">' + coverImg(b) + (b.coverUrl ? '' : '<div class="bc-wave">' + makeWaveBars(12) + '</div>') + '</div>'
      + '<div class="bl-info"><div class="bl-title">' + escapeHtml(b.title) + exclTag + '</div><div class="bl-prod">prod. <span class="prod-link" data-uid="' + escapeHtml(b.producerId || '') + '" data-name="' + escapeHtml(b.prod) + '" onclick="viewProducer(this.dataset.uid,this.dataset.name,event)">' + escapeHtml(b.prod) + '</span> • ' + escapeHtml(b.genre) + '</div></div>'
      + '<div class="bl-price">' + formatKlavePrice(b.price) + '</div>'
      + '<button class="bl-buy" onclick="doBuy(\'' + (b.id || i) + '\',event)">BUY</button>' + actionBtn;
    r.addEventListener('click', e => {
      if (e.target.classList.contains('bl-buy')) return;
      playBeat(b.id || i);
    });
    sr.appendChild(r);
  });

  const gg = document.getElementById('genre-grid');
  if (!gg) return;
  gg.innerHTML = '';
  genres.forEach(g => {
    const d = document.createElement('div');
    d.className = 'genre-card';
    const count = getBeats().filter(b => (b.genre || '').toLowerCase() === g.name.toLowerCase()).length;
    d.innerHTML = '<div class="genre-bg" style="background:' + g.color + '"></div><div class="genre-name">' + g.name + '</div><div class="genre-count">' + count + ' beats</div>';
    d.style.border = '1px solid ' + g.color + '33';
    d.onclick = () => {
      document.getElementById('search-input').value = g.name;
      searchBeats(g.name);
    };
    gg.appendChild(d);
  });
}

function searchBeats(q) {
  const queryText = (q || '').toLowerCase();
  const list = getBeats().filter(b =>
    (b.title || '').toLowerCase().includes(queryText) ||
    (b.prod || '').toLowerCase().includes(queryText) ||
    (b.genre || '').toLowerCase().includes(queryText)
  );
  renderSearch(q ? list : getBeats());
}

// ── BUY / CHECKOUT ──
let _checkoutBeat = null;
let _checkoutTier = 'standard';
let _lastPurchase = null;

function openCheckout(id, e, initialTier) {
  if (e) e.stopPropagation();
  if (!window._currentUser) {
    gated();
    return;
  }
  if (isAdmin()) {
    toast('Admin — purchase bypassed ✓');
    return;
  }
  const b = findBeatById(id);
  if (!b) {
    toast('This beat is no longer available');
    return;
  }
  _checkoutBeat = b;
  _checkoutTier = (initialTier === 'exclusive' && b.exclPrice) ? 'exclusive' : 'standard';
  document.getElementById('checkout-form-wrap').style.display = 'block';
  document.getElementById('checkout-success-wrap').style.display = 'none';
  document.getElementById('checkout-beat-name').textContent = b.title;
  document.getElementById('checkout-beat-prod').textContent = 'prod. ' + b.prod;

  const tiersWrap = document.getElementById('checkout-tiers');
  let tiersHtml = '<button class="report-opt' + (_checkoutTier === 'standard' ? ' on' : '') + '" onclick="selectCheckoutTier(this,\'standard\')">'
    + '<div class="checkout-price-row"><span>Standard License</span><b>' + formatKlavePrice(b.price) + '</b></div></button>';
  if (b.exclPrice) {
    tiersHtml += '<button class="report-opt' + (_checkoutTier === 'exclusive' ? ' on' : '') + '" onclick="selectCheckoutTier(this,\'exclusive\')">'
      + '<div class="checkout-price-row"><span>Exclusive Rights</span><b>' + formatKlavePrice(b.exclPrice) + '</b></div></button>';
  }
  tiersWrap.innerHTML = tiersHtml;

  const emailInput = document.getElementById('checkout-email');
  emailInput.value = window._currentUser.email || '';
  const emailEcho1 = document.getElementById('checkout-email-echo');
  if (emailEcho1) emailEcho1.textContent = emailInput.value || 'you';
  document.getElementById('checkout-modal').classList.add('on');
}

function selectCheckoutTier(btn, tier) {
  document.querySelectorAll('#checkout-tiers .report-opt').forEach(o => o.classList.remove('on'));
  btn.classList.add('on');
  _checkoutTier = tier;
}

function closeCheckout() {
  document.getElementById('checkout-modal').classList.remove('on');
  _checkoutBeat = null;
}

async function submitCheckout() {
  const b = _checkoutBeat;
  if (!b) {
    closeCheckout();
    return;
  }
  if (b.isMock) {
    toast('Demo mode — Beat of the Week uses mock data');
    return;
  }
  const email = document.getElementById('checkout-email').value.trim();
  if (!email || !email.includes('@')) {
    toast('Enter a valid email');
    return;
  }
  if (!window._currentUser.emailVerified && !(window._currentUser.providerData || []).some(p => p.providerId === 'google.com')) {
    toast('Verify your email first to buy a beat');
    return;
  }

  const amountUsd = _checkoutTier === 'exclusive' ? b.exclPrice : b.price;
  const btn = document.getElementById('checkout-submit-btn');
  btn.textContent = 'LOADING...';
  btn.disabled = true;

  let rate;
  try {
    rate = await getUsdToNgnRate();
  } catch (e) {
    toast('Could not load exchange rate. Try again.');
    btn.textContent = 'CONFIRM';
    btn.disabled = false;
    return;
  }

  const amountNgn = amountUsd * rate;
  const amountKobo = Math.round(amountNgn * 100);

  btn.textContent = 'OPENING PAYMENT...';

  const handler = PaystackPop.setup({
    key: PAYSTACK_PUBLIC_KEY,
    email: email,
    amount: amountKobo,
    currency: 'NGN',
    metadata: {
      beatId: b.id,
      buyerId: window._currentUser.uid,
      tier: _checkoutTier,
      email: email
    },
    callback: function (response) {
      verifyKlavePayment(response.reference);
    },
    onClose: function () {
      btn.textContent = 'CONFIRM';
      btn.disabled = false;
    }
  });

  handler.openIframe();
}

async function verifyKlavePayment(reference) {
  const btn = document.getElementById('checkout-submit-btn');
  btn.textContent = 'VERIFYING PAYMENT...';

  try {
    const vHeaders = { 'Content-Type': 'application/json' };
    try {
      if (window._currentUser) vHeaders.Authorization = 'Bearer ' + await window._currentUser.getIdToken();
    } catch (e) {}
    const res = await fetch('/api/verify-payment', {
      method: 'POST',
      headers: vHeaders,
      body: JSON.stringify({ reference })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      const buyerEmail = document.getElementById('checkout-email').value.trim();
      const emailEcho2 = document.getElementById('checkout-email-echo');
      if (emailEcho2) emailEcho2.textContent = buyerEmail;

      const downloadLink = document.getElementById('checkout-download-link');
      downloadLink.href = data.audioUrl;

      _lastPurchase = {
        beatTitle: _checkoutBeat ? _checkoutBeat.title : 'Beat',
        prod: _checkoutBeat ? _checkoutBeat.prod : '',
        tier: data.tier,
        amountPaidNaira: data.amountPaidNaira,
        buyerEmail,
        reference: data.reference,
        date: new Date().toLocaleDateString()
      };

      document.getElementById('checkout-form-wrap').style.display = 'none';
      document.getElementById('checkout-success-wrap').style.display = 'block';
    } else {
      toast('Payment could not be verified: ' + (data.error || 'unknown error'));
      btn.textContent = 'CONFIRM';
      btn.disabled = false;
    }
  } catch (e) {
    console.error('Verification failed:', e);
    toast('Something went wrong verifying your payment. Contact support with reference: ' + reference);
    btn.textContent = 'CONFIRM';
    btn.disabled = false;
  }
}

function downloadKlaveLicense() {
  const p = _lastPurchase;
  if (!p) {
    toast('No purchase found');
    return;
  }

  const licenseText = `KLAVE BEAT LICENSE AGREEMENT
=============================

Beat: ${p.beatTitle}
Producer: ${p.prod}
License Type: ${p.tier === 'exclusive' ? 'Exclusive Rights' : 'Standard License'}
Licensed To: ${p.buyerEmail}
Date: ${p.date}
Transaction Reference: ${p.reference}
Amount Paid: ₦${Number(p.amountPaidNaira).toLocaleString()}

${p.tier === 'exclusive' ? `
EXCLUSIVE RIGHTS TERMS
This license grants the artist full, exclusive ownership rights to this beat.
The producer will not resell, relicense, or redistribute this beat to any
other party from this date forward. The artist may use this beat for any
commercial or non-commercial purpose without further payment to the producer.
` : `
STANDARD LICENSE TERMS
This license grants the artist non-exclusive rights to use this beat in
recordings, performances, and distributed music (streaming, downloads,
video). The producer retains ownership and may license this same beat to
other artists. Artist may not claim exclusive ownership of the underlying
instrumental.
`}
This document serves as proof of purchase and license terms as of the
transaction date above. Contact ${p.buyerEmail === 'beatsbynorth21@gmail.com' ? 'support' : 'beatsbynorth21@gmail.com'} with questions regarding this license.
`;

  const blob = new Blob([licenseText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'KLAVE-License-' + p.beatTitle.replace(/\s+/g, '-') + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function doBuy(id, e) {
  openCheckout(id, e);
}

// ── PLAN TIERS ──
function loadPlansScreen() {
  const current = window._myTier || 'free';
  ['free', 'pro7', 'pro25'].forEach(t => {
    const card = document.getElementById('plan-card-' + t);
    const btn = document.getElementById('plan-btn-' + t);
    if (!card || !btn) return;
    card.classList.toggle('current', t === current);
    if (t === current) {
      btn.className = 'plan-card-btn plan-card-btn-current';
      btn.textContent = 'CURRENT PLAN';
      btn.onclick = null;
      if (PLAN_INFO[t].recurring && window._mySubCode) {
        btn.className = 'plan-card-btn plan-card-btn-cancel';
        btn.textContent = 'CANCEL SUBSCRIPTION';
        btn.onclick = () => cancelPlan();
      }
    } else if (t !== 'free') {
      btn.className = 'plan-card-btn plan-card-btn-active';
      btn.textContent = 'UPGRADE';
      btn.onclick = () => selectPlan(t);
    }
  });
}

async function selectPlan(tier) {
  const info = PLAN_INFO[tier];
  if (!window._currentUser) {
    gated();
    return;
  }
  if (isAdmin()) {
    try {
      await window._setDoc(window._doc(window._db, 'users', window._currentUser.uid), { tier, updatedAt: window._ts() }, { merge: true });
      window._myTier = tier;
      loadPlansScreen();
      toast('Admin — switched to ' + info.label + ' ✓');
    } catch (e) {
      toast('Could not update tier: ' + (e.message || 'error'));
    }
    return;
  }
  if (!info || !info.code) {
    toast('Plan unavailable right now');
    return;
  }
  if (!window._currentUser.emailVerified && !(window._currentUser.providerData || []).some(p => p.providerId === 'google.com')) {
    toast('Verify your email first to upgrade your plan');
    return;
  }

  const btn = document.getElementById('plan-btn-' + tier);
  const originalLabel = btn ? btn.textContent : 'UPGRADE';
  if (btn) {
    btn.textContent = 'LOADING...';
    btn.disabled = true;
  }

  const setupArgs = {
    key: PAYSTACK_PUBLIC_KEY,
    email: window._currentUser.email,
    amount: 10000,
    currency: 'NGN',
    plan: info.code,
    metadata: {
      uid: window._currentUser.uid,
      tier: tier,
      type: 'plan_upgrade'
    },
    callback: function (response) {
      verifyPlanPayment(response.reference, tier, btn, originalLabel);
    },
    onClose: function () {
      if (btn) {
        btn.textContent = originalLabel;
        btn.disabled = false;
      }
    }
  };

  const handler = PaystackPop.setup(setupArgs);
  handler.openIframe();
}

async function verifyPlanPayment(reference, tier, btn, originalLabel) {
  if (btn) btn.textContent = 'VERIFYING...';
  try {
    const res = await fetch('/api/verify-plan-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (await window._currentUser.getIdToken())
      },
      body: JSON.stringify({ reference, tier })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      toast('Plan upgraded — welcome to ' + PLAN_INFO[tier].label + '!');
      window._myTier = tier;
      window._mySubCode = data.subscriptionCode || null;
      loadPlansScreen();
    } else {
      toast('Could not verify payment: ' + (data.error || 'unknown error'));
    }
  } catch (e) {
    toast('Something went wrong verifying your payment. Contact support with reference: ' + reference);
  }
  if (btn) {
    btn.textContent = originalLabel;
    btn.disabled = false;
  }
}

async function cancelPlan() {
  if (!window._mySubCode) {
    toast('No active subscription found');
    return;
  }
  if (!confirm("Cancel your subscription? You'll keep access until the current period ends, then drop to the Free plan.")) return;
  try {
    const res = await fetch('/api/cancel-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (await window._currentUser.getIdToken())
      },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (res.ok && data.success) {
      toast("Subscription cancelled. You'll move to the Free plan at the end of this billing period.");
    } else {
      toast('Could not cancel: ' + (data.error || 'unknown error'));
    }
  } catch (e) {
    toast('Something went wrong cancelling your subscription.');
  }
}
